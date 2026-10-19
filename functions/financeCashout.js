const p = require('./financeOperations');
const c = require('./cashoutPolicy');
const v = require('./vendorLedgerPolicy');
function createCashoutHandlers(ops) {
  const {
    db,
    ref,
    posRef,
    run
  } = ops;
  function queue(ctx, col, key, value, create = false) {
    ctx.writes.push(() => create ? ctx.tx.create(ref(col, key), value) : ctx.tx.set(ref(col, key), value));
  }
  async function pages(tx, query) {
    let cursor,
      rows = [];
    do {
      const page = await tx.get((cursor ? query.startAfter(cursor) : query).limit(100));
      rows.push(...page.docs);
      if (rows.length > 2000) p.fail('This closing window exceeds the safe source bound. No totals were truncated.');
      cursor = page.size === 100 ? page.docs.at(-1) : null;
    } while (cursor);
    return rows;
  }
  async function summary(ctx, businessDate, ledger) {
    const latest = await ctx.tx.get(db.collection('dailyCashouts').where('date', '==', businessDate).orderBy('createdAt', 'desc').limit(1)),
      previous = latest.docs[0],
      after = previous?.get('createdAt') || '';
    function window(collection, field, value) {
      let q = db.collection(collection).where(field, '==', value).orderBy('createdAt');
      if (after) q = q.where('createdAt', '>', after);
      return q;
    }
    const [bills, events, outflows, refundDay] = await Promise.all([pages(ctx.tx, window(p.BASE + '/bills', 'businessDate', businessDate)), pages(ctx.tx, window(p.BASE + '/events', 'refundDate', businessDate)), pages(ctx.tx, window('cashouts', 'date', businessDate)), ctx.tx.get(posRef('refundDays', businessDate))]);
    const gross = {
      cash: 0,
      upi: 0,
      card: 0,
      bankTransfer: 0
    };
    let cashRefund = 0,
      allRefund = 0,
      ordinary = 0,
      vendor = 0,
      legacyUntracked = 0;
    for (const bill of bills) {
      const state = (await ctx.tx.get(posRef('billStates', bill.id))).data();
      if (state?.state === 'voided') continue;
      for (const payment of bill.get('payments') || []) {
        if (payment.method === 'bank-transfer') gross.bankTransfer = p.safe(gross.bankTransfer + p.paise(payment.amountPaise));else if (Object.hasOwn(gross, payment.method)) gross[payment.method] = p.safe(gross[payment.method] + p.paise(payment.amountPaise));else p.fail('A bill contains an unsupported recorded payment method.');
      }
    }
    for (const event of events) if (event.get('type') === 'bill-return-approved') {
      const amount = p.paise(event.get('refundAmountPaise'));
      allRefund = p.safe(allRefund + amount);
      if (event.get('refundMethod') === 'cash') cashRefund = p.safe(cashRefund + amount);
    }
    for (const out of outflows) {
      if (out.get('paymentMode') !== 'Cash' || out.get('paymentStatus') === 'cancelled' || out.get('sourceKind') === 'pos-return') continue;
      const amount = p.rupees(out.get('amount'));
      if (out.get('fundingVersion') !== 1) {
        legacyUntracked = p.safe(legacyUntracked + amount);
        continue;
      }
      if (out.get('sourceKind') === 'vendor-payment') vendor = p.safe(vendor + amount);else if (out.get('sourceKind') === 'expense') ordinary = p.safe(ordinary + amount);
    }
    const expected = p.expectedCash(ledger);
    return {
      date: businessDate,
      grossMethods: gross,
      cashRefundPaise: cashRefund,
      windowRefundPaise: allRefund,
      ordinaryCashExpensePaise: ordinary,
      vendorCashPaymentPaise: vendor,
      cashPaidOutPaise: p.safe(cashRefund + ordinary + vendor),
      netCashCollectionsPaise: gross.cash - cashRefund,
      expectedDrawerPaise: expected,
      openingCheckpointPaise: ledger.checkpoint.cashActualPaise,
      subsequentNetCashPaise: ledger.cashNetPaise - ledger.checkpoint.cashNetPaise,
      checkpointId: ledger.checkpoint.reconciliationId,
      legacyUntrackedCashOutflowPaise: legacyUntracked,
      posRefundDayRevision: refundDay.exists ? refundDay.get('revision') : 0,
      posRefundDayTotalPaise: refundDay.exists ? refundDay.get('cashRefundPaise') : 0,
      handoverRevision: ledger.revision,
      sourceOutflowIds: outflows.filter(s => s.get('fundingVersion') === 1).map(s => s.id)
    };
  }
  async function prepare(request) {
    const d = p.object(request.data, ['operationId', 'date']);
    p.date(d.date);
    return run(request, 'cashout-count-start', d, p.STAFF, async ctx => {
      const counter = await ops.counter(ctx, {
        businessDate: d.date,
        allowOwnerWithoutJoining: true
      });
      const totals = await summary(ctx, d.date, counter.ledger),
        reservation = {
          id: ctx.operationId,
          uid: ctx.actor.uid,
          name: ctx.actor.name,
          authTime: request.auth.token.auth_time,
          kind: 'cashout',
          date: d.date,
          revision: counter.ledger.revision,
          startedAt: p.Timestamp.fromMillis(ctx.nowMs)
        },
        result = {
          ...totals,
          id: ctx.operationId,
          actorUid: ctx.actor.uid,
          reservationId: ctx.operationId,
          expiresAtMs: ctx.nowMs + 300000,
          handoverRevision: counter.ledger.revision + 1,
          createdAt: ctx.timestamp
        };
      queue(ctx, 'financeCashoutQuotes', ctx.operationId, result, true);
      ctx.writes.push(() => ctx.tx.set(counter.ledgerRef, {
        ...counter.ledger,
        countReservation: reservation,
        revision: counter.ledger.revision + 1,
        lastOperation: 'count-reserve',
        lastOperationId: ctx.operationId,
        updatedByUid: ctx.actor.uid
      }));
      return result;
    });
  }
  async function cancel(request) {
    const d = p.object(request.data, ['operationId', 'quoteId']);
    return run(request, 'cashout-count-cancel', d, p.STAFF, async ctx => {
      const quote = (await ctx.tx.get(ref('financeCashoutQuotes', p.id(d.quoteId)))).data(),
        l = await ctx.tx.get(posRef('handover', 'main'));
      if (!quote || quote.actorUid !== ctx.actor.uid && ctx.actor.role !== 'owner') p.fail('Only this count actor or the owner can cancel it.', 'permission-denied');
      if (quote.closedAt) p.fail('This count already closed the drawer.');
      if (l.get('countReservation.id') === quote.reservationId) {
        ctx.writes.push(() => ctx.tx.update(posRef('handover', 'main'), {
          countReservation: null,
          revision: l.get('revision') + 1,
          lastOperation: 'count-release',
          lastOperationId: ctx.operationId,
          updatedByUid: ctx.actor.uid
        }));
      }
      queue(ctx, 'financeCashoutQuotes', d.quoteId, {
        ...quote,
        cancelledAt: ctx.timestamp
      });
      return {
        id: d.quoteId,
        cancelled: true
      };
    });
  }
  function denominations(input) {
    p.object(input, ['denom500', 'denom200', 'denom100', 'denom50', 'denom20', 'denom10', 'change']);
    let total = 0;
    for (const amount of [500, 200, 100, 50, 20, 10]) {
      const count = p.paise(input['denom' + amount], 'Denomination count');
      if (count > 1000000) p.fail('Denomination count is too large.');
      total = p.safe(total + count * amount * 100);
    }
    return p.safe(total + p.rupees(input.change, 'Loose change'));
  }
  async function close(request) {
    const d = p.object(request.data, ['operationId', 'quoteId', 'drawerDenominations', 'creditSales', 'reason']);
    const counted = denominations(d.drawerDenominations),
      credit = p.rupees(d.creditSales || 0, 'Declared credit sales');
    return run(request, 'cashout-close', d, p.STAFF, async ctx => {
      const quote = (await ctx.tx.get(ref('financeCashoutQuotes', p.id(d.quoteId)))).data();
      if (!quote || quote.actorUid !== ctx.actor.uid || quote.cancelledAt || quote.closedAt) p.fail('This counting quote is unavailable. Recover its original result or start a new count.');
      if (ctx.nowMs >= quote.expiresAtMs) p.fail('Count expired. Cancel it and begin a fresh count.');
      const counter = await ops.counter(ctx, {
        businessDate: quote.date,
        allowReservation: quote.reservationId,
        allowOwnerWithoutJoining: true
      });
      if (counter.ledger.countReservation?.id !== quote.reservationId || counter.ledger.countReservation?.uid !== ctx.actor.uid || counter.ledger.revision !== quote.handoverRevision) p.fail('Counter activity changed. Cancel and start a fresh count.');
      const totals = await summary(ctx, quote.date, counter.ledger);
      for (const key of ['expectedDrawerPaise', 'cashRefundPaise', 'windowRefundPaise', 'ordinaryCashExpensePaise', 'vendorCashPaymentPaise', 'posRefundDayRevision', 'posRefundDayTotalPaise']) if (totals[key] !== quote[key]) p.fail('Source totals changed during counting. Recount with a fresh quote.');
      const difference = totals.expectedDrawerPaise - counted;
      if (difference !== 0) p.text(d.reason, 'Discrepancy reason');
      const id = 'daily-cashout-' + ctx.operationId,
        controlRef = ref('cashMovementControl', 'main'),
        control = await ctx.tx.get(controlRef),
        holderRecords = await ops.holderRecords(ctx.tx),
        salesId = 'sale-single-store-' + quote.date,
        salesSnapshot = await ctx.tx.get(ref('sales', salesId)),
        existingSales = salesSnapshot.data();
      const now = ctx.timestamp,
        g = totals.grossMethods,
        audit = c.calculateCashoutAudit(totals.expectedDrawerPaise / 100, counted / 100),
        entry = {
          id,
          date: quote.date,
          recordedBy: ctx.actor.name,
          recordedByUserId: ctx.actor.uid,
          cashSales: g.cash / 100,
          upiSales: g.upi / 100,
          cardSales: g.card / 100,
          bankTransferSales: g.bankTransfer / 100,
          creditSales: credit / 100,
          returns: totals.windowRefundPaise / 100,
          cashExpense: totals.cashPaidOutPaise / 100,
          cashAudit: totals.expectedDrawerPaise / 100,
          drawerTotal: counted / 100,
          drawerDenominations: d.drawerDenominations,
          remainingBalance: counted / 100,
          actualCashParticulars: c.formatDrawerParticulars(d.drawerDenominations, true),
          pendingCashParticulars: 'By: ' + ctx.actor.name + '\nExpected Cash: ' + totals.expectedDrawerPaise / 100 + '\nDrawer Total: ' + counted / 100,
          createdAt: now,
          revision: 1,
          refundAccountingVersion: 1,
          posCashRefundPaise: totals.cashRefundPaise,
          posRefundDayRevision: totals.posRefundDayRevision,
          posRefundDayTotalPaise: totals.posRefundDayTotalPaise,
          posSourceHandoverRevision: counter.ledger.revision,
          drawerClosureId: id,
          cashRemovedPaise: counted,
          closingDrawerPaise: 0,
          financePostingVersion: 1,
          financeQuoteId: quote.id,
          sourceOperationId: ctx.operationId,
          sourceTotals: totals,
          discrepancyReason: p.text(d.reason, 'Reason', true),
          reviewStatus: difference ? 'pending' : 'matched',
          ...audit
        };
      const balances = ops.holderBalances(holderRecords, entry);
      if (balances.some(b => b.amountPaise < 0)) p.fail('Holder balances do not reconcile. No closing was posted.');
      entry.holderBalancesAtClose = balances;
      entry.holderBalancesRevision = (control.get('revision') || 0) + 1;
      const grossTotal = (g.cash + g.upi + g.card + g.bankTransfer + credit) / 100,
        sales = {
          ...(existingSales || {}),
          id: salesId,
          storeId: 'single-store',
          date: quote.date,
          cashSales: (existingSales?.cashSales || 0) + entry.cashSales,
          upiSales: (existingSales?.upiSales || 0) + entry.upiSales,
          cardSales: (existingSales?.cardSales || 0) + entry.cardSales,
          bankTransferSales: (existingSales?.bankTransferSales || 0) + entry.bankTransferSales,
          creditSales: (existingSales?.creditSales || 0) + entry.creditSales,
          totalSales: (existingSales?.totalSales || 0) + grossTotal,
          returnsDiscounts: (existingSales?.returnsDiscounts || 0) + entry.returns,
          refundAccountingVersion: 1,
          netSalesAmount: (existingSales?.netSalesAmount ?? (existingSales?.totalSales || 0) - (existingSales?.returnsDiscounts || 0)) + grossTotal - entry.returns,
          notes: 'Auto-synced from trusted Cashout.',
          createdAt: existingSales?.createdAt || now,
          updatedAt: now
        };
      const closure = {
        id,
        cashoutId: id,
        businessDate: quote.date,
        kind: 'daily-cashout',
        expectedBeforePaise: totals.expectedDrawerPaise,
        countedPaise: counted,
        differencePaise: counted - totals.expectedDrawerPaise,
        removedPaise: counted,
        closingBalancePaise: 0,
        subsequentNetCashPaise: 0,
        resultingBalancePaise: 0,
        ledgerRevisionBefore: counter.ledger.revision,
        recordedByUid: ctx.actor.uid,
        recordedByName: ctx.actor.name,
        createdAt: now
      };
      queue(ctx, 'dailyCashouts', id, entry, true);
      queue(ctx, 'sales', salesId, sales);
      ctx.writes.push(() => ctx.tx.create(posRef('drawerClosures', id), closure));
      queue(ctx, 'cashMovementControl', 'main', {
        revision: entry.holderBalancesRevision,
        lastOperation: 'daily-close',
        lastOperationId: id,
        updatedAt: now
      });
      ctx.writes.push(() => ctx.tx.set(counter.ledgerRef, {
        ...counter.ledger,
        revision: counter.ledger.revision + 1,
        countReservation: null,
        lastOperation: 'cashout-close',
        lastOperationId: id,
        updatedByUid: ctx.actor.uid,
        counterSession: {
          ...counter.ledger.counterSession,
          status: 'closed'
        },
        checkpoint: {
          ...counter.ledger.checkpoint,
          cashActualPaise: 0,
          cashNetPaise: counter.ledger.cashNetPaise
        }
      }));
      queue(ctx, 'financeCashoutQuotes', d.quoteId, {
        ...quote,
        closedAt: now,
        cashoutId: id
      });
      return entry;
    });
  }
  async function syncSales(ctx, entry, before) {
    // Apply only this correction delta. Historical sales may include valid
    // card/bank declarations not linked to a cashout row; preserve them.
    const salesId = 'sale-single-store-' + entry.date;
    const old = (await ctx.tx.get(ref('sales', salesId))).data();
    if (!old) p.fail('The original sales snapshot is missing. Preserve the source for reconciliation.');
    const keys = ['cashSales', 'upiSales', 'cardSales', 'bankTransferSales', 'creditSales'];
    const next = {
      ...old,
      updatedAt: ctx.timestamp
    };
    let grossDelta = 0;
    for (const key of keys) {
      const delta = p.rupees(entry[key] || 0) - p.rupees(before[key] || 0);
      next[key] = p.safe(p.rupees(old[key] || 0) + delta) / 100;
      grossDelta = p.safe(grossDelta + delta);
      if (next[key] < 0) p.fail('Correction would make a sales method total negative.');
    }
    const returnDelta = p.rupees(entry.returns || 0) - p.rupees(before.returns || 0);
    next.returnsDiscounts = p.safe(p.rupees(old.returnsDiscounts || 0) + returnDelta) / 100;
    next.totalSales = p.safe(p.rupees(old.totalSales || 0) + grossDelta) / 100;
    if (old.refundAccountingVersion === 1 || entry.refundAccountingVersion === 1) {
      next.refundAccountingVersion = 1;
      next.netSalesAmount = p.safe(p.rupees(old.refundAccountingVersion === 1 ? old.netSalesAmount : old.totalSales || 0) + grossDelta - (entry.refundAccountingVersion === 1 ? returnDelta : 0)) / 100;
    }
    queue(ctx, 'sales', salesId, next);
  }
  function validateValues(entry, values) {
    p.object(values, ['cashSales', 'upiSales', 'cardSales', 'creditSales', 'returns', 'cashExpense', 'cashAudit', 'drawerDenominations']);
    for (const key of ['cashSales', 'upiSales', 'cardSales', 'creditSales', 'returns', 'cashExpense', 'cashAudit']) p.rupees(values[key] || 0, key);
    denominations(values.drawerDenominations);
    if (entry.financePostingVersion === 1) {
      for (const key of ['cashSales', 'upiSales', 'cardSales', 'returns', 'cashExpense', 'cashAudit']) if (values[key] !== entry[key]) p.fail('Trusted source totals cannot be edited. Correct the linked source or physical count only.');
    }
    return c.normalizeCorrectionValues(values, entry.refundAccountingVersion === 1);
  }
  async function applyCorrection(ctx, request, entry) {
    v.assertExpectedRevision(entry.revision || 1, request.sourceRevision);
    if (!c.cashoutCorrectionValuesEqual(c.correctionValuesFromEntry(entry), request.before, entry.refundAccountingVersion === 1)) p.fail('Cashout changed after the request.');
    validateValues(entry, request.proposed);
    const next = c.cashoutEntryFromCorrection(entry, request.proposed, ctx.actor.name, ctx.timestamp),
      records = await ops.holderRecords(ctx.tx);
    records.cashouts = records.cashouts.map(s => s.id === entry.id ? {
      id: entry.id,
      data: next
    } : s);
    if (ops.holderBalances(records).some(s => s.amountPaise < 0)) p.fail('Correction would create a negative held-cash balance.');
    const control = (await ctx.tx.get(ref('cashMovementControl', 'main'))).data();
    await syncSales(ctx, next, entry);
    queue(ctx, 'dailyCashouts', entry.id, next);
    queue(ctx, 'cashMovementControl', 'main', {
      revision: (control?.revision || 0) + 1,
      lastOperation: 'cashout-correction',
      lastOperationId: entry.id,
      updatedAt: ctx.timestamp
    });
    queue(ctx, 'cashoutCorrectionRequests', request.id, {
      ...request,
      status: 'approved',
      reviewedAt: ctx.timestamp,
      reviewedByUserId: ctx.actor.uid,
      reviewedBy: ctx.actor.name,
      reviewReason: 'Approved by owner.'
    });
    return next;
  }
  async function correction(request) {
    const d = p.object(request.data, ['operationId', 'cashoutId', 'expectedRevision', 'proposed', 'reason', 'applyImmediately']);
    p.text(d.reason, 'Correction reason');
    if (d.reason.trim().length < 5) p.fail('Correction reason must have at least five characters.');
    return run(request, 'cashout-correction', d, p.STAFF, async ctx => {
      const entry = (await ctx.tx.get(ref('dailyCashouts', p.id(d.cashoutId)))).data();
      if (!entry) p.fail('Cashout not found.');
      v.assertExpectedRevision(entry.revision || 1, d.expectedRevision);
      if (ctx.actor.role !== 'owner') {
        const today = p.istDate(ctx.timestamp),
          min = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
        if (entry.recordedByUserId !== ctx.actor.uid || entry.date < min || entry.date > today) p.fail('Staff may request corrections for their own last seven calendar days.', 'permission-denied');
        if (d.applyImmediately) p.fail('Owner approval required.', 'permission-denied');
      }
      const pending = await ctx.tx.get(db.collection('cashoutCorrectionRequests').where('cashoutId', '==', entry.id).where('status', '==', 'pending').limit(1));
      if (!pending.empty) p.fail('A correction is already pending.');
      const proposed = validateValues(entry, d.proposed),
        before = c.correctionValuesFromEntry(entry);
      if (c.cashoutCorrectionValuesEqual(before, proposed, entry.refundAccountingVersion === 1)) p.fail('No values changed.');
      const record = {
        id: 'cashout-correction-' + ctx.operationId,
        cashoutId: entry.id,
        cashoutDate: entry.date,
        recordedBy: entry.recordedBy,
        ...(entry.recordedByUserId ? {
          recordedByUserId: entry.recordedByUserId
        } : {}),
        sourceRevision: entry.revision || 1,
        before,
        proposed,
        reason: d.reason,
        requestedByUserId: ctx.actor.uid,
        requestedBy: ctx.actor.name,
        requestType: d.applyImmediately ? 'owner-edit' : 'staff-request',
        status: 'pending',
        createdAt: ctx.timestamp
      };
      if (d.applyImmediately) return applyCorrection(ctx, record, entry);
      queue(ctx, 'cashoutCorrectionRequests', record.id, record, true);
      return record;
    });
  }
  async function decideCorrection(request) {
    const d = p.object(request.data, ['operationId', 'requestId', 'decision', 'reason']);
    if (!['approve', 'reject', 'withdraw'].includes(d.decision)) p.fail('Invalid decision.');
    return run(request, 'cashout-correction-decision', d, p.STAFF, async ctx => {
      const source = (await ctx.tx.get(ref('cashoutCorrectionRequests', p.id(d.requestId)))).data();
      if (!source || source.status !== 'pending') p.fail('Correction is no longer pending.');
      if (d.decision === 'withdraw') {
        if (source.requestedByUserId !== ctx.actor.uid) p.fail('This request cannot be withdrawn by this account.', 'permission-denied');
      } else if (ctx.actor.role !== 'owner') p.fail('Owner approval required.', 'permission-denied');
      if (d.decision === 'approve') {
        const entry = (await ctx.tx.get(ref('dailyCashouts', source.cashoutId))).data();
        if (!entry) p.fail('Cashout missing.');
        return applyCorrection(ctx, source, entry);
      }
      queue(ctx, 'cashoutCorrectionRequests', source.id, {
        ...source,
        status: d.decision === 'reject' ? 'rejected' : 'withdrawn',
        reviewedAt: ctx.timestamp,
        reviewedByUserId: ctx.actor.uid,
        reviewedBy: ctx.actor.name,
        reviewReason: d.decision === 'reject' ? p.text(d.reason, 'Decision reason') : 'Withdrawn by requester.'
      });
      return {
        id: source.id
      };
    });
  }
  async function deleteLegacy(request) {
    const d = p.object(request.data, ['operationId', 'cashoutId', 'expectedRevision', 'reason']);
    return run(request, 'cashout-delete', d, ['owner'], async ctx => {
      const source = (await ctx.tx.get(ref('dailyCashouts', p.id(d.cashoutId)))).data();
      if (!source) p.fail('Cashout not found.');
      v.assertExpectedRevision(source.revision || 1, d.expectedRevision);
      p.fail('Financial Cashout history cannot be erased. Use an audited correction; no record was deleted.', 'permission-denied');
    });
  }
  async function readSummary(request) {
    p.object(request.data, ['date']);
    p.date(request.data.date);
    return db.runTransaction(async tx => {
      const actor = await ops.actorFor(tx, request),
        timestamp = new Date(ops.clock()).toISOString(),
        ledger = (await tx.get(posRef('handover', 'main'))).data();
      if (!ledger?.initialized || !ledger.checkpoint || ledger.counterSession?.status !== 'open' || ledger.counterSession.date !== request.data.date) p.fail('Open the selected shared counter before preparing Cashout.');
      return summary({
        tx,
        actor,
        timestamp
      }, request.data.date, ledger);
    });
  }
  async function review(request) {
    const d = p.object(request.data, ['operationId', 'cashoutId', 'expectedRevision']);
    return run(request, 'cashout-review', d, ['owner'], async ctx => {
      const source = (await ctx.tx.get(ref('dailyCashouts', p.id(d.cashoutId)))).data();
      if (!source || source.financePostingVersion !== 1) p.fail('This Cashout has no informational review workflow.');
      v.assertExpectedRevision(source.revision || 1, d.expectedRevision);
      const next = {
        ...source,
        reviewStatus: 'reviewed',
        reviewedAt: ctx.timestamp,
        reviewedByUid: ctx.actor.uid
      };
      queue(ctx, 'dailyCashouts', source.id, next);
      return next;
    });
  }
  return {
    prepare,
    cancel,
    close,
    correction,
    decideCorrection,
    deleteLegacy,
    summary,
    readSummary,
    review
  };
}
module.exports = {
  createCashoutHandlers
};
