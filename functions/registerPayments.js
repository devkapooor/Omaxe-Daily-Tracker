const p = require('./financeOperations');
const v = require('./vendorLedgerPolicy');
function createRegisterHandlers(ops) {
  const {
    db,
    ref,
    posRef,
    run
  } = ops;
  async function config(ctx, businessDate) {
    const cfg = (await ctx.tx.get(ref('appMetadata', 'vendorLedgerV2Config'))).data();
    if (cfg?.enabled !== true || !cfg.activationDate || businessDate && businessDate < cfg.activationDate) p.fail('Vendor ledger is disabled or the date is before activation.');
    return cfg;
  }
  async function vendor(ctx, vendorId) {
    const s = await ctx.tx.get(ref('vendorsV2', p.id(vendorId)));
    if (!s.exists || s.get('active') !== true) p.fail('Choose an active vendor.');
    return s.data();
  }
  async function availablePayable(ctx, vendorId, account) {
    const pending = await ctx.tx.get(db.collection('chequesV2').where('vendorId', '==', vendorId).where('status', 'in', ['issued', 'presented']).limit(201));
    if (pending.size > 200) p.fail('Vendor cheque history exceeds this compatibility bound.');
    const committed = pending.docs.filter(d => !d.get('trackingOnly') && ['issued', 'presented'].includes(d.get('status'))).reduce((sum, d) => p.safe(sum + p.paise(d.get('amountPaise'))), 0);
    return account.outstandingPaise - committed;
  }
  function queue(ctx, collection, key, value, create = false) {
    ctx.writes.push(() => create ? ctx.tx.create(ref(collection, key), value) : ctx.tx.set(ref(collection, key), value));
  }
  function outflow(ctx, d, kind, recipient, sourceId, funding, extra = {}) {
    const amount = p.paise(d.amountPaise),
      cash = d.mode === 'cash',
      modes = {
        cash: 'Cash',
        upi: 'UPI',
        card: 'Card',
        'bank-transfer': 'Bank Transfer',
        cheque: 'Cheque'
      };
    return {
      id: 'outflow-' + ctx.operationId,
      storeId: 'single-store',
      date: d.date || p.istDate(ctx.timestamp),
      paidTo: recipient,
      amount: amount / 100,
      amountPaise: amount,
      category: kind === 'vendor-payment' ? 'Vendor Payment' : p.text(d.category, 'Category'),
      paymentMode: modes[d.mode],
      approvedBy: ctx.actor.role === 'owner' ? ctx.actor.name : 'Posted; owner notified',
      sourceKind: kind,
      sourceRecordId: sourceId,
      postedByUid: ctx.actor.uid,
      postedByName: ctx.actor.name,
      postedByRole: ctx.actor.role,
      fundingSource: cash ? 'counter' : d.mode === 'cheque' ? 'cheque' : 'bank',
      fundingVersion: 1,
      reviewStatus: 'pending',
      revision: 1,
      notes: p.text(d.notes, 'Notes', true),
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
      ...(funding?.ledger ? {
        counterId: funding.ledger.counterSession.openingReconciliationId,
        handoverRevision: funding.ledger.revision + 1
      } : {}),
      ...extra
    };
  }
  function expenseIntent(d) {
    p.object(d, ['operationId', 'amountPaise', 'category', 'paidTo', 'mode', 'notes', 'chequeBookId', 'chequeNumber', 'chequeDate']);
    p.paise(d.amountPaise);
    p.text(d.paidTo, 'Recipient');
    p.text(d.category, 'Category');
    if (!['Rent', 'Electricity', 'Store Maintenance', 'Stock Delivery', 'Staff Welfare'].includes(d.category)) p.fail('Choose a supported expense category.', 'invalid-argument');
    if (p.text(d.notes, 'Notes', true).split(/\s+/).filter(Boolean).length > 50) p.fail('Expense notes cannot exceed 50 words.', 'invalid-argument');
    if (d.category === 'POS Refund' || d.category === 'Vendor Payment') p.fail('This category must use its linked source workflow.', 'invalid-argument');
    if (!['cash', 'upi', 'card', 'bank-transfer', 'cheque'].includes(d.mode)) p.fail('Unsupported payment method.', 'invalid-argument');
    return d;
  }
  async function expense(request) {
    const d = expenseIntent(request.data);
    if (d.mode === 'cheque') return cheque({
      ...request,
      data: {
        ...d,
        purpose: 'expense'
      }
    });
    return run(request, 'expense', d, p.STAFF, async ctx => {
      const funding = d.mode === 'cash' ? await ops.counter(ctx) : null;
      const record = outflow(ctx, {
        ...d,
        date: p.istDate(ctx.timestamp)
      }, 'expense', d.paidTo, 'outflow-' + ctx.operationId, funding);
      if (d.mode === 'cash') ops.debitCounter(ctx, funding, d.amountPaise);
      queue(ctx, 'cashouts', record.id, record, true);
      return record;
    });
  }
  async function settlement(request) {
    const d = p.object(request.data, ['operationId', 'id', 'vendorId', 'date', 'amountPaise', 'mode', 'invoiceId', 'notes']);
    p.id(d.id);
    p.id(d.vendorId);
    p.date(d.date);
    p.paise(d.amountPaise, 'Payment', 1);
    if (!['cash', 'upi', 'card', 'bank-transfer'].includes(d.mode)) p.fail('Unsupported settlement method.', 'invalid-argument');
    if (d.invoiceId) p.id(d.invoiceId);
    return run(request, 'vendor-payment', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'settlement.create');
      await config(ctx, d.date);
      const ven = await vendor(ctx, d.vendorId),
        account = (await ctx.tx.get(ref('vendorAccountStatesV2', d.vendorId))).data(),
        invoice = d.invoiceId ? (await ctx.tx.get(ref('invoiceStatesV2', d.invoiceId))).data() : undefined;
      if (!account) p.fail('Vendor outstanding evidence is missing.');
      if (d.amountPaise > (await availablePayable(ctx, d.vendorId, account))) p.fail('Payment exceeds payable available after issued cheque commitments.');
      if ((await ctx.tx.get(ref('vendorSettlementsV2', d.id))).exists) p.fail('This payment ID already exists. Recover its original operation.', 'already-exists');
      const funding = d.mode === 'cash' ? await ops.counter(ctx) : null;
      if (d.mode === 'cash' && d.date !== p.istDate(ctx.timestamp)) p.fail("A new counter payment must use today's business date.");
      const posting = v.buildSettlementPostingV2({
          ...d,
          actorUserId: ctx.actor.uid,
          timestamp: ctx.timestamp
        }, account, invoice),
        record = outflow(ctx, d, 'vendor-payment', ven.canonicalName, d.id, funding, {
          vendorId: d.vendorId,
          ...(d.invoiceId ? {
            invoiceId: d.invoiceId
          } : {})
        });
      queue(ctx, 'vendorSettlementsV2', d.id, {
        ...posting.settlement,
        outflowId: record.id,
        fundingVersion: 1,
        fundingSource: record.fundingSource,
        ...(record.counterId ? {
          counterId: record.counterId
        } : {})
      }, true);
      queue(ctx, 'vendorSettlementStatesV2', d.id, posting.settlementState, true);
      queue(ctx, 'vendorLedgerEntriesV2', posting.ledgerEntry.id, posting.ledgerEntry, true);
      queue(ctx, 'vendorAccountStatesV2', d.vendorId, posting.nextAccountState);
      if (posting.allocation) {
        queue(ctx, 'invoiceAllocationsV2', posting.allocation.id, posting.allocation, true);
        queue(ctx, 'invoiceStatesV2', d.invoiceId, posting.nextInvoiceState);
      }
      if (d.mode === 'cash') ops.debitCounter(ctx, funding, d.amountPaise);
      queue(ctx, 'cashouts', record.id, record, true);
      return {
        created: true,
        settlement: posting.settlement,
        outflow: record
      };
    });
  }
  async function createVendor(request) {
    const d = p.object(request.data, ['operationId', 'id', 'canonicalName', 'ownerName', 'aliases', 'contact', 'address', 'suppliedBrands', 'notes', 'openingBalancePaise', 'openingDate', 'openingReason']);
    p.id(d.id);
    return run(request, 'vendor-create', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'vendor.manage');
      await config(ctx, d.openingDate);
      if ((d.openingBalancePaise || 0) !== 0 && ctx.actor.role !== 'owner') p.fail('Only the owner may set an opening payable.', 'permission-denied');
      if (d.openingDate) p.date(d.openingDate);
      const posting = v.buildVendorCreationV2({
        ...d,
        actorUserId: ctx.actor.uid,
        timestamp: ctx.timestamp
      });
      if ((await ctx.tx.get(ref('vendorsV2', d.id))).exists) p.fail('Vendor already exists.', 'already-exists');
      for (const [collection, value] of [['vendorsV2', posting.vendor], ['vendorLedgerEntriesV2', posting.ledgerEntry], ['vendorAccountStatesV2', posting.accountState]]) if (value) queue(ctx, collection, value.id, value, true);
      return {
        created: true,
        vendor: posting.vendor
      };
    });
  }
  async function purchase(request) {
    const d = p.object(request.data, ['operationId', 'id', 'vendorId', 'invoiceNumber', 'invoiceDate', 'receiptDate', 'invoiceTotalPaise', 'category', 'notes']);
    return run(request, 'vendor-purchase', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'purchase.create');
      await config(ctx, p.date(d.invoiceDate));
      await vendor(ctx, p.id(d.vendorId));
      p.paise(d.invoiceTotalPaise, 'Invoice total', 1);
      const posting = v.buildPurchasePostingV2({
        ...d,
        actorUserId: ctx.actor.uid,
        timestamp: ctx.timestamp
      });
      const [source, reservation, accountSnapshot] = await Promise.all([ctx.tx.get(ref('purchasesV2', p.id(d.id))), ctx.tx.get(ref('invoiceReservationsV2', posting.reservation.id)), ctx.tx.get(ref('vendorAccountStatesV2', d.vendorId))]);
      if (source.exists || reservation.exists) p.fail('Invoice number or purchase reference already exists.', 'already-exists');
      const account = accountSnapshot.data();
      for (const [collection, value] of [['purchasesV2', posting.purchase], ['invoiceReservationsV2', posting.reservation], ['vendorLedgerEntriesV2', posting.ledgerEntry], ['invoiceStatesV2', posting.invoiceState]]) queue(ctx, collection, value.id, value, true);
      queue(ctx, 'vendorAccountStatesV2', d.vendorId, {
        ...(account || {
          id: d.vendorId,
          vendorId: d.vendorId
        }),
        outstandingPaise: p.safe((account?.outstandingPaise || 0) + d.invoiceTotalPaise),
        revision: (account?.revision || 0) + 1,
        lastLedgerEntryId: posting.ledgerEntry.id,
        updatedAt: ctx.timestamp,
        updatedByUserId: ctx.actor.uid
      });
      return {
        created: true,
        ...posting
      };
    });
  }
  async function cheque(request) {
    const d = p.object(request.data, ['operationId', 'purpose', 'chequeBookId', 'chequeNumber', 'vendorId', 'invoiceId', 'date', 'chequeDate', 'amountPaise', 'category', 'paidTo', 'mode', 'notes']);
    if (!['vendor-payment', 'expense'].includes(d.purpose)) p.fail('Invalid cheque purpose.', 'invalid-argument');
    p.paise(d.amountPaise, 'Cheque amount', 1);
    return run(request, 'cheque-issue', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'cheque.prepare');
            p.requireCapability(ctx.actor, 'cheque.issue');
      await config(ctx);
      const chequeDate = p.date(d.date || d.chequeDate),
        key = v.normalizeChequeNumber(d.chequeNumber),
        bookId = p.id(d.chequeBookId || 'book-1120-1199');
      const [existing, bookSnap] = await Promise.all([ctx.tx.get(ref('chequesV2', key)), ctx.tx.get(ref('chequeBooksV2', bookId))]);
      if (existing.exists) p.fail('This cheque number is already registered.', 'already-exists');
      const book = bookSnap.data();
      if (!book?.active || Number(key) < book.startNumber || Number(key) > book.endNumber || !Number.isSafeInteger(Number(key))) p.fail('Select a cheque leaf from an active book.');
      let ven, account, invoice;
      if (d.purpose === 'vendor-payment') {
        ven = await vendor(ctx, p.id(d.vendorId));
        account = (await ctx.tx.get(ref('vendorAccountStatesV2', d.vendorId))).data();
        if (!account || d.amountPaise > (await availablePayable(ctx, d.vendorId, account))) p.fail('Cheque exceeds available vendor payable.');
        if (d.invoiceId) {
          invoice = (await ctx.tx.get(ref('invoiceStatesV2', p.id(d.invoiceId)))).data();
          if (!invoice || invoice.vendorId !== d.vendorId || d.amountPaise > invoice.openAmountPaise - invoice.reservedAmountPaise) p.fail('Cheque exceeds available invoice amount.');
        }
      } else {
        p.text(d.category, 'Category');
        p.text(d.paidTo, 'Recipient');
        if (['POS Refund', 'Vendor Payment'].includes(d.category)) p.fail('Invalid expense cheque category.');
      }
      const pendingId = ven ? v.deterministicEventId('cheque', key, 1, 'pending-cheque') : null,
        sourceId = ven ? key : 'outflow-' + ctx.operationId;
      const record = {
        id: key,
        chequeBookId: bookId,
        chequeNumber: key,
        chequeNumberValue: Number(key),
        purpose: d.purpose,
        sourceRecordId: sourceId,
        ...(ven ? {
          vendorId: d.vendorId,
          pendingLedgerEntryId: pendingId
        } : {}),
        ...(d.invoiceId ? {
          invoiceId: d.invoiceId
        } : {}),
        date: chequeDate,
        amountPaise: d.amountPaise,
        status: 'issued',
        origin: 'v2',
        trackingOnly: false,
        revision: 1,
        createdAt: ctx.timestamp,
        createdByUserId: ctx.actor.uid,
        updatedAt: ctx.timestamp,
        updatedByUserId: ctx.actor.uid,
        fundingVersion: 1
      };
      if (ven) {
        queue(ctx, 'vendorLedgerEntriesV2', pendingId, {
          id: pendingId,
          vendorId: d.vendorId,
          eventType: 'pending-cheque',
          posting: 'informational',
          signedAmountPaise: -d.amountPaise,
          sourceType: 'cheque',
          sourceRecordId: key,
          sourceRevision: 1,
          occurredOn: chequeDate,
          createdAt: ctx.timestamp,
          createdByUserId: ctx.actor.uid
        }, true);
        queue(ctx, 'vendorAccountStatesV2', d.vendorId, {
          ...account,
          revision: account.revision + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid
        });
        if (invoice) {
          const allocationId = 'cheque:' + key + ':' + d.invoiceId;
          record.allocationId = allocationId;
          queue(ctx, 'invoiceAllocationsV2', allocationId, {
            id: allocationId,
            vendorId: d.vendorId,
            invoiceId: d.invoiceId,
            sourceType: 'cheque',
            sourceRecordId: key,
            amountPaise: d.amountPaise,
            state: 'reserved',
            revision: 1,
            createdAt: ctx.timestamp,
            createdByUserId: ctx.actor.uid
          }, true);
          queue(ctx, 'invoiceStatesV2', d.invoiceId, {
            ...invoice,
            reservedAmountPaise: invoice.reservedAmountPaise + d.amountPaise,
            revision: invoice.revision + 1,
            lastAllocationId: allocationId,
            updatedAt: ctx.timestamp,
            updatedByUserId: ctx.actor.uid
          });
        }
      } else {
        const entry = outflow(ctx, {
          ...d,
          date: p.istDate(ctx.timestamp),
          mode: 'cheque'
        }, 'expense', d.paidTo, sourceId, null, {
          chequeNumber: key,
          chequePayDate: chequeDate,
          paymentStatus: 'issued'
        });
        queue(ctx, 'cashouts', entry.id, entry, true);
      }
      queue(ctx, 'chequesV2', key, record, true);
      return {
        created: true,
        cheque: record
      };
    });
  }
  async function transitionCheque(request) {
    const d = p.object(request.data, ['operationId', 'chequeNumber', 'expectedRevision', 'toStatus', 'reason']);
    return run(request, 'cheque-decision', d, p.STAFF, async ctx => {
      const key = v.normalizeChequeNumber(d.chequeNumber),
        source = await ctx.tx.get(ref('chequesV2', key)),
        c = source.data();
      if (!c || c.trackingOnly || c.origin !== 'v2') p.fail('Legacy tracking-only cheques cannot post new financial effects.');
      v.assertExpectedRevision(c.revision, d.expectedRevision);
      if (d.toStatus === 'issued') p.requireCapability(ctx.actor, 'cheque.issue');else if (d.toStatus === 'presented') p.requireCapability(ctx.actor, 'cheque.present');else if (ctx.actor.role !== 'owner') p.fail('Only the owner can confirm debit or an exception.', 'permission-denied');
      let status = c.status;
      if (status === 'issued' && c.date <= p.istDate(ctx.timestamp)) status = 'presented';
      if (d.toStatus === 'not-yet') {
        if (ctx.actor.role !== 'owner') p.fail('Owner confirmation required.', 'permission-denied');
        if (!['issued', 'presented'].includes(status)) p.fail('This cheque is not pending.');
      } else if (d.toStatus === 'presented') {
        if (c.date > p.istDate(ctx.timestamp)) p.fail('The cheque is not due yet.');
        if (!['issued', 'presented'].includes(status)) p.fail('Cheque is not pending.');
      } else v.assertChequeTransition(status, d.toStatus);
      const next = {
          ...c,
          status: d.toStatus === 'not-yet' ? status : d.toStatus,
          revision: c.revision + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid,
          ...(d.toStatus === 'not-yet' ? {
            lastDebitCheckAt: ctx.timestamp,
            lastDebitCheckByUid: ctx.actor.uid
          } : {})
        },
        isDebit = d.toStatus === 'debited',
        isRelease = ['cancelled', 'bounced'].includes(d.toStatus);
      let account, invoice, expense;
      if (c.vendorId) {
        account = (await ctx.tx.get(ref('vendorAccountStatesV2', c.vendorId))).data();
        if (!account) p.fail('Vendor account source missing.');
        if (isDebit && c.amountPaise > account.outstandingPaise) p.fail('Cheque exceeds current vendor payable.');
        if (c.invoiceId) {
          invoice = (await ctx.tx.get(ref('invoiceStatesV2', c.invoiceId))).data();
          if (!invoice || invoice.reservedAmountPaise < c.amountPaise || invoice.openAmountPaise < c.amountPaise) p.fail('Cheque invoice reservation does not reconcile.');
        }
      } else if (c.purpose === 'expense') {
        expense = (await ctx.tx.get(ref('cashouts', c.sourceRecordId))).data();
        if (!expense || expense.chequeNumber !== key) p.fail('Expense cheque source missing.');
      }
      if (isDebit) {
        next.debitedAt = ctx.timestamp;
        if (c.vendorId) {
          const ledgerId = v.deterministicEventId('cheque', key, next.revision, 'cheque-debit');
          next.debitLedgerEntryId = ledgerId;
          queue(ctx, 'vendorLedgerEntriesV2', ledgerId, {
            id: ledgerId,
            vendorId: c.vendorId,
            eventType: 'cheque-debit',
            posting: 'financial',
            signedAmountPaise: -c.amountPaise,
            sourceType: 'cheque',
            sourceRecordId: key,
            sourceRevision: next.revision,
            occurredOn: p.istDate(ctx.timestamp),
            createdAt: ctx.timestamp,
            createdByUserId: ctx.actor.uid
          }, true);
          queue(ctx, 'vendorAccountStatesV2', c.vendorId, {
            ...account,
            outstandingPaise: account.outstandingPaise - c.amountPaise,
            revision: account.revision + 1,
            lastLedgerEntryId: ledgerId,
            updatedAt: ctx.timestamp,
            updatedByUserId: ctx.actor.uid
          });
          const out = outflow(ctx, {
            date: p.istDate(ctx.timestamp),
            mode: 'cheque',
            amountPaise: c.amountPaise,
            notes: 'Confirmed cheque debit'
          }, 'vendor-payment', (await vendor(ctx, c.vendorId)).canonicalName, key, null, {
            vendorId: c.vendorId,
            chequeNumber: key,
            chequePayDate: c.date,
            paymentStatus: 'debited'
          });
          queue(ctx, 'cashouts', out.id, out, true);
        } else if (expense) queue(ctx, 'cashouts', expense.id, {
          ...expense,
          paymentStatus: 'debited',
          revision: expense.revision + 1,
          updatedAt: ctx.timestamp,
          debitedAt: ctx.timestamp
        });
      }
      if (isRelease) {
        p.text(d.reason, 'Exception reason');
        next.exceptionReason = d.reason;
        if (expense) queue(ctx, 'cashouts', expense.id, {
          ...expense,
          paymentStatus: d.toStatus,
          revision: expense.revision + 1,
          updatedAt: ctx.timestamp
        });
        if (account) queue(ctx, 'vendorAccountStatesV2', c.vendorId, {
          ...account,
          revision: account.revision + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid
        });
      }
      if (invoice && (isDebit || isRelease)) {
        queue(ctx, 'invoiceStatesV2', c.invoiceId, {
          ...invoice,
          reservedAmountPaise: invoice.reservedAmountPaise - c.amountPaise,
          openAmountPaise: invoice.openAmountPaise - (isDebit ? c.amountPaise : 0),
          revision: invoice.revision + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid
        });
        const allocation = (await ctx.tx.get(ref('invoiceAllocationsV2', c.allocationId))).data();
        if (!allocation || allocation.state !== 'reserved') p.fail('Cheque allocation evidence is missing.');
        queue(ctx, 'invoiceAllocationsV2', c.allocationId, {
          ...allocation,
          state: isDebit ? 'posted' : 'released',
          revision: allocation.revision + 1,
          updatedAt: ctx.timestamp,
          updatedByUserId: ctx.actor.uid
        });
      }
      queue(ctx, 'chequesV2', key, next);
      return {
        cheque: next
      };
    });
  }
  async function presentDue(request) {
    p.object(request.data, ['chequeNumber']);
    return db.runTransaction(async tx => {
      await ops.actorFor(tx, request);
      const key = v.normalizeChequeNumber(request.data.chequeNumber),
        r = ref('chequesV2', key),
        s = await tx.get(r),
        c = s.data();
      if (!c) p.fail('Cheque not found.');
      if (c.status === 'issued' && !c.trackingOnly && c.origin === 'v2' && c.date <= p.istDate(new Date(ops.clock()).toISOString())) {
        const next = {
          ...c,
          status: 'presented',
          revision: c.revision + 1,
          updatedAt: new Date(ops.clock()).toISOString(),
          presentedAutomatically: true
        };
        tx.set(r, next);
        return next;
      }
      return c;
    });
  }
  return {
    expense,
    settlement,
    createVendor,
    purchase,
    cheque,
    transitionCheque,
    presentDue,
    config,
    vendor,
    queue
  };
}
module.exports = {
  createRegisterHandlers
};
