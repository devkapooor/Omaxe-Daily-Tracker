const { canonical } = require('./stockOperations');
const p = require('./financeOperations');
const v = require('./vendorLedgerPolicy');
function createVendorDecisionHandlers(ops, register) {
  const {
      db,
      ref,
      run
    } = ops,
    {
      config,
      vendor,
      queue
    } = register;
  function proposed(d) {
    p.object(d, ['date', 'amountPaise', 'mode', 'notes']);
    p.date(d.date);
    p.paise(d.amountPaise, 'Corrected amount', 1);
    if (!['cash', 'upi', 'card', 'bank-transfer'].includes(d.mode)) p.fail('Invalid payment method.');
    p.text(d.notes, 'Notes', true);
    return d;
  }
  async function apply(ctx, request) {
    const source = (await ctx.tx.get(ref('vendorSettlementsV2', request.sourceRecordId))).data(),
      state = (await ctx.tx.get(ref('vendorSettlementStatesV2', request.sourceRecordId))).data();
    if (!source || !state) p.fail('Original settlement evidence is missing.');
    const account = (await ctx.tx.get(ref('vendorAccountStatesV2', state.vendorId))).data(),
      invoice = state.invoiceId ? (await ctx.tx.get(ref('invoiceStatesV2', state.invoiceId))).data() : undefined;
    if (!account) p.fail('Vendor account evidence missing.');
    const correction = v.buildSettlementCorrectionV2(request, state, account, invoice, ctx.actor.uid, ctx.timestamp);
    let cashEffect = 'not-replayed',
      delta = state.amountPaise - request.proposed.amountPaise;
    if (source.fundingVersion === 1) {
      const old = (await ctx.tx.get(ref('cashouts', source.outflowId))).data();
      if (!old || old.sourceRecordId !== source.id) p.fail('Linked payment evidence missing.');
      const cashDelta = (state.mode === 'cash' ? state.amountPaise : 0) - (request.proposed.mode === 'cash' ? request.proposed.amountPaise : 0);
      if (cashDelta !== 0) {
        const latest = await ctx.tx.get(db.collection('dailyCashouts').orderBy('createdAt', 'desc').limit(1));
        if (!latest.empty && latest.docs[0].get('createdAt') >= source.createdAt) p.fail("This drawer payment is already inside a completed Cashout. Use an approved Cashout correction with its original source; do not debit or restore today's drawer.");
        const c = await ops.counter(ctx);
        if (c.ledger.counterSession.openingReconciliationId !== source.counterId) p.fail('The original payment counter is no longer open. Reconcile its original Cashout.');
        if (cashDelta < 0) ops.debitCounter(ctx, c, -cashDelta);else {
          ctx.writes.push(() => ctx.tx.set(c.ledgerRef, {
            ...c.ledger,
            cashNetPaise: p.safe(c.ledger.cashNetPaise + cashDelta),
            revision: c.ledger.revision + 1,
            lastOperation: 'payment',
            lastOperationId: ctx.operationId,
            updatedByUid: ctx.actor.uid
          }));
          ctx.writes.push(() => ctx.tx.set(c.cashierRef, {
            ...c.cashier,
            needsLogoutCheck: true,
            updatedAt: ctx.timestamp
          }));
        }
        cashEffect = 'original-open-counter';
      }
      queue(ctx, 'cashouts', old.id, {
        ...old,
        date: request.proposed.date,
        amount: request.proposed.amountPaise / 100,
        amountPaise: request.proposed.amountPaise,
        paymentMode: {
          'cash': 'Cash',
          'upi': 'UPI',
          'card': 'Card',
          'bank-transfer': 'Bank Transfer'
        }[request.proposed.mode],
        fundingSource: request.proposed.mode === 'cash' ? 'counter' : 'bank',
        notes: request.proposed.notes,
        revision: (old.revision || 1) + 1,
        lastCorrectionId: request.id,
        updatedAt: ctx.timestamp
      });
    }
    queue(ctx, 'vendorSettlementStatesV2', state.id, correction.nextState);
    if (correction.ledgerEntry) {
      queue(ctx, 'vendorLedgerEntriesV2', correction.ledgerEntry.id, correction.ledgerEntry, true);
      queue(ctx, 'vendorAccountStatesV2', state.vendorId, correction.nextAccountState);
    }
    if (correction.allocationAdjustment) {
      queue(ctx, 'invoiceAllocationsV2', correction.allocationAdjustment.id, correction.allocationAdjustment, true);
      queue(ctx, 'invoiceStatesV2', state.invoiceId, correction.nextInvoiceState);
    }
    queue(ctx, 'vendorLedgerCorrectionRequestsV2', request.id, {
      ...request,
      status: 'approved',
      reviewedAt: ctx.timestamp,
      reviewedByUserId: ctx.actor.uid,
      reviewedBy: ctx.actor.name,
      reviewReason: 'Approved by owner.',
      cashEffect,
      adjustmentPaise: delta
    });
    // Optional invoice effects are absent for vendor-account payments. Keep the
    // persisted operation result valid and identical on first response/recovery.
    return canonical(correction);
  }
  async function correct(request) {
    const d = p.object(request.data, ['operationId', 'id', 'sourceRecordId', 'expectedRevision', 'proposed', 'reason', 'applyImmediately']);
    p.id(d.id);
    p.id(d.sourceRecordId);
    proposed(d.proposed);
    p.text(d.reason, 'Correction reason');
    return run(request, 'vendor-correction', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'settlement.correct');
      await config(ctx, d.proposed.date);
      const [sourceSnap, stateSnap, pending] = await Promise.all([ctx.tx.get(ref('vendorSettlementsV2', d.sourceRecordId)), ctx.tx.get(ref('vendorSettlementStatesV2', d.sourceRecordId)), ctx.tx.get(db.collection('vendorLedgerCorrectionRequestsV2').where('sourceRecordId', '==', d.sourceRecordId).where('status', '==', 'pending').limit(1))]);
      const source = sourceSnap.data(),
        state = stateSnap.data();
      if (!source || !state) p.fail('Payment source missing.');
      v.assertExpectedRevision(state.revision, d.expectedRevision);
      if (!pending.empty) p.fail('A correction is already pending.');
      if (d.applyImmediately && ctx.actor.role !== 'owner') p.fail('Owner approval required.', 'permission-denied');
      const correction = v.buildSettlementCorrectionRequestV2({
        id: d.id,
        settlement: source,
        state,
        proposed: d.proposed,
        reason: d.reason,
        actor: {
          id: ctx.actor.uid,
          name: ctx.actor.name
        },
        timestamp: ctx.timestamp,
        requestType: d.applyImmediately ? 'owner-edit' : 'staff-request'
      });
      if (d.applyImmediately) return apply(ctx, correction);
      queue(ctx, 'vendorLedgerCorrectionRequestsV2', correction.id, correction, true);
      return correction;
    });
  }
  async function decision(request) {
    const d = p.object(request.data, ['operationId', 'requestId', 'decision', 'reason']);
    p.id(d.requestId);
    if (!['approve', 'reject', 'withdraw'].includes(d.decision)) p.fail('Invalid correction decision.');
    return run(request, 'vendor-correction-decision', d, p.STAFF, async ctx => {
      await config(ctx);
      const source = (await ctx.tx.get(ref('vendorLedgerCorrectionRequestsV2', d.requestId))).data();
      if (!source || source.status !== 'pending') p.fail('This correction is no longer pending.');
      if (d.decision === 'withdraw') {
        if (source.requestedByUserId !== ctx.actor.uid) p.fail('Only the requester can withdraw.', 'permission-denied');
      } else if (ctx.actor.role !== 'owner') p.fail('Only the owner may decide corrections.', 'permission-denied');
      if (d.decision === 'approve') return apply(ctx, source);
      const next = {
        ...source,
        status: d.decision === 'reject' ? 'rejected' : 'withdrawn',
        reviewedAt: ctx.timestamp,
        reviewedByUserId: ctx.actor.uid,
        reviewedBy: ctx.actor.name,
        reviewReason: d.decision === 'reject' ? p.text(d.reason, 'Decision reason') : 'Withdrawn by requester.'
      };
      queue(ctx, 'vendorLedgerCorrectionRequestsV2', source.id, next);
      return next;
    });
  }
  async function createReturn(request) {
    const d = p.object(request.data, ['operationId', 'id', 'vendorId', 'sourcePurchaseId', 'date', 'description', 'quantity', 'unit', 'valuePaise', 'reason']);
    p.id(d.id);
    p.id(d.vendorId);
    p.date(d.date);
    return run(request, 'vendor-return', d, p.STAFF, async ctx => {
      p.requireCapability(ctx.actor, 'return.create');
      await config(ctx, d.date);
      await vendor(ctx, d.vendorId);
      if ((await ctx.tx.get(ref('vendorReturnsV2', d.id))).exists) p.fail('Return reference already exists.');
      if (d.sourcePurchaseId) {
        const source = await ctx.tx.get(ref('purchasesV2', p.id(d.sourcePurchaseId)));
        if (source.get('vendorId') !== d.vendorId) p.fail('Invoice does not belong to this vendor.');
      }
      const result = v.buildVendorReturnV2({
        ...d,
        actorUserId: ctx.actor.uid,
        timestamp: ctx.timestamp
      });
      queue(ctx, 'vendorReturnsV2', d.id, result, true);
      return result;
    });
  }
  async function resolveReturn(request) {
    const d = p.object(request.data, ['operationId', 'returnId', 'expectedRevision', 'outcome', 'creditedValuePaise', 'outcomeReason', 'replacementReceivedAt']);
    if (!['vendor-credit', 'replacement', 'rejected'].includes(d.outcome)) p.fail('Invalid return outcome.');
    p.text(d.outcomeReason, 'Decision reason');
    return run(request, 'vendor-return-decision', d, ['owner'], async ctx => {
      await config(ctx);
      const source = (await ctx.tx.get(ref('vendorReturnsV2', p.id(d.returnId)))).data();
      if (!source) p.fail('Return missing.');
      v.assertExpectedRevision(source.revision, d.expectedRevision);
      const account = (await ctx.tx.get(ref('vendorAccountStatesV2', source.vendorId))).data();
      if (!account) p.fail('Vendor account missing.');
      if (d.replacementReceivedAt) p.date(d.replacementReceivedAt);
      const result = v.buildVendorReturnResolutionV2(source, account, {
        ...d,
        actor: {
          id: ctx.actor.uid,
          name: ctx.actor.name
        },
        timestamp: ctx.timestamp
      });
      if (result.ledgerEntry) {
        queue(ctx, 'vendorLedgerEntriesV2', result.ledgerEntry.id, result.ledgerEntry, true);
        queue(ctx, 'vendorAccountStatesV2', source.vendorId, result.nextAccountState);
      }
      queue(ctx, 'vendorReturnsV2', source.id, result.nextReturn);
      return result;
    });
  }
  async function reviewOutflow(request) {
    const d = p.object(request.data, ['operationId', 'outflowId', 'expectedRevision']);
    return run(request, 'outflow-review', d, ['owner'], async ctx => {
      const source = (await ctx.tx.get(ref('cashouts', p.id(d.outflowId)))).data();
      if (!source || !['expense', 'vendor-payment'].includes(source.sourceKind)) p.fail('Use the original source review for this entry.');
      v.assertExpectedRevision(source.revision || 1, d.expectedRevision);
      const next = {
        ...source,
        reviewStatus: 'reviewed',
        reviewedAt: ctx.timestamp,
        reviewedByUid: ctx.actor.uid
      };
      queue(ctx, 'cashouts', source.id, next);
      return next;
    });
  }
  async function cancelExpense(request) {
    const d = p.object(request.data, ['operationId', 'expenseId', 'expectedRevision', 'reason']);
    p.text(d.reason, 'Cancellation reason');
    return run(request, 'expense-cancel', d, ['owner'], async ctx => {
      const source = (await ctx.tx.get(ref('cashouts', p.id(d.expenseId)))).data();
      if (!source || source.sourceKind !== 'expense' || source.fundingVersion !== 1 || source.paymentStatus === 'cancelled') p.fail('Only a new ordinary expense may use this audited cancellation.');
      v.assertExpectedRevision(source.revision || 1, d.expectedRevision);
      if (source.paymentMode === 'Cheque') p.fail('Cancel this cheque through its owner exception workflow.');
      if (source.fundingSource === 'counter') {
        const latest = await ctx.tx.get(db.collection('dailyCashouts').orderBy('createdAt', 'desc').limit(1));
        if (!latest.empty && latest.docs[0].get('createdAt') >= source.createdAt) p.fail("Expense was included in a Cashout. Correct the original closing instead of restoring today's drawer.");
        const c = await ops.counter(ctx);
        if (c.ledger.counterSession.openingReconciliationId !== source.counterId) p.fail('Original counter is no longer open.');
        ctx.writes.push(() => ctx.tx.set(c.ledgerRef, {
          ...c.ledger,
          cashNetPaise: p.safe(c.ledger.cashNetPaise + source.amountPaise),
          revision: c.ledger.revision + 1,
          lastOperation: 'payment',
          lastOperationId: ctx.operationId,
          updatedByUid: ctx.actor.uid
        }));
      }
      const next = {
        ...source,
        paymentStatus: 'cancelled',
        cancelledAt: ctx.timestamp,
        cancelledByUid: ctx.actor.uid,
        cancellationReason: d.reason,
        revision: source.revision + 1,
        updatedAt: ctx.timestamp
      };
      queue(ctx, 'cashouts', source.id, next);
      return next;
    });
  }
  return {
    correct,
    decision,
    createReturn,
    resolveReturn,
    reviewOutflow,
    cancelExpense
  };
}
module.exports = {
  createVendorDecisionHandlers
};
