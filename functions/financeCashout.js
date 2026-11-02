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
  const historicalExpenses = require('./historicalExpenses').createHistoricalExpenseHandlers(ops);
  const drawerReversal = require('./historicalCashoutReversal').createHistoricalCashoutReversal(ops);
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
  async function summary(ctx, businessDate, ledger = null) {
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
    const expected = ledger ? p.expectedCash(ledger) : null;
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
      openingCheckpointPaise: ledger ? ledger.checkpoint.cashActualPaise : null,
      subsequentNetCashPaise: ledger ? ledger.cashNetPaise - ledger.checkpoint.cashNetPaise : null,
      checkpointId: ledger ? ledger.checkpoint.reconciliationId : null,
      legacyUntrackedCashOutflowPaise: legacyUntracked,
      posRefundDayRevision: refundDay.exists ? refundDay.get('revision') : 0,
      posRefundDayTotalPaise: refundDay.exists ? refundDay.get('cashRefundPaise') : 0,
      handoverRevision: ledger ? ledger.revision : null,
      sourceOutflowIds: outflows.filter(s => s.get('fundingVersion') === 1).map(s => s.id)
    };
  }
  function previousDate(date) {
    const value = new Date(date + 'T00:00:00.000Z');
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }
  function activeCount(ledger, nowMs) {
    const reservation = ledger?.countReservation;
    return reservation?.startedAt?.toMillis && nowMs < reservation.startedAt.toMillis() + 300000;
  }
  function recordedCashoutPaise(entry) {
    if (Number.isSafeInteger(entry.cashRemovedPaise)) return p.paise(entry.cashRemovedPaise, 'Cashout amount');
    return p.rupees(Number(entry.drawerTotal ?? entry.remainingBalance ?? 0), 'Cashout amount');
  }
  async function cashoutSummary(ctx, businessDate, counter) {
    const ledger = counter.ledger,
      counterDate = ledger.checkpoint.date,
      lateCashout = businessDate !== counterDate;
    if (lateCashout && businessDate !== previousDate(counterDate)) p.fail('Cashout requires the selected day\'s open counter, or the immediately previous day\'s opening count evidence.');
    let openingSnapshot,
      carryover;
    if (lateCashout) {
      const existing = await ctx.tx.get(db.collection('dailyCashouts').where('date', '==', businessDate).limit(1));
      if (!existing.empty) p.fail('A Cashout already exists for this date. Use the audited correction workflow.');
      openingSnapshot = await ctx.tx.get(posRef('reconciliations', ledger.counterSession.openingReconciliationId));
      const opening = openingSnapshot.data();
      if (!opening || opening.kind !== 'login' || opening.date !== counterDate || !Number.isSafeInteger(opening.actual?.cash) || opening.actual.cash < 0) p.fail('The next day\'s opening count evidence is unavailable. No Cashout was posted.');
      carryover = p.paise(opening.actual.cash, 'Prior-day carryover');
    }
    const totals = await summary(ctx, businessDate, ledger);
    if (!lateCashout) return {
      ...totals,
      lateCashout: false,
      counterDate,
      currentExpectedDrawerPaise: totals.expectedDrawerPaise
    };
    const currentExpected = p.expectedCash(ledger);
    if (currentExpected < 0) p.fail('The current shared drawer expectation is invalid. No Cashout was posted.');
    return {
      ...totals,
      lateCashout: true,
      counterDate,
      lateCashoutCarryoverPaise: carryover,
      lateCashoutOpeningReconciliationId: openingSnapshot.id,
      currentExpectedDrawerPaise: currentExpected,
      expectedDrawerPaise: carryover,
      openingCheckpointPaise: carryover,
      subsequentNetCashPaise: currentExpected - carryover,
      checkpointId: openingSnapshot.id
    };
  }
  async function historicalCashoutSummary(ctx, businessDate) {
    const existing = await ctx.tx.get(db.collection('dailyCashouts').where('date', '==', businessDate).limit(1));
    if (!existing.empty) p.fail('A Cashout already exists for this date. Use the audited correction workflow.', 'already-exists');
    return {
      ...await summary(ctx, businessDate),
      ...await historicalExpenses.forSummary(ctx, businessDate),
      historicalCashout: true,
      expectedDrawerPaise: null,
      openingCheckpointPaise: null,
      subsequentNetCashPaise: null,
      checkpointId: null
    };
  }
  function isHistoricalDate(date, timestamp) {
    const today = p.istDate(timestamp);
    if (date > today) p.fail('Cashout cannot be recorded for a future date.');
    return date < today;
  }
  async function prepare(request) {
    const d = p.object(request.data, ['operationId', 'date', 'historicalCashTiming']);
    p.date(d.date);
    return run(request, 'cashout-count-start', d, p.STAFF, async ctx => {
      const historicalCashout = isHistoricalDate(d.date, ctx.timestamp);
      if (historicalCashout) {
        if (!['already-removed', 'remove-now'].includes(d.historicalCashTiming)) p.fail('Choose Cash already removed or Removing cash now before recording a past-date Cashout.', 'invalid-argument');
        const alreadyRemoved = d.historicalCashTiming === 'already-removed';
        if (alreadyRemoved && ctx.actor.role !== 'owner') p.fail('Only the owner may confirm cash was already removed earlier.', 'permission-denied');
        const ledgerRef = posRef('handover', 'main'),
          ledgerSnapshot = await ctx.tx.get(ledgerRef),
          ledger = ledgerSnapshot.data();
        if (!ledger?.initialized || !ledger.checkpoint) p.fail('Set up and count the shared cash drawer before recording a Cashout.');
        if (!alreadyRemoved && activeCount(ledger, ctx.nowMs)) p.fail('The shared drawer is being counted. Wait for the count to finish or be cancelled.');
        const totals = await historicalCashoutSummary(ctx, d.date),
          reservationId = ctx.operationId,
          reservation = {
            id: reservationId,
            uid: ctx.actor.uid,
            name: ctx.actor.name,
            authTime: request.auth.token.auth_time,
            kind: 'cashout',
            date: p.istDate(ctx.timestamp),
            revision: ledger.revision,
            startedAt: p.Timestamp.fromMillis(ctx.nowMs)
          },
          result = {
            ...totals,
            id: ctx.operationId,
            actorUid: ctx.actor.uid,
            historicalCashTiming: d.historicalCashTiming,
            reservationId: alreadyRemoved ? null : reservationId,
            expiresAtMs: ctx.nowMs + 300000,
            handoverRevision: alreadyRemoved ? null : ledger.revision + 1,
            counterDate: p.istDate(ctx.timestamp),
            currentDrawerPaise: p.expectedCash(ledger),
            createdAt: ctx.timestamp
          };
        queue(ctx, 'financeCashoutQuotes', ctx.operationId, result, true);
        if (!alreadyRemoved) ctx.writes.push(() => ctx.tx.set(ledgerRef, {
          ...ledger,
          countReservation: reservation,
          revision: ledger.revision + 1,
          lastOperation: 'count-reserve',
          lastOperationId: ctx.operationId,
          updatedByUid: ctx.actor.uid
        }));
        return result;
      }
      if (d.historicalCashTiming !== undefined) p.fail('Historical cash timing is available only for past dates.', 'invalid-argument');
      const counterDate = p.istDate(ctx.timestamp);
      const counter = await ops.counter(ctx, {
        businessDate: counterDate,
        allowOwnerWithoutJoining: true
      });
      const totals = await cashoutSummary(ctx, d.date, counter),
        reservation = {
          id: ctx.operationId,
          uid: ctx.actor.uid,
          name: ctx.actor.name,
          authTime: request.auth.token.auth_time,
          kind: 'cashout',
          date: counterDate,
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
          counterDate,
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
      if (quote.historicalCashout) {
        if (!['already-removed', 'remove-now'].includes(quote.historicalCashTiming)) p.fail('This old quote has no cash-removal choice. Cancel it and start again.');
        const alreadyRemoved = quote.historicalCashTiming === 'already-removed';
        if (alreadyRemoved && ctx.actor.role !== 'owner') p.fail('Owner confirmation is required for cash already removed earlier.', 'permission-denied');
        const ledgerRef = posRef('handover', 'main'),
          ledgerSnapshot = await ctx.tx.get(ledgerRef),
          ledger = ledgerSnapshot.data();
        if (!ledger?.initialized || !ledger.checkpoint) p.fail('The shared cash drawer is unavailable. No Cashout was posted.');
        if (!alreadyRemoved && (ledger.countReservation?.id !== quote.reservationId || ledger.countReservation?.uid !== ctx.actor.uid || ledger.countReservation?.authTime !== request.auth.token.auth_time || ledger.revision !== quote.handoverRevision)) p.fail('Drawer activity changed. Cancel and start a fresh Cashout count.');
        const totals = await historicalCashoutSummary(ctx, quote.date),
          immutableTotals = ['grossMethods', 'cashRefundPaise', 'windowRefundPaise', 'ordinaryCashExpensePaise', 'vendorCashPaymentPaise', 'cashPaidOutPaise', 'netCashCollectionsPaise', 'legacyUntrackedCashOutflowPaise', 'posRefundDayRevision', 'posRefundDayTotalPaise', 'historicalExpenseRevision', 'historicalExpenseSourceFingerprint'];
        for (const key of immutableTotals) if (JSON.stringify(totals[key]) !== JSON.stringify(quote[key])) p.fail('Source totals changed during counting. Cancel and start a fresh historical count.');
        const reason = p.text(d.reason, 'Historical Cashout reason');
        if (reason.length < 5) p.fail('Enter at least five characters explaining this historical Cashout.');
        const drawerBeforePaise = p.expectedCash(ledger);
        if (!alreadyRemoved && counted > drawerBeforePaise) p.fail('Cashout amount exceeds the current virtual drawer. No Cashout was posted.');
        const drawerAfterPaise = alreadyRemoved ? drawerBeforePaise : drawerBeforePaise - counted;
        const id = 'daily-cashout-historical-' + quote.date,
          existingByDate = await ctx.tx.get(ref('dailyCashouts', id));
        if (existingByDate.exists) p.fail('A historical Cashout has already been recorded for this date. Use the audited correction workflow.');
        const controlRef = ref('cashMovementControl', 'main'),
          control = await ctx.tx.get(controlRef),
          holderRecords = await ops.holderRecords(ctx.tx),
          salesId = 'sale-single-store-' + quote.date,
          salesSnapshot = await ctx.tx.get(ref('sales', salesId)),
          existingSales = salesSnapshot.data(),
          now = ctx.timestamp,
          g = totals.grossMethods,
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
            cashAudit: null,
            drawerTotal: counted / 100,
            drawerDenominations: d.drawerDenominations,
            remainingBalance: counted / 100,
            actualCashParticulars: c.formatDrawerParticulars(d.drawerDenominations, true),
            pendingCashParticulars: 'Historical physical cash count recorded by: ' + ctx.actor.name + '\nExpected drawer: unavailable for this historical count.',
            createdAt: now,
            revision: 1,
            refundAccountingVersion: 1,
            historicalCountOnlyVersion: 1,
            historicalCashTiming: quote.historicalCashTiming,
            posCashRefundPaise: totals.cashRefundPaise,
            posRefundDayRevision: totals.posRefundDayRevision,
            posRefundDayTotalPaise: totals.posRefundDayTotalPaise,
            drawerClosureId: id,
            cashRemovedPaise: counted,
            closingDrawerPaise: drawerAfterPaise,
            financePostingVersion: 1,
            financeQuoteId: quote.id,
            sourceOperationId: ctx.operationId,
            sourceTotals: totals,
            discrepancyReason: reason,
            reviewStatus: 'pending',
            auditDifference: null,
            auditStatus: 'not-reconciled',
            auditMessage: 'Historical physical count recorded. Expected drawer for that date is unavailable.',
            drawerDebitPaise: alreadyRemoved ? 0 : counted,
            drawerBalanceBeforePaise: drawerBeforePaise,
            drawerBalanceAfterPaise: drawerAfterPaise,
            ...(alreadyRemoved ? {} : { drawerDebitAt: now, drawerDebitByUid: ctx.actor.uid, drawerDebitOperationId: ctx.operationId, drawerDebitReason: reason, drawerDebitCheckpoint: ledger.checkpoint })
          };
        // Historical counts are intentionally not compared with a guessed drawer expectation.
        const balances = ops.holderBalances(holderRecords, entry);
        if (balances.some(b => b.amountPaise < 0)) p.fail('Holder balances do not reconcile. No historical Cashout was posted.');
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
            notes: 'Auto-synced from trusted historical Cashout.',
            createdAt: existingSales?.createdAt || now,
            updatedAt: now
          },
          closure = {
            id,
            cashoutId: id,
            businessDate: quote.date,
            kind: 'historical-cashout',
            expectedBeforePaise: alreadyRemoved ? null : drawerBeforePaise,
            countedPaise: counted,
            differencePaise: alreadyRemoved ? null : counted - drawerBeforePaise,
            removedPaise: alreadyRemoved ? 0 : counted,
            closingBalancePaise: drawerAfterPaise,
            resultingBalancePaise: drawerAfterPaise,
            historicalCashTiming: quote.historicalCashTiming,
            ...(alreadyRemoved ? {} : { drawerDebitOperationId: ctx.operationId }),
            recordedByUid: ctx.actor.uid,
            recordedByName: ctx.actor.name,
            createdAt: now
          };
        queue(ctx, 'dailyCashouts', id, entry, true);
        queue(ctx, 'sales', salesId, sales);
        ctx.writes.push(() => ctx.tx.create(posRef('drawerClosures', id), closure));
        if (!alreadyRemoved) ctx.writes.push(() => ctx.tx.set(ledgerRef, {
          ...ledger,
          cashNetPaise: p.safe(ledger.cashNetPaise - counted),
          countReservation: null,
          revision: ledger.revision + 1,
          lastOperation: 'cashout-close',
          lastOperationId: ctx.operationId,
          updatedByUid: ctx.actor.uid
        }));
        queue(ctx, 'cashMovementControl', 'main', {
          revision: entry.holderBalancesRevision,
          lastOperation: 'historical-cashout',
          lastOperationId: id,
          updatedAt: now
        });
        queue(ctx, 'financeCashoutQuotes', d.quoteId, { ...quote, closedAt: now, cashoutId: id });
        return entry;
      }
      const counter = await ops.counter(ctx, {
        businessDate: quote.counterDate || quote.date,
        allowReservation: quote.reservationId,
        allowOwnerWithoutJoining: true
      });
      if (counter.ledger.countReservation?.id !== quote.reservationId || counter.ledger.countReservation?.uid !== ctx.actor.uid || counter.ledger.revision !== quote.handoverRevision) p.fail('Counter activity changed. Cancel and start a fresh count.');
      const totals = await cashoutSummary(ctx, quote.date, counter),
        immutableTotals = ['expectedDrawerPaise', 'cashRefundPaise', 'windowRefundPaise', 'ordinaryCashExpensePaise', 'vendorCashPaymentPaise', 'posRefundDayRevision', 'posRefundDayTotalPaise', 'lateCashout', 'counterDate', 'lateCashoutCarryoverPaise', 'lateCashoutOpeningReconciliationId', 'currentExpectedDrawerPaise'];
      for (const key of immutableTotals) if ((totals[key] ?? null) !== (quote[key] ?? null)) p.fail('Source totals changed during counting. Recount with a fresh quote.');
      if (totals.lateCashout && counted > totals.lateCashoutCarryoverPaise) p.fail('Late Cashout cannot remove today\'s collections. Count only cash being handed over for the previous day.');
      if (totals.lateCashout && counted > totals.currentExpectedDrawerPaise) p.fail('Cash being removed exceeds the current shared drawer expectation. No Cashout was posted.');
      const difference = totals.expectedDrawerPaise - counted;
      if (difference !== 0) p.text(d.reason, 'Discrepancy reason');
      const id = 'daily-cashout-' + ctx.operationId,
        controlRef = ref('cashMovementControl', 'main'),
        control = await ctx.tx.get(controlRef),
        holderRecords = await ops.holderRecords(ctx.tx),
        salesId = 'sale-single-store-' + quote.date,
        salesSnapshot = await ctx.tx.get(ref('sales', salesId)),
        existingSales = salesSnapshot.data();
      const recordedSourceTotals = { ...totals };
      if (totals.lateCashout) {
        for (const key of ['lateCashout', 'counterDate', 'lateCashoutCarryoverPaise', 'lateCashoutOpeningReconciliationId', 'currentExpectedDrawerPaise', 'openingCheckpointPaise', 'subsequentNetCashPaise', 'checkpointId']) delete recordedSourceTotals[key];
      }
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
          sourceTotals: recordedSourceTotals,
          discrepancyReason: p.text(d.reason, 'Reason', true),
          reviewStatus: difference ? 'pending' : 'matched',
          ...(totals.lateCashout ? { lateCashoutVersion: 1, lateCashoutCounterDate: totals.counterDate, lateCashoutOpeningReconciliationId: totals.lateCashoutOpeningReconciliationId } : {}),
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
        kind: totals.lateCashout ? 'late-cashout' : 'daily-cashout',
        expectedBeforePaise: totals.expectedDrawerPaise,
        countedPaise: counted,
        differencePaise: counted - totals.expectedDrawerPaise,
        removedPaise: counted,
        closingBalancePaise: 0,
        subsequentNetCashPaise: totals.lateCashout ? totals.subsequentNetCashPaise : 0,
        resultingBalancePaise: totals.lateCashout ? totals.currentExpectedDrawerPaise - counted : 0,
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
        counterSession: totals.lateCashout ? counter.ledger.counterSession : {
          ...counter.ledger.counterSession,
          status: 'closed'
        },
        checkpoint: {
          ...counter.ledger.checkpoint,
          cashActualPaise: totals.lateCashout ? totals.currentExpectedDrawerPaise - counted : 0,
          cashNetPaise: counter.ledger.cashNetPaise
        }
      }));
      if (totals.lateCashout && counter.cashier) ctx.writes.push(() => ctx.tx.set(counter.cashierRef, {
        ...counter.cashier,
        needsLogoutCheck: true,
        updatedAt: now,
        lastFinancialOperationId: ctx.operationId
      }));
      queue(ctx, 'financeCashoutQuotes', d.quoteId, {
        ...quote,
        closedAt: now,
        cashoutId: id
      });
      return entry;
    });
  }
  async function applyHistoricalDrawerDebit(request) {
    const d = p.object(request.data, ['operationId', 'cashoutId', 'expectedRevision', 'reason']);
    p.text(d.reason, 'Correction reason');
    if (d.reason.trim().length < 5) p.fail('Correction reason must be at least five characters.', 'invalid-argument');
    return run(request, 'cashout-drawer-debit', d, ['owner'], async ctx => {
      const entrySnapshot = await ctx.tx.get(ref('dailyCashouts', p.id(d.cashoutId))),
        entry = entrySnapshot.data();
      if (!entry || entry.historicalCountOnlyVersion !== 1) p.fail('Only an unapplied historical Cashout can be applied to the live drawer.');
      if (entry.historicalCashTiming === 'already-removed' || entry.drawerDebitReversalOperationId) p.fail('Cash already removed earlier cannot be deducted from the drawer again.');
      v.assertExpectedRevision(entry.revision || 1, d.expectedRevision);
      if (entry.drawerDebitOperationId || Number.isSafeInteger(entry.drawerDebitPaise)) p.fail('This Cashout has already been applied to the virtual drawer.');
      const closureId = entry.drawerClosureId || entry.id,
        closureRef = posRef('drawerClosures', closureId),
        closureSnapshot = await ctx.tx.get(closureRef),
        closure = closureSnapshot.data();
      if (!closure || closure.kind !== 'historical-cashout' || closure.cashoutId !== entry.id) p.fail('Historical Cashout closure evidence is missing. No drawer change was posted.');
      const ledgerRef = posRef('handover', 'main'),
        ledgerSnapshot = await ctx.tx.get(ledgerRef),
        ledger = ledgerSnapshot.data();
      if (!ledger?.initialized || !ledger.checkpoint) p.fail('The shared cash drawer is unavailable. No correction was posted.');
      if (activeCount(ledger, ctx.nowMs)) p.fail('The shared drawer is being counted. Wait for the count to finish or be cancelled.');
      const amountPaise = recordedCashoutPaise(entry),
        beforePaise = p.expectedCash(ledger);
      if (amountPaise > beforePaise) p.fail('Cashout amount exceeds the current virtual drawer. No correction was posted.');
      const afterPaise = beforePaise - amountPaise,
        now = ctx.timestamp,
        nextEntry = {
          ...entry,
          drawerDebitPaise: amountPaise,
          drawerBalanceBeforePaise: beforePaise,
          drawerBalanceAfterPaise: afterPaise,
          drawerDebitAt: now,
          drawerDebitByUid: ctx.actor.uid,
          drawerDebitOperationId: ctx.operationId,
          drawerDebitReason: d.reason,
          drawerDebitCheckpoint: ledger.checkpoint,
          revision: (entry.revision || 1) + 1,
          updatedAt: now,
          updatedBy: ctx.actor.name
        },
        nextClosure = {
          ...closure,
          expectedBeforePaise: beforePaise,
          differencePaise: amountPaise - beforePaise,
          closingBalancePaise: afterPaise,
          resultingBalancePaise: afterPaise,
          drawerDebitOperationId: ctx.operationId,
          drawerDebitAt: now,
          drawerDebitByUid: ctx.actor.uid
        };
      queue(ctx, 'dailyCashouts', entry.id, nextEntry);
      ctx.writes.push(() => ctx.tx.set(closureRef, nextClosure));
      ctx.writes.push(() => ctx.tx.set(ledgerRef, {
        ...ledger,
        cashNetPaise: p.safe(ledger.cashNetPaise - amountPaise),
        revision: ledger.revision + 1,
        lastOperation: 'cashout-close',
        lastOperationId: ctx.operationId,
        updatedByUid: ctx.actor.uid
      }));
      const control = (await ctx.tx.get(ref('cashMovementControl', 'main'))).data();
      queue(ctx, 'cashMovementControl', 'main', {
        revision: (control?.revision || 0) + 1,
        lastOperation: 'cashout-drawer-debit',
        lastOperationId: ctx.operationId,
        updatedAt: now
      });
      return { cashoutId: entry.id, amountPaise, beforePaise, afterPaise, appliedAt: now, drawerDebitCheckpoint: ledger.checkpoint };
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
      for (const key of ['cashSales', 'upiSales', 'cardSales', 'returns', 'cashExpense']) if (values[key] !== entry[key]) p.fail('Trusted source totals cannot be edited. Correct the linked source or physical count only.');
      if (entry.historicalCountOnlyVersion === 1 ? values.cashAudit !== 0 : values.cashAudit !== entry.cashAudit) p.fail('Trusted source totals cannot be edited. Correct the linked source or physical count only.');
    }
    return c.normalizeCorrectionValues(values, entry.refundAccountingVersion === 1);
  }
  async function applyCorrection(ctx, request, entry) {
    v.assertExpectedRevision(entry.revision || 1, request.sourceRevision);
    if (!c.cashoutCorrectionValuesEqual(c.correctionValuesFromEntry(entry), request.before, entry.refundAccountingVersion === 1)) p.fail('Cashout changed after the request.');
    validateValues(entry, request.proposed);
    const next = c.cashoutEntryFromCorrection(entry, request.proposed, ctx.actor.name, ctx.timestamp);
    let drawerAdjustment = null;
    if (entry.historicalCountOnlyVersion === 1 && entry.drawerDebitOperationId && entry.historicalCashTiming !== 'already-removed' && !entry.drawerDebitReversalOperationId) {
      const amountPaise = p.rupees(next.drawerTotal, 'Corrected historical Cashout'),
        previousAmountPaise = p.paise(entry.drawerDebitPaise ?? entry.cashRemovedPaise ?? Math.round(entry.drawerTotal * 100), 'Previously applied Cashout'),
        deltaPaise = amountPaise - previousAmountPaise,
        ledgerRef = posRef('handover', 'main'),
        ledgerSnapshot = await ctx.tx.get(ledgerRef),
        ledger = ledgerSnapshot.data();
      if (!ledger?.initialized || !ledger.checkpoint) p.fail('The shared drawer is unavailable. No correction was posted.');
      if (activeCount(ledger, ctx.nowMs)) p.fail('The shared drawer is being counted. Wait for the count to finish or be cancelled.');
      const beforePaise = p.expectedCash(ledger);
      if (deltaPaise > beforePaise) p.fail('Correction would make the virtual drawer negative. No correction was posted.');
      const afterPaise = beforePaise - deltaPaise;
      next.cashRemovedPaise = amountPaise;
      next.drawerDebitPaise = amountPaise;
      next.drawerBalanceBeforePaise = beforePaise;
      next.drawerBalanceAfterPaise = afterPaise;
      next.drawerDebitAt = ctx.timestamp;
      next.drawerDebitByUid = ctx.actor.uid;
      next.drawerDebitOperationId = ctx.operationId;
      next.drawerDebitReason = request.reason;
      next.drawerDebitCheckpoint = ledger.checkpoint;
      drawerAdjustment = { ledgerRef, ledger, amountPaise: deltaPaise, beforePaise, afterPaise };
      const closureRef = posRef('drawerClosures', entry.drawerClosureId || entry.id),
        closureSnapshot = await ctx.tx.get(closureRef),
        closure = closureSnapshot.data();
      if (!closure) p.fail('Historical Cashout closure evidence is missing. No correction was posted.');
      ctx.writes.push(() => ctx.tx.set(closureRef, {
        ...closure,
        countedPaise: amountPaise,
        removedPaise: amountPaise,
        expectedBeforePaise: beforePaise,
        differencePaise: amountPaise - beforePaise,
        closingBalancePaise: afterPaise,
        resultingBalancePaise: afterPaise,
        drawerDebitOperationId: ctx.operationId,
        drawerDebitAt: ctx.timestamp,
        drawerDebitByUid: ctx.actor.uid
      }));
    }
    const records = await ops.holderRecords(ctx.tx);
    if (entry.historicalCountOnlyVersion === 1) {
      next.cashAudit = null;
      next.auditDifference = null;
      next.auditStatus = 'not-reconciled';
      next.auditMessage = 'Historical physical count recorded. Expected drawer could not be independently reconstructed.';
      next.pendingCashParticulars = 'Historical physical cash count recorded by: ' + entry.recordedBy + '\nExpected drawer: unavailable for this historical count.';
    }
    records.cashouts = records.cashouts.map(s => s.id === entry.id ? {
      id: entry.id,
      data: next
    } : s);
    if (ops.holderBalances(records).some(s => s.amountPaise < 0)) p.fail('Correction would create a negative held-cash balance.');
    const control = (await ctx.tx.get(ref('cashMovementControl', 'main'))).data();
    await syncSales(ctx, next, entry);
    queue(ctx, 'dailyCashouts', entry.id, next);
    if (drawerAdjustment && drawerAdjustment.amountPaise !== 0) ctx.writes.push(() => ctx.tx.set(drawerAdjustment.ledgerRef, {
      ...drawerAdjustment.ledger,
      cashNetPaise: p.safe(drawerAdjustment.ledger.cashNetPaise - drawerAdjustment.amountPaise),
      revision: drawerAdjustment.ledger.revision + 1,
      lastOperation: 'cashout-correction',
      lastOperationId: ctx.operationId,
      updatedByUid: ctx.actor.uid
    }));
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
    p.object(request.data, ['date', 'expenseReconciliation', 'drawerReversal']);
    p.date(request.data.date);
    if (request.data.expenseReconciliation !== undefined && request.data.expenseReconciliation !== true) p.fail('Invalid expense review request.', 'invalid-argument');
    if (request.data.drawerReversal !== undefined && request.data.drawerReversal !== true || request.data.drawerReversal && request.data.expenseReconciliation) p.fail('Invalid drawer correction review request.', 'invalid-argument');
    return db.runTransaction(async tx => {
      const actor = await ops.actorFor(tx, request, request.data.expenseReconciliation || request.data.drawerReversal ? ['owner'] : p.STAFF),
        timestamp = new Date(ops.clock()).toISOString(),
        counterDate = p.istDate(timestamp);
      if (request.data.expenseReconciliation) return historicalExpenses.publicView(await historicalExpenses.inspect({ tx, actor, timestamp }, request.data.date));
      if (request.data.drawerReversal) return drawerReversal.publicView(await drawerReversal.inspect({ tx, actor, timestamp, nowMs: ops.clock() }, request.data.date));
      if (isHistoricalDate(request.data.date, timestamp)) return historicalCashoutSummary({ tx, actor, timestamp }, request.data.date);
      const ledger = (await tx.get(posRef('handover', 'main'))).data();
      if (!ledger?.initialized || !ledger.checkpoint) p.fail('The shared drawer has no completed opening count.');
      const counter = await ops.counter({ tx, actor, request, nowMs: ops.clock(), timestamp }, {
        businessDate: counterDate,
        allowOwnerWithoutJoining: true
      });
      return cashoutSummary({
        tx,
        actor,
        timestamp
      }, request.data.date, counter);
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
    applyHistoricalDrawerDebit,
    reconcileExpenses: historicalExpenses.reconcile,
    reverseHistoricalDrawer: drawerReversal.reverse,
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
