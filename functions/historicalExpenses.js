const p = require('./financeOperations');
const { canonical, hash } = require('./stockOperations');

// These are the legacy ordinary-expense categories, not vendor settlements or refunds.
const LEGACY_EXPENSES = new Set(['Rent', 'Electricity', 'Store Maintenance', 'Stock Delivery', 'Staff Welfare']);
const fingerprint = value => hash(JSON.stringify(canonical(value)));
function createHistoricalExpenseHandlers(ops) {
  const { db, ref, posRef, run } = ops;
  async function rows(ctx, query) {
    let cursor, result = [];
    do {
      const page = await ctx.tx.get((cursor ? query.startAfter(cursor) : query).limit(100));
      result.push(...page.docs);
      if (result.length > 2000) p.fail('Historical sources exceed the safe review bound. No totals were truncated.');
      cursor = page.size === 100 ? page.docs.at(-1) : null;
    } while (cursor);
    return result;
  }
  function pastDate(date, timestamp) {
    p.date(date);
    if (date >= p.istDate(timestamp)) p.fail('Expense reconciliation is available only for past dates.', 'invalid-argument');
  }
  async function inspect(ctx, date) {
    pastDate(date, ctx.timestamp);
    const [outflows, events, cashouts, saved] = await Promise.all([
      rows(ctx, db.collection('cashouts').where('date', '==', date)),
      rows(ctx, db.collection(p.BASE + '/events').where('refundDate', '==', date)),
      rows(ctx, db.collection('dailyCashouts').where('date', '==', date)),
      ctx.tx.get(ref('cashoutExpenseReconciliations', date))
    ]);
    let recorded = 0, legacy = 0, vendor = 0, refunds = 0, unknown = 0, unknownCount = 0;
    for (const row of outflows) {
      const d = row.data();
      if (d.paymentMode !== 'Cash' || d.paymentStatus === 'cancelled') continue;
      const amount = p.rupees(d.amount, 'Recorded cash expense');
      if (d.amountPaise !== undefined && p.paise(d.amountPaise) !== amount) p.fail('A historical cash source has inconsistent amount fields. Review it before reconciling.');
      if (d.sourceKind === 'pos-return') continue; // The canonical refund event is counted below.
      if (d.sourceKind === 'vendor-payment' || (!d.sourceKind && d.category === 'Vendor Payment')) {
        vendor = p.safe(vendor + amount);
      } else if (d.sourceKind === 'expense' || (!d.sourceKind && LEGACY_EXPENSES.has(d.category) && !d.vendorId && !d.loanId && !d.billId && !d.approvalId)) {
        recorded = p.safe(recorded + amount);
        if (d.fundingVersion !== 1) legacy = p.safe(legacy + amount);
      } else {
        unknown = p.safe(unknown + amount);
        unknownCount++;
      }
    }
    for (const row of events) {
      if (row.get('type') === 'bill-return-approved' && row.get('refundMethod') === 'cash') refunds = p.safe(refunds + p.paise(row.get('refundAmountPaise')));
    }
    // Include every date-matched source, including rows with no createdAt. Do not
    // fingerprint display names or notes; posting amounts/classification are decisive.
    const sourceFingerprint = fingerprint({
      outflows: outflows.map(row => ({ id: row.id, ...Object.fromEntries(['amount', 'amountPaise', 'paymentMode', 'paymentStatus', 'sourceKind', 'category', 'fundingVersion', 'vendorId', 'loanId', 'billId', 'approvalId'].map(key => [key, row.get(key) ?? null])) })),
      refunds: events.map(row => ({ id: row.id, type: row.get('type') ?? null, method: row.get('refundMethod') ?? null, amount: row.get('refundAmountPaise') ?? null }))
    });
    const previous = saved.data(), revision = previous?.revision || 0,
      stale = !!previous && previous.sourceFingerprint !== sourceFingerprint,
      adjustment = previous && !stale ? p.safe(previous.adjustmentPaise) : 0,
      effective = p.safe(recorded + adjustment);
    if (effective < 0) p.fail('The historical expense adjustment is invalid. Review the dated reconciliation.');
    const ordered = cashouts.slice().sort((a, b) => (a.get('createdAt') || '').localeCompare(b.get('createdAt') || '') || a.id.localeCompare(b.id));
    const cashoutSnapshot = ordered.map(row => ({ id: row.id, revision: row.get('revision') || 1, cashExpense: row.get('cashExpense') ?? null }));
    let completedCorrectionBlockedReason = '', savedVendor = 0, savedRefunds = 0;
    for (const row of ordered) {
      const totals = row.get('sourceTotals');
      if (row.get('financePostingVersion') !== 1 || !totals || !['vendorCashPaymentPaise', 'cashRefundPaise'].every(key => Number.isSafeInteger(totals[key]) && totals[key] >= 0)) {
        completedCorrectionBlockedReason = 'An older saved Cashout has no separate vendor/refund evidence. Use its individual owner correction for this date.';
        break;
      }
      savedVendor = p.safe(savedVendor + totals.vendorCashPaymentPaise);
      savedRefunds = p.safe(savedRefunds + totals.cashRefundPaise);
    }
    if (ordered.length && !completedCorrectionBlockedReason && (savedVendor !== vendor || savedRefunds !== refunds)) completedCorrectionBlockedReason = 'Vendor payments or refunds differ from the saved Cashout evidence. Review those linked sources before correcting ordinary expenses.';
    if (cashoutSnapshot.some(row => row.cashExpense === null)) completedCorrectionBlockedReason = 'A saved Cashout has no explicit payout total. It needs an individual reviewed correction first.';
    return {
      date, recordedCashExpensePaise: recorded, legacyCashExpensePaise: legacy,
      adjustmentPaise: adjustment, confirmedExpensePaise: effective,
      savedConfirmedExpensePaise: previous?.confirmedExpensePaise ?? null,
      vendorCashPaymentPaise: vendor, cashRefundPaise: refunds,
      cashPaidOutPaise: p.safe(effective + vendor + refunds),
      unclassifiedCashPaise: unknown, unclassifiedCashCount: unknownCount,
      revision, reconciliationStale: stale, sourceFingerprint,
      expectedFingerprint: fingerprint({ sourceFingerprint, revision, cashouts: cashoutSnapshot }),
      completedCashoutCount: ordered.length,
      completedCorrectionBlockedReason,
      recordedCashoutPaidOutPaise: cashoutSnapshot.some(row => row.cashExpense === null) ? null : cashoutSnapshot.reduce((sum, row) => p.safe(sum + p.rupees(row.cashExpense)), 0),
      lastReason: previous?.reason ?? '', lastConfirmedAt: previous?.updatedAt ?? null,
      // Internal snapshots never leave the server.
      _cashouts: ordered, _previous: previous ?? null
    };
  }
  function publicView(value) {
    const { _cashouts, _previous, ...view } = value;
    return view;
  }
  async function forSummary(ctx, date) {
    const view = await inspect(ctx, date);
    if (view.reconciliationStale) p.fail('Historical expense sources changed after confirmation. Ask the owner to review and confirm this date again.');
    if (view.unclassifiedCashCount) p.fail('Unclassified historical cash entries need owner review before Cashout.');
    return {
      cashRefundPaise: view.cashRefundPaise,
      ordinaryCashExpensePaise: view.confirmedExpensePaise,
      vendorCashPaymentPaise: view.vendorCashPaymentPaise,
      cashPaidOutPaise: view.cashPaidOutPaise,
      recordedCashExpensePaise: view.recordedCashExpensePaise,
      historicalExpenseAdjustmentPaise: view.adjustmentPaise,
      historicalExpenseRevision: view.revision,
      historicalExpenseSourceFingerprint: view.sourceFingerprint,
      historicalLegacyCashExpensePaise: view.legacyCashExpensePaise,
      historicalUnclassifiedCashPaise: view.unclassifiedCashPaise,
      historicalUnclassifiedCashCount: view.unclassifiedCashCount
    };
  }
  async function reconcile(request) {
    const d = p.object(request.data, ['operationId', 'date', 'totalPaise', 'reason', 'expectedFingerprint', 'correctCompleted']);
    p.date(d.date);
    p.paise(d.totalPaise, 'Confirmed cash expense total');
    p.text(d.expectedFingerprint, 'Source review reference');
    const reason = p.text(d.reason, 'Reconciliation reason');
    if (reason.length < 5) p.fail('Enter a reconciliation reason of at least five characters.', 'invalid-argument');
    if (typeof d.correctCompleted !== 'boolean') p.fail('Confirm whether completed Cashouts will be corrected.', 'invalid-argument');
    return run(request, 'cashout-expense-reconcile', d, ['owner'], async ctx => {
      const view = await inspect(ctx, d.date);
      if (view.expectedFingerprint !== d.expectedFingerprint) p.fail('Historical sources or Cashouts changed. Refresh the review before saving.');
      if (view.unclassifiedCashCount) p.fail('Some historical cash entries cannot be classified safely. Review those sources before confirming a total.');
      if ((view.completedCashoutCount > 0) !== d.correctCompleted) p.fail('The Cashout status changed. Refresh and explicitly confirm the audited correction.');
      const ledger = (await ctx.tx.get(posRef('handover', 'main'))).data(), reservation = ledger?.countReservation;
      if (reservation?.kind === 'cashout' && reservation.startedAt?.toMillis && ctx.nowMs < reservation.startedAt.toMillis() + 300000) p.fail('A Cashout count is active. Finish or cancel it before reconciling historical expenses.');
      if (view._previous && !view.reconciliationStale && view.confirmedExpensePaise === d.totalPaise) p.fail('This expense total is already confirmed. No duplicate adjustment was posted.');
      const next = {
        date: d.date, revision: view.revision + 1,
        recordedCashExpensePaise: view.recordedCashExpensePaise,
        confirmedExpensePaise: d.totalPaise,
        adjustmentPaise: p.safe(d.totalPaise - view.recordedCashExpensePaise),
        sourceFingerprint: view.sourceFingerprint, reason,
        createdAt: view._previous?.createdAt || ctx.timestamp,
        updatedAt: ctx.timestamp, updatedByUid: ctx.actor.uid,
        sourceOperationId: ctx.operationId, drawerImpactPaise: 0
      };
      const desiredPaidOut = p.safe(d.totalPaise + view.vendorCashPaymentPaise + view.cashRefundPaise);
      let remaining = 0;
      if (view.completedCashoutCount) {
        if (view.recordedCashoutPaidOutPaise === null) p.fail('A saved Cashout has no explicit payout total. It needs an individual reviewed correction first.');
        remaining = p.safe(desiredPaidOut - view.recordedCashoutPaidOutPaise);
      }
      const correctedCashoutIds = [];
      for (const row of view._cashouts.slice().reverse()) {
        const entry = row.data();
        const pending = await ctx.tx.get(db.collection('cashoutCorrectionRequests').where('cashoutId', '==', row.id).where('status', '==', 'pending').limit(1));
        if (!pending.empty) p.fail('A Cashout correction is pending for this date. Resolve it before reconciling expenses.');
        if (view.completedCorrectionBlockedReason) p.fail(view.completedCorrectionBlockedReason);
        if (!remaining) continue;
        const beforePaise = p.rupees(entry.cashExpense), minimum = p.paise(entry.posCashRefundPaise || 0);
        if (beforePaise < minimum) p.fail('A saved Cashout payout is smaller than its protected refund total. Review it before reconciling.');
        const delta = remaining > 0 ? remaining : Math.max(remaining, minimum - beforePaise);
        if (delta === 0) continue;
        remaining = p.safe(remaining - delta);
        const before = { ...require('./cashoutPolicy').correctionValuesFromEntry(entry), cashExpense: entry.cashExpense };
        const cashExpense = p.safe(beforePaise + delta) / 100;
        const correctionId = 'cashout-expense-' + ctx.operationId + '-' + correctedCashoutIds.length;
        ctx.writes.push(() => ctx.tx.set(row.ref, {
          ...entry, cashExpense, revision: (entry.revision || 1) + 1,
          updatedAt: ctx.timestamp, updatedBy: ctx.actor.name,
          historicalExpenseReconciliationId: d.date, historicalExpenseReconciliationRevision: next.revision
        }));
        ctx.writes.push(() => ctx.tx.create(ref('cashoutCorrectionRequests', correctionId), {
          id: correctionId, cashoutId: row.id, cashoutDate: d.date,
          recordedBy: entry.recordedBy || 'Historical recorder',
          ...(entry.recordedByUserId ? { recordedByUserId: entry.recordedByUserId } : {}),
          sourceRevision: entry.revision || 1, before, proposed: { ...before, cashExpense },
          reason, requestedByUserId: ctx.actor.uid, requestedBy: ctx.actor.name,
          requestType: 'owner-edit', status: 'approved', createdAt: ctx.timestamp,
          reviewedAt: ctx.timestamp, reviewedByUserId: ctx.actor.uid, reviewedBy: ctx.actor.name,
          reviewReason: 'Owner confirmed historical expenses. Cash count, sales and drawer unchanged.',
          historicalExpenseReconciliationId: d.date, sourceOperationId: ctx.operationId
        }));
        correctedCashoutIds.push(row.id);
      }
      if (remaining) p.fail('The correction would remove protected refund amounts from a saved Cashout. Review the individual Cashouts first.');
      ctx.writes.push(() => ctx.tx.set(ref('cashoutExpenseReconciliations', d.date), next));
      // ops.run records immutable before/after evidence and replays an identical
      // operationId. The dated revision/fingerprint also prevents cross-tab duplicates.
      return { ...next, cashPaidOutPaise: desiredPaidOut, correctedCashoutIds, previous: view._previous };
    });
  }
  return { inspect, publicView, forSummary, reconcile };
}
module.exports = { createHistoricalExpenseHandlers };
