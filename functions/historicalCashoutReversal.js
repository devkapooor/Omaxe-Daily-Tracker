const p = require('./financeOperations');
const { canonical, hash } = require('./stockOperations');
const signature = value => hash(JSON.stringify(canonical(value)));
const MOVEMENTS = new Set(['cashout-close', 'cashout-drawer-debit', 'cashout-correction', 'cashout-correction-decision']);
function createHistoricalCashoutReversal(ops) {
  const { db, ref, posRef, run } = ops;
  async function rows(ctx, query) {
    const result = await ctx.tx.get(query.limit(201));
    if (result.size > 200) p.fail('Historical drawer evidence exceeds the safe review bound. No correction was posted.');
    return result.docs;
  }
  function stamp(value) {
    const result = typeof value?.toMillis === 'function' ? value.toMillis() : typeof value === 'string' ? Date.parse(value) : NaN;
    if (!Number.isFinite(result)) p.fail('Historical drawer timestamps are incomplete. An individual reconciliation is required.');
    return result;
  }
  async function inspect(ctx, date) {
    p.date(date);
    if (date >= p.istDate(ctx.timestamp)) p.fail('Duplicate drawer correction is available only for past-date Cashouts.', 'invalid-argument');
    const cashouts = await rows(ctx, db.collection('dailyCashouts').where('date', '==', date));
    const candidates = cashouts.filter(row => row.get('historicalCountOnlyVersion') === 1 && row.get('drawerDebitOperationId') && !row.get('drawerDebitReversalOperationId') && row.get('drawerDebitPaise') > 0);
    if (!candidates.length) return { eligible: false, date, message: cashouts.some(row => row.get('drawerDebitReversalOperationId')) ? 'The duplicate drawer deduction is already corrected.' : 'No applied historical drawer deduction needs correction for this date.' };
    if (candidates.length !== 1) p.fail('Multiple historical drawer deductions need individual review. No correction was guessed.');
    const row = candidates[0], entry = row.data(),
      closureSnapshot = await ctx.tx.get(posRef('drawerClosures', entry.drawerClosureId || row.id)), closure = closureSnapshot.data(),
      ledgerSnapshot = await ctx.tx.get(posRef('handover', 'main')), ledger = ledgerSnapshot.data();
    if (!closure || closure.kind !== 'historical-cashout' || closure.cashoutId !== row.id || closure.drawerDebitOperationId !== entry.drawerDebitOperationId) p.fail('The original drawer deduction evidence is incomplete. No correction was posted.');
    if (!ledger?.initialized || !ledger.checkpoint) p.fail('A verified shared drawer checkpoint is required.');
    const [entryOps, legacyOps, pending] = await Promise.all([
      rows(ctx, db.collection('financeOperations').where('result.id', '==', row.id)),
      rows(ctx, db.collection('financeOperations').where('result.cashoutId', '==', row.id)),
      ctx.tx.get(db.collection('cashoutCorrectionRequests').where('cashoutId', '==', row.id).where('status', '==', 'pending').limit(1))
    ]);
    if (!pending.empty) p.fail('Resolve the pending Cashout correction before reversing its drawer deduction.');
    const movements = [...new Map([...entryOps, ...legacyOps].map(op => [op.id, op])).values()].filter(op => MOVEMENTS.has(op.get('kind')));
    if (!movements.length || !movements.some(op => op.id === entry.drawerDebitOperationId)) p.fail('The immutable posting history is incomplete. No drawer amount was guessed.');
    let boundaryMs = null;
    if (movements.some(op => !op.get('result.drawerDebitCheckpoint'))) {
      // Older postings lack a checkpoint snapshot. Reconstruct the latest verified
      // physical count/reset boundary; ordinary sales/expenses never reset it.
      const rec = (await ctx.tx.get(posRef('reconciliations', p.id(ledger.checkpoint.reconciliationId)))).data();
      if (!rec || !['login', 'logout'].includes(rec.kind)) p.fail('The current physical-count evidence is unavailable.');
      boundaryMs = stamp(rec.recordedAt ?? rec.createdAt);
      const closures = await rows(ctx, db.collection(p.BASE + '/drawerClosures').where('createdAt', '>=', new Date(stamp(rec.createdAt)).toISOString()));
      const resets = closures.filter(item => ['daily-cashout', 'historical-repair'].includes(item.get('kind'))).sort((a, b) => stamp(b.get('createdAt')) - stamp(a.get('createdAt')));
      const reset = resets[0];
      if (reset && stamp(reset.get('createdAt')) > boundaryMs) {
        if (ledger.checkpoint.cashActualPaise !== reset.get('resultingBalancePaise')) p.fail('The latest drawer-reset evidence does not match its checkpoint. Review it before correction.');
        boundaryMs = stamp(reset.get('createdAt'));
      } else if (ledger.checkpoint.cashActualPaise !== rec.actual?.cash) p.fail('The current count and checkpoint do not match. Review them before correction.');
    }
    let total = 0, restore = 0;
    for (const op of movements) {
      const result = op.get('result'), legacy = op.get('kind') === 'cashout-drawer-debit';
      const before = p.paise(legacy ? result.beforePaise : result.drawerBalanceBeforePaise), after = p.paise(legacy ? result.afterPaise : result.drawerBalanceAfterPaise), effect = p.safe(before - after);
      total = p.safe(total + effect);
      const checkpoint = result.drawerDebitCheckpoint;
      if (!checkpoint && Math.abs(stamp(op.get('createdAt')) - boundaryMs) < 1000) p.fail('The legacy posting and count timestamps are too close to order safely. An individual physical reconciliation is required.');
      if (checkpoint ? signature(checkpoint) === signature(ledger.checkpoint) : stamp(op.get('createdAt')) > boundaryMs) restore = p.safe(restore + effect);
    }
    if (total !== p.paise(entry.drawerDebitPaise)) p.fail('Cashout drawer postings do not reconcile with the saved debit. No correction was guessed.');
    const beforePaise = p.expectedCash(ledger), afterPaise = p.safe(beforePaise + restore);
    if (afterPaise < 0) p.fail('Reversing the remaining correction would make the drawer negative. Review the physical count first.');
    const active = ledger.countReservation?.startedAt?.toMillis && ctx.nowMs < ledger.countReservation.startedAt.toMillis() + 300000;
    return {
      eligible: true, date, cashoutId: row.id, expectedRevision: entry.revision || 1,
      originalDebitPaise: total, restorePaise: restore, beforePaise, afterPaise,
      absorbedByLaterCount: restore !== total, countActive: !!active,
      expectedFingerprint: signature({ entry, closure, checkpoint: ledger.checkpoint, operations: movements.map(op => [op.id, op.get('createdAt'), op.get('result')]) }),
      _entry: entry, _closure: closure, _ledger: ledger
    };
  }
  function publicView(value) {
    const { _entry, _closure, _ledger, ...view } = value;
    return view;
  }
  async function reverse(request) {
    const d = p.object(request.data, ['operationId', 'date', 'cashoutId', 'expectedRevision', 'expectedFingerprint', 'expectedRestorePaise', 'reason']);
    p.date(d.date); p.id(d.cashoutId); p.text(d.expectedFingerprint, 'Correction review reference');
    p.paise(d.expectedRestorePaise, 'Reviewed correction amount', -Number.MAX_SAFE_INTEGER);
    const reason = p.text(d.reason, 'Correction reason');
    if (reason.length < 5) p.fail('Enter a correction reason of at least five characters.', 'invalid-argument');
    return run(request, 'cashout-drawer-reversal', d, ['owner'], async ctx => {
      const view = await inspect(ctx, d.date);
      if (!view.eligible) p.fail(view.message);
      if (view.cashoutId !== d.cashoutId || view.expectedRevision !== d.expectedRevision || view.expectedFingerprint !== d.expectedFingerprint || view.restorePaise !== d.expectedRestorePaise) p.fail('The Cashout or physical count changed. Refresh the correction preview before confirming.');
      if (view.countActive) p.fail('A physical cash count is active. Finish or cancel it before correcting the drawer.');
      const evidence = {
        operationId: ctx.operationId, cashoutId: view.cashoutId, date: d.date,
        originalDebitPaise: view.originalDebitPaise, restoredPaise: view.restorePaise,
        beforePaise: view.beforePaise, afterPaise: view.afterPaise,
        absorbedByLaterCount: view.absorbedByLaterCount, checkpoint: view._ledger.checkpoint,
        reason, actorUid: ctx.actor.uid, actorName: ctx.actor.name, createdAt: ctx.timestamp
      };
      ctx.writes.push(() => ctx.tx.set(ref('dailyCashouts', view.cashoutId), {
        ...view._entry, historicalCashTiming: 'already-removed', drawerDebitReversalOperationId: ctx.operationId,
        drawerDebitReversalRestoredPaise: view.restorePaise, drawerDebitReversalAt: ctx.timestamp,
        drawerDebitReversalReason: reason, revision: view.expectedRevision + 1,
        updatedAt: ctx.timestamp, updatedBy: ctx.actor.name
      }));
      // Preserve original closure/debit evidence; append a compensating record.
      ctx.writes.push(() => ctx.tx.create(ref('cashoutDrawerCorrections', ctx.operationId), evidence));
      if (view.restorePaise !== 0) ctx.writes.push(() => ctx.tx.set(posRef('handover', 'main'), {
        ...view._ledger, cashNetPaise: p.safe(view._ledger.cashNetPaise + view.restorePaise),
        revision: p.safe(view._ledger.revision + 1), lastOperation: 'cashout-correction',
        lastOperationId: ctx.operationId, updatedByUid: ctx.actor.uid
      }));
      return evidence;
    });
  }
  return { inspect, publicView, reverse };
}
module.exports = { createHistoricalCashoutReversal };
