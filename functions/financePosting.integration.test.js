const {
  describe,
  it,
  beforeEach,
  after
} = require('node:test');
const assert = require('node:assert/strict');
const {
  randomUUID
} = require('node:crypto');
const {
  createFinanceOperations,
  expectedCash
} = require('./financeOperations');
const { createVendorBalanceCutoverHandlers } = require('./vendorBalanceCutover');
const {
  createRegisterHandlers
} = require('./registerPayments');
const {
  createVendorDecisionHandlers
} = require('./vendorFinanceDecisions');
const {
  createCashoutHandlers
} = require('./financeCashout');
const {
  createTransferHandler
} = require('./financeTransfers');
describe('trusted finance posting in an independent demo emulator database', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST
}, () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Loopback Firestore required');
  const {
      initializeApp,
      deleteApp
    } = require('firebase-admin/app'),
    {
      getFirestore,
      Timestamp
    } = require('firebase-admin/firestore'),
    project = 'demo-finance-posting',
    app = initializeApp({
      projectId: project
    }, 'finance-posting-tests'),
    db = getFirestore(app),
    base = 'posSandboxes/test';
  let now = Date.parse('2026-10-15T05:00:00.000Z');
  const ops = createFinanceOperations(db, () => now),
    register = createRegisterHandlers(ops),
    vendorBalanceCutover = createVendorBalanceCutoverHandlers(ops),
    decisions = createVendorDecisionHandlers(ops, register),
    cashout = createCashoutHandlers(ops),
    transfer = createTransferHandler(ops);
  const req = (data, uid = 'billing') => ({
      auth: {
        uid,
        token: {
          auth_time: 42
        }
      },
      data: {
        operationId: randomUUID(),
        ...data
      }
    }),
    read = async p => (await db.doc(p).get()).data(),
    expense = (amount = 10000, extra = {}) => ({
      amountPaise: amount,
      category: 'Electricity',
      paidTo: 'Synthetic utility',
      mode: 'cash',
      notes: 'Fixture expense',
      ...extra
    }),
    payment = (amount = 20000, extra = {}) => ({
      id: randomUUID(),
      vendorId: 'vendor',
      date: '2026-10-15',
      amountPaise: amount,
      mode: 'cash',
      invoiceId: 'invoice',
      notes: 'Fixture payment',
      ...extra
    }),
    count = {
      denom500: 1,
      denom200: 1,
      denom100: 0,
      denom50: 0,
      denom20: 0,
      denom10: 0,
      change: 0
    };
  const prepareCashout = request => cashout.prepare({ ...request, data: { ...request.data, ...(request.data.date < new Date(now + 19800000).toISOString().slice(0, 10) ? { historicalCashTiming: 'remove-now' } : {}) } });
  beforeEach(async () => {
    now = Date.parse('2026-10-15T05:00:00.000Z');
    assert.equal((await db.collection('loans').limit(1).get()).size, 0);
    assert.equal((await fetch('http://127.0.0.1:8080/emulator/v1/projects/' + project + '/databases/(default)/documents', {
      method: 'DELETE'
    })).ok, true);
    const batch = db.batch();
    for (const [uid, role] of [['owner', 'owner'], ['billing', 'billing'], ['manager', 'manager'], ['disabled', 'billing']]) {
      batch.set(db.doc('users/' + uid), {
        name: 'Synthetic ' + uid,
        role,
        disabled: uid === 'disabled',
        approvalStatus: 'approved'
      });
      batch.set(db.doc(base + '/cashierStates/' + uid), {
        uid,
        authTime: 42,
        closed: false,
        needsLogoutCheck: false,
        joinedCounterId: 'opening'
      });
    }
    batch.set(db.doc(base + '/handover/main'), {
      initialized: true,
      revision: 1,
      cashNetPaise: 0,
      dailyTotals: {
        '2026-10-15': {
          upi: 0,
          card: 0
        }
      },
      checkpoint: {
        date: '2026-10-15',
        cashActualPaise: 100000,
        cashNetPaise: 0,
        upiActualPaise: 0,
        cardActualPaise: 0,
        upiNetPaise: 0,
        cardNetPaise: 0,
        reconciliationId: 'opening'
      },
      counterSession: {
        status: 'open',
        date: '2026-10-15',
        openingReconciliationId: 'opening',
        openedByUid: 'owner'
      },
      countReservation: null
    });
    batch.set(db.doc('appMetadata/vendorLedgerV2Config'), {
      enabled: true,
      activationDate: '2026-10-01'
    });
    batch.set(db.doc('appMetadata/appSettings'), {
      currentBankBalance: 5000
    });
    batch.set(db.doc('bankBalanceControl/main'), {
      initialized: true,
      balancePaise: 500000,
      revision: 1
    });
    batch.set(db.doc('vendorsV2/vendor'), {
      id: 'vendor',
      canonicalName: 'Synthetic vendor',
      active: true,
      revision: 1
    });
    batch.set(db.doc('vendorAccountStatesV2/vendor'), {
      id: 'vendor',
      vendorId: 'vendor',
      outstandingPaise: 100000,
      revision: 1
    });
    batch.set(db.doc('invoiceStatesV2/invoice'), {
      id: 'invoice',
      invoiceId: 'invoice',
      vendorId: 'vendor',
      openAmountPaise: 100000,
      reservedAmountPaise: 0,
      revision: 1
    });
    batch.set(db.doc('chequeBooksV2/book-1120-1199'), {
      active: true,
      startNumber: 1120,
      endNumber: 1199,
      revision: 1
    });
    batch.set(db.doc('purchasesV2/historical'), {
      id: 'historical',
      vendorId: 'vendor',
      invoiceTotalPaise: 12345,
      createdAt: '2026-10-01T05:00:00Z'
    });
    batch.set(db.doc('purchasesV2/invoice'), {
      id: 'invoice', vendorId: 'vendor', invoiceTotalPaise: 100000, invoiceDate: '2026-10-15'
    });
    await batch.commit();
  });
  after(async () => deleteApp(app));
  it('posts expense once with trusted actor, cash debit and recoverable original result', async () => {
    const r = req(expense());
    const first = await register.expense(r);
    assert.equal(first.amountPaise, 10000);
    assert.equal(first.postedByUid, 'billing');
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -10000);
    assert.equal((await read(base + '/cashierStates/billing')).needsLogoutCheck, true);
    now += 86400000;
    await db.doc(base + '/handover/main').update({
      'counterSession.status': 'closed'
    });
    assert.deepEqual(await register.expense(r), first);
    await assert.rejects(register.expense({
      ...r,
      data: {
        ...r.data,
        amountPaise: 20000
      }
    }), /different actor or intent/);
    await assert.rejects(register.expense({
      ...r,
      auth: {
        uid: 'owner',
        token: {
          auth_time: 42
        }
      }
    }), /different actor or intent/);
    assert.equal((await db.collection('cashouts').get()).size, 1);
  });
  it('rejects forged actor, categories, fractional paise and disabled identities without effects', async () => {
    for (const data of [expense(1, {
      postedByUid: 'owner'
    }), expense(-1), expense(0.5), expense(1, {
      category: 'POS Refund'
    }), expense(1, {
      category: 'Invented'
    })]) await assert.rejects(register.expense(req(data)));
    await assert.rejects(register.expense(req(expense(), 'disabled')), /account cannot/);
    await assert.rejects(register.expense({
      auth: null,
      data: req(expense()).data
    }), /Sign in/);
    assert.equal((await db.collection('cashouts').get()).size, 0);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('preserves permitted zero expenses without an invented cash debit', async () => {
    await register.expense(req(expense(0)));
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('rejects count locks, stale membership and insufficient cash', async () => {
    await db.doc(base + '/handover/main').update({
      countReservation: {
        id: 'count',
        name: 'Other',
        startedAt: Timestamp.fromMillis(now)
      }
    });
    await assert.rejects(register.expense(req(expense())), /being counted/);
    now += 300000;
    await assert.rejects(register.expense(req(expense(100001))), /insufficient/);
    await assert.rejects(register.expense({
      ...req(expense()),
      auth: {
        uid: 'billing',
        token: {
          auth_time: 999
        }
      }
    }), /Join/);
    assert.equal((await db.collection('cashouts').get()).size, 0);
  });
  it('atomically links vendor cash payment, payable, invoice, allocation and outflow', async () => {
    const r = req(payment());
    await register.settlement(r);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 80000);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise, 80000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -20000);
    const out = (await db.collection('cashouts').get()).docs[0].data();
    assert.equal(out.category, 'Vendor Payment');
    assert.equal(out.sourceRecordId, r.data.id);
    assert.equal((await db.collection('invoiceAllocationsV2').get()).size, 1);
    await register.settlement(r);
    assert.equal((await db.collection('cashouts').get()).size, 1);
    assert.equal((await read('purchasesV2/historical')).invoiceTotalPaise, 12345);
  });
  it('resets balances once, keeps old invoices/payments historical, and captures opening payable on the first new payment', async () => {
    await db.doc('vendorAccountStatesV2/vendor').update({ outstandingPaise: 80000 });
    await db.doc('invoiceStatesV2/invoice').update({ openAmountPaise: 80000 });
    await db.doc('vendorSettlementsV2/old-payment').set({ id: 'old-payment', vendorId: 'vendor', date: '2026-10-10', amountPaise: 20000, mode: 'bank-transfer', notes: 'Historical synthetic payment', revision: 1 });
    await db.doc('vendorSettlementStatesV2/old-payment').set({ id: 'old-payment', settlementId: 'old-payment', vendorId: 'vendor', date: '2026-10-10', amountPaise: 20000, mode: 'bank-transfer', notes: 'Historical synthetic payment', revision: 1, updatedAt: '2026-10-10T05:00:00.000Z', updatedByUserId: 'owner' });
    await db.doc('vendorLedgerCorrectionRequestsV2/old-correction').set({ id: 'old-correction', sourceRecordId: 'old-payment', status: 'pending' });
    await db.doc('chequesV2/1130').set({ id: '1130', chequeNumber: '1130', chequeNumberValue: 1130, purpose: 'vendor-payment', sourceRecordId: 'old-cheque', vendorId: 'vendor', date: '2026-10-15', amountPaise: 5000, status: 'issued', origin: 'v2', trackingOnly: false, revision: 1 });
    await db.doc('vendorReturnsV2/old-return').set({ id: 'old-return', vendorId: 'vendor', date: '2026-10-10', outcome: 'pending', valuePaise: 1000, revision: 1 });
    const reset = req({ cutoverId: 'test-cutover-20261015', cutoverDate: '2026-10-15', reason: 'Synthetic test cutover', confirmation: 'RESET VENDOR BALANCES 2026-10-15' }, 'owner');
    const result = await vendorBalanceCutover.reset(reset);
    assert.equal(result.payableBeforePaise, 80000);
    assert.equal(result.pendingCorrectionCount, 1);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 0);
    assert.equal((await read('invoiceStatesV2/invoice')).cutoverStatus, 'historical');
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise, 0);
    assert.equal((await read('vendorSettlementsV2/old-payment')).cutoverHistoricalOnly, true);
    assert.equal((await read('vendorSettlementStatesV2/old-payment')).cutoverHistoricalOnly, true);
    assert.equal((await read('vendorLedgerCorrectionRequestsV2/old-correction')).status, 'rejected');
    assert.equal((await read('chequesV2/1130')).cutoverTrackingOnly, true);
    assert.equal((await read('vendorReturnsV2/old-return')).cutoverHistoricalOnly, true);
    const historicalReturn = req({ returnId: 'old-return', expectedRevision: 2, outcome: 'vendor-credit', creditedValuePaise: 1000, outcomeReason: 'Old period credit note', creditNoteNumber: 'OLD-CN-1', creditNoteDate: '2026-10-15' }, 'owner');
    await decisions.resolveReturn(historicalReturn);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 0);
    const ledgerBeforeChequeOutcome = (await db.collection('vendorLedgerEntriesV2').get()).size;
    await register.transitionCheque(req({ chequeNumber: '1130', expectedRevision: 2, toStatus: 'debited', reason: 'Confirmed old bank debit' }, 'owner'));
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 0);
    assert.equal((await db.collection('vendorLedgerEntriesV2').get()).size, ledgerBeforeChequeOutcome);
    assert.equal((await read('chequesV2/1130')).status, 'debited');
    await assert.rejects(decisions.correct(req({ id: 'late-correction', sourceRecordId: 'old-payment', expectedRevision: 1, proposed: { date: '2026-10-15', amountPaise: 19000, mode: 'bank-transfer', notes: 'Attempted historical correction' }, reason: 'Synthetic test' }, 'owner')), /previous payable period/i);
    await register.settlement(req({ id: 'new-payment', vendorId: 'vendor', date: '2026-10-15', amountPaise: 10000, mode: 'bank-transfer', notes: 'New period payment', openingBalancePaise: 50000 }, 'owner'));
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 40000);
    assert.equal((await read('vendorsV2/vendor')).cutoverOpeningCaptured, true);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise, 0);
    await assert.rejects(vendorBalanceCutover.reset(req({ ...reset.data, operationId: randomUUID() }, 'owner')), /cutover already exists/i);
  });
  it('serializes concurrent terminals spending the same counter/payable', async () => {
    const results = await Promise.allSettled([register.settlement(req(payment(70000), 'billing')), register.settlement(req(payment(70000), 'manager'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 30000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -70000);
    assert.equal((await db.collection('cashouts').get()).size, 1);
  });
  it('posts bank-funded expense and vendor payment once without requiring or changing an app bank balance', async () => {
    await register.expense(req(expense(10000, {
      mode: 'bank-transfer'
    })));
    await register.settlement(req(payment(20000, {
      mode: 'bank-transfer'
    })));
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 500000);
    assert.equal((await read('appMetadata/appSettings')).currentBankBalance, 5000);
    assert.equal((await db.collection('cashouts').get()).size, 2);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 80000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('posts bank transactions when no balance record exists and leaves no balance mirror behind', async () => {
    await db.doc('bankBalanceControl/main').delete();
    await db.doc('appMetadata/appSettings').delete();
    const outflow = await register.expense(req(expense(100, { mode: 'bank-transfer' })));
    await register.settlement(req(payment(10000, { mode: 'bank-transfer' })));
    assert.equal(outflow.paymentMode, 'Bank Transfer');
    assert.equal((await read('cashouts/' + outflow.id)).amountPaise, 100);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 90000);
    assert.equal((await db.collection('vendorSettlementsV2').get()).size, 1);
    assert.equal((await read('bankBalanceControl/main')), undefined);
    assert.equal((await read('appMetadata/appSettings')), undefined);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
    assert.equal(register.bankBaseline, undefined);
  });
  it('starts cheques Issued, auto-presents when due, Not yet does not debit, Yes debits once', async () => {
    const r = req({
      purpose: 'vendor-payment',
      chequeBookId: 'book-1120-1199',
      chequeNumber: '1120',
      vendorId: 'vendor',
      invoiceId: 'invoice',
      date: '2026-10-15',
      amountPaise: 20000
    }, 'owner');
    const created = await register.cheque(r);
    assert.equal(created.cheque.status, 'issued');
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 100000);
    assert.equal((await read('invoiceStatesV2/invoice')).reservedAmountPaise, 20000);
    const presented = await register.presentDue({
      auth: r.auth,
      data: {
        chequeNumber: '1120'
      }
    });
    assert.equal(presented.status, 'presented');
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 500000);
    const checked = await register.transitionCheque(req({
      chequeNumber: '1120',
      expectedRevision: presented.revision,
      toStatus: 'not-yet'
    }, 'owner'));
    const debit = req({
      chequeNumber: '1120',
      expectedRevision: checked.cheque.revision,
      toStatus: 'debited'
    }, 'owner');
    const debited = await register.transitionCheque(debit);
    await register.transitionCheque(debit);
    for (const toStatus of ['issued', 'presented', 'not-yet', 'cancelled', 'bounced', 'debited']) {
      await assert.rejects(register.transitionCheque(req({
        chequeNumber: '1120',
        expectedRevision: debited.cheque.revision,
        toStatus
      }, 'owner')));
    }
    assert.equal((await read('chequesV2/1120')).status, 'debited');
    assert.equal((await read('chequesV2/1120')).revision, debited.cheque.revision);
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 500000);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 80000);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise, 80000);
    assert.equal((await read('invoiceStatesV2/invoice')).reservedAmountPaise, 0);
    assert.equal((await db.collection('cashouts').get()).size, 1);
  });
  it('staff cannot issue/confirm cheques without existing capabilities', async () => {
    await assert.rejects(register.cheque(req({
      purpose: 'vendor-payment',
      chequeBookId: 'book-1120-1199',
      chequeNumber: '1121',
      vendorId: 'vendor',
      date: '2026-10-15',
      amountPaise: 10000
    })), /cannot perform/);
    assert.equal((await db.collection('chequesV2').get()).size, 0);
  });
  it('cancellation releases reserved invoice without paying or restoring bank cash', async () => {
    await register.cheque(req({
      purpose: 'vendor-payment',
      chequeBookId: 'book-1120-1199',
      chequeNumber: '1121',
      vendorId: 'vendor',
      invoiceId: 'invoice',
      date: '2026-10-16',
      amountPaise: 10000
    }, 'owner'));
    await register.transitionCheque(req({
      chequeNumber: '1121',
      expectedRevision: 1,
      toStatus: 'cancelled',
      reason: 'Fixture cancelled before debit'
    }, 'owner'));
    assert.equal((await read('invoiceStatesV2/invoice')).reservedAmountPaise, 0);
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 500000);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 100000);
  });
  it('expense cheques debit bank once and keep the original source linked', async () => {
    const r = await register.cheque(req({
      purpose: 'expense',
      chequeBookId: 'book-1120-1199',
      chequeNumber: '1122',
      date: '2026-10-15',
      amountPaise: 5000,
      paidTo: 'Utility',
      category: 'Electricity'
    }, 'owner'));
    await register.transitionCheque(req({
      chequeNumber: '1122',
      expectedRevision: 1,
      toStatus: 'debited'
    }, 'owner'));
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 500000);
    assert.equal((await read('cashouts/' + r.cheque.sourceRecordId)).paymentStatus, 'debited');
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('owner review never reapplies money', async () => {
    const first = await register.expense(req(expense()));
    await decisions.reviewOutflow(req({
      outflowId: first.id,
      expectedRevision: 1
    }, 'owner'));
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -10000);
    assert.equal((await read('cashouts/' + first.id)).reviewStatus, 'reviewed');
  });
  it('server Cashout locks new payouts and closes/assigns counted money exactly once', async () => {
    await register.expense(req(expense(10000)));
    await register.settlement(req(payment(20000)));
    const quote = await prepareCashout(req({
      date: '2026-10-15'
    }, 'owner'));
    assert.equal(quote.expectedDrawerPaise, 70000);
    assert.equal(quote.ordinaryCashExpensePaise, 10000);
    assert.equal(quote.vendorCashPaymentPaise, 20000);
    await assert.rejects(register.expense(req(expense(100))), /being counted/);
    const r = req({
        quoteId: quote.id,
        drawerDenominations: count,
        creditSales: 0,
        reason: ''
      }, 'owner'),
      closed = await cashout.close(r);
    assert.equal(closed.drawerTotal, 700);
    assert.equal(closed.cashAudit, 700);
    assert.equal(closed.cashExpense, 300);
    assert.deepEqual(await cashout.close(r), closed);
    assert.equal((await db.collection('dailyCashouts').get()).size, 1);
    assert.equal((await read(base + '/handover/main')).counterSession.status, 'closed');
    assert.equal((await read(base + '/handover/main')).checkpoint.cashActualPaise, 0);
    assert.equal(closed.holderBalancesAtClose.find(v => v.userId === 'owner').amountPaise, 70000);
  });
  it('overnight counter accepts the current count for expenses, payments and Cashout without rewriting its opening', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    await db.doc(base + '/handover/main').update({
      'checkpoint.date': '2026-10-16',
      'checkpoint.reconciliationId': 'count-16',
    });
    const opening = { id: 'opening', kind: 'login', date: '2026-10-15', actual: { cash: 100000, upi: 0, card: 0 } };
    const latestCount = { id: 'count-16', kind: 'logout', date: '2026-10-16', actual: { cash: 100000, upi: 0, card: 0 } };
    const priorBill = { id: 'prior-bill', businessDate: '2026-10-15', createdAt: '2026-10-15T10:00:00.000Z', payments: [{ method: 'cash', amountPaise: 25000 }] };
    await db.doc(base + '/reconciliations/opening').set(opening);
    await db.doc(base + '/reconciliations/count-16').set(latestCount);
    await db.doc(base + '/bills/prior-bill').set(priorBill);
    const expenseRequest = req(expense(10000));
    const paymentRequest = req(payment(20000, { date: '2026-10-16' }));
    const outflow = await register.expense(expenseRequest);
    const settlement = await register.settlement(paymentRequest);
    // Independently: counted 100000 - expense 10000 - vendor payment 20000 = 70000 paise.
    assert.equal(expectedCash(await read(base + '/handover/main')), 70000);
    const preview = await cashout.readSummary({ auth: req({}).auth, data: { date: '2026-10-16' } });
    assert.equal(preview.counterDate, '2026-10-16');
    assert.equal(preview.lateCashout, false);
    assert.equal(preview.grossMethods.cash, 0, 'Prior-day bill must not become today sales');
    const quote = await prepareCashout(req({ date: '2026-10-16' }, 'owner'));
    assert.equal(quote.expectedDrawerPaise, 70000);
    assert.equal(quote.ordinaryCashExpensePaise, 10000);
    assert.equal(quote.vendorCashPaymentPaise, 20000);
    const closeRequest = req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: '' }, 'owner');
    const entry = await cashout.close(closeRequest);
    assert.equal(entry.date, '2026-10-16');
    assert.equal(entry.cashSales, 0);
    assert.equal(entry.cashExpense, 300);
    assert.equal(entry.cashRemovedPaise, 70000);
    assert.equal(entry.holderBalancesAtClose.find(v => v.userId === 'owner').amountPaise, 70000);
    const closed = await read(base + '/handover/main');
    assert.equal(closed.counterSession.status, 'closed');
    assert.equal(closed.counterSession.date, '2026-10-15');
    assert.equal(closed.counterSession.openingReconciliationId, 'opening');
    assert.equal(closed.checkpoint.date, '2026-10-16');
    assert.equal(expectedCash(closed), 0);
    assert.deepEqual(await read(base + '/reconciliations/opening'), opening);
    assert.deepEqual(await read(base + '/reconciliations/count-16'), latestCount);
    assert.deepEqual(await read(base + '/bills/prior-bill'), priorBill);
    assert.deepEqual(await register.expense(expenseRequest), outflow);
    assert.deepEqual(await register.settlement(paymentRequest), settlement);
    assert.deepEqual(await cashout.close(closeRequest), entry);
    assert.equal((await db.collection('dailyCashouts').get()).size, 1);
    assert.equal((await db.collection('cashouts').get()).size, 2);
    assert.equal(expectedCash(await read(base + '/handover/main')), 0);
  });
  it('overnight counter blocks stale counts and closed counters without partial cash writes', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    for (const patch of [{ 'checkpoint.date': '2026-10-15' }, { 'checkpoint.date': '2026-10-16', 'counterSession.status': 'closed' }]) {
      await db.doc(base + '/handover/main').update(patch);
      const before = await read(base + '/handover/main');
      await assert.rejects(register.expense(req(expense())), /Open.*counter/);
      await assert.rejects(prepareCashout(req({ date: '2026-10-16' }, 'owner')), /Open.*counter/);
      assert.deepEqual(await read(base + '/handover/main'), before);
      assert.equal((await db.collection('cashouts').get()).size, 0);
      assert.equal((await db.collection('financeCashoutQuotes').get()).size, 0);
      assert.equal((await db.collection('financeOperations').get()).size, 0);
    }
  });
  it('records a historical Cashout and debits its counted cash from the current virtual drawer', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    await db.doc(base + '/handover/main').update({
      counterSession: { status: 'closed', date: '2026-10-15' },
      revision: 8,
      cashNetPaise: 118000,
    });
    await db.doc(base + '/bills/sale-15').set({
      id: 'sale-15', businessDate: '2026-10-15', createdAt: '2026-10-15T12:00:00.000Z',
      payments: [{ method: 'cash', amountPaise: 50000 }, { method: 'upi', amountPaise: 25000 }],
    });
    await db.doc(base + '/bills/sale-16').set({
      id: 'sale-16', businessDate: '2026-10-16', createdAt: '2026-10-16T05:30:00.000Z',
      payments: [{ method: 'cash', amountPaise: 18000 }],
    });
    const liveBefore = await read(base + '/handover/main');
    const preview = await cashout.readSummary({ auth: req({}).auth, data: { date: '2026-10-15' } });
    assert.equal(preview.historicalCashout, true);
    assert.equal(preview.expectedDrawerPaise, null);
    assert.equal(preview.grossMethods.cash, 50000);
    assert.equal(preview.grossMethods.upi, 25000);
    const quote = await prepareCashout(req({ date: '2026-10-15' }));
    assert.equal(quote.historicalCashout, true);
    assert.ok(quote.reservationId);
    assert.equal(quote.currentDrawerPaise, 218000);
    const closeRequest = req({
      quoteId: quote.id,
      drawerDenominations: { denom500: 2, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 0 },
      creditSales: 0,
      reason: 'Missed Cashout; physical cash is held by me',
    }, 'billing');
    const entry = await cashout.close(closeRequest);
    assert.equal(entry.date, '2026-10-15');
    assert.equal(entry.cashSales, 500);
    assert.equal(entry.upiSales, 250);
    assert.equal(entry.drawerTotal, 1000);
    assert.equal(entry.recordedByUserId, 'billing');
    assert.equal(entry.cashAudit, null);
    assert.equal(entry.auditStatus, 'not-reconciled');
    assert.equal(entry.holderBalancesAtClose.find(v => v.userId === 'billing').amountPaise, 100000);
    assert.equal(entry.drawerDebitPaise, 100000);
    assert.equal(entry.drawerBalanceBeforePaise, 218000);
    assert.equal(entry.drawerBalanceAfterPaise, 118000);
    const closure = await read(base + '/drawerClosures/' + entry.id);
    assert.equal(closure.kind, 'historical-cashout');
    assert.equal(closure.closingBalancePaise, 118000);
    assert.equal((await read('sales/sale-single-store-2026-10-15')).cashSales, 500);
    assert.deepEqual(await cashout.close(closeRequest), entry);
    const liveAfter = await read(base + '/handover/main');
    assert.equal(liveAfter.cashNetPaise, 18000);
    assert.equal(expectedCash(liveAfter), 118000);
    assert.equal(liveAfter.revision, liveBefore.revision + 2);
    await assert.rejects(prepareCashout(req({ date: '2026-10-15' }, 'manager')), /already exists/);
    assert.equal((await db.collection('dailyCashouts').where('date', '==', '2026-10-15').get()).size, 1);
  });
  it('applies a legacy historical Cashout debit once and refuses an overdraft', async () => {
    const cashoutId = 'legacy-historical-cashout', operationId = randomUUID();
    await db.doc('dailyCashouts/' + cashoutId).set({
      id: cashoutId, date: '2026-10-30', drawerTotal: 500, remainingBalance: 500,
      cashRemovedPaise: 50000, historicalCountOnlyVersion: 1, revision: 3,
      drawerClosureId: cashoutId, recordedByUserId: 'billing'
    });
    await db.doc(base + '/drawerClosures/' + cashoutId).set({
      id: cashoutId, cashoutId, kind: 'historical-cashout', closingBalancePaise: 100000
    });
    const request = req({ cashoutId, expectedRevision: 3, reason: 'Verified physical cash was removed', operationId }, 'owner');
    const result = await cashout.applyHistoricalDrawerDebit(request);
    assert.equal(result.amountPaise, 50000);
    assert.equal(result.beforePaise, 100000);
    assert.equal(result.afterPaise, 50000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -50000);
    assert.equal((await read('dailyCashouts/' + cashoutId)).drawerDebitOperationId, operationId);
    assert.equal((await read(base + '/drawerClosures/' + cashoutId)).resultingBalancePaise, 50000);
    assert.deepEqual(await cashout.applyHistoricalDrawerDebit(request), result);
    await assert.rejects(cashout.applyHistoricalDrawerDebit(req({
      cashoutId, expectedRevision: 4, reason: 'Try to apply twice'
    }, 'owner')), /already been applied/);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -50000);

    const overdrawId = 'legacy-overdraw-cashout';
    await db.doc('dailyCashouts/' + overdrawId).set({
      id: overdrawId, date: '2026-10-29', drawerTotal: 300, cashRemovedPaise: 30000,
      historicalCountOnlyVersion: 1, revision: 1, drawerClosureId: overdrawId
    });
    await db.doc(base + '/drawerClosures/' + overdrawId).set({
      id: overdrawId, cashoutId: overdrawId, kind: 'historical-cashout'
    });
    await db.doc(base + '/handover/main').update({ cashNetPaise: -90000 });
    await assert.rejects(cashout.applyHistoricalDrawerDebit(req({
      cashoutId: overdrawId, expectedRevision: 1, reason: 'Insufficient cash test'
    }, 'owner')), /exceeds the current virtual drawer/);
    assert.equal((await read('dailyCashouts/' + overdrawId)).drawerDebitOperationId, undefined);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -90000);
  });
  it('rejects a historical Cashout when POS sources change during the physical count', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    const quote = await prepareCashout(req({ date: '2026-10-15' }));
    await db.doc(base + '/bills/late-historical-sale').set({
      id: 'late-historical-sale', businessDate: '2026-10-15', createdAt: '2026-10-15T15:00:00.000Z',
      payments: [{ method: 'cash', amountPaise: 10000 }],
    });
    await assert.rejects(cashout.close(req({
      quoteId: quote.id,
      drawerDenominations: count,
      creditSales: 0,
      reason: 'Historical count with changed source sales',
    })), /Source totals changed/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('expired counts reject without closing and can be cancelled safely', async () => {
    const quote = await prepareCashout(req({
      date: '2026-10-15'
    }, 'owner'));
    now += 300001;
    await assert.rejects(cashout.close(req({
      quoteId: quote.id,
      drawerDenominations: count,
      creditSales: 0,
      reason: 'Expired'
    }, 'owner')), /expired/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    await cashout.cancel(req({
      quoteId: quote.id
    }, 'owner'));
    assert.equal((await read(base + '/handover/main')).countReservation, null);
  });
  it('discrepancy requires reason; review never changes counted cash', async () => {
    const q = await prepareCashout(req({
      date: '2026-10-15'
    }, 'owner'));
    await assert.rejects(cashout.close(req({
      quoteId: q.id,
      drawerDenominations: count,
      creditSales: 0,
      reason: ''
    }, 'owner')), /Discrepancy/);
    const entry = await cashout.close(req({
      quoteId: q.id,
      drawerDenominations: count,
      creditSales: 0,
      reason: 'Fixture short count'
    }, 'owner'));
    assert.equal(entry.auditDifference, 300);
    await cashout.review(req({
      cashoutId: entry.id,
      expectedRevision: 1
    }, 'owner'));
    assert.equal((await read('dailyCashouts/' + entry.id)).drawerTotal, 700);
  });
  it('keeps the existing same-day cash-more discrepancy workflow', async () => {
    const quote = await prepareCashout(req({ date: '2026-10-15' }, 'owner'));
    const entry = await cashout.close(req({
      quoteId: quote.id,
      drawerDenominations: { denom500: 2, denom200: 1, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 0 },
      creditSales: 0,
      reason: 'Extra cash verified'
    }, 'owner'));
    assert.equal(entry.cashAudit, 1000);
    assert.equal(entry.drawerTotal, 1200);
    assert.equal(entry.auditDifference, -200);
    assert.equal(entry.auditStatus, 'cash-more');
    assert.equal((await read(base + '/handover/main')).counterSession.status, 'closed');
  });
  it('Cash Movement records a bank deposit without requiring or mutating an app balance or drawer', async () => {
    await db.doc('bankBalanceControl/main').delete();
    await db.doc('appMetadata/appSettings').delete();
    await db.doc('dailyCashouts/fixture').set({
      recordedByUserId: 'billing',
      recordedBy: 'Synthetic billing',
      drawerTotal: 300,
      remainingBalance: 300
    });
    const r = req({
      date: '2026-10-15',
      fromUserId: 'billing',
      toType: 'bank',
      bankDepositMethod: 'bank',
      amount: 100,
      reason: 'Fixture bank deposit'
    });
    const first = await transfer(r);
    now += 100000;
    assert.deepEqual(await transfer(r), first);
    assert.equal((await read('bankBalanceControl/main')), undefined);
    assert.equal((await read('appMetadata/appSettings')), undefined);
    assert.equal((await read('cashTransfers/' + first.id)).recordType, 'bank-transfer');
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
    await assert.rejects(transfer({
      ...r,
      data: {
        ...r.data,
        amount: 101
      }
    }), /different actor or intent/);
  });
  it('staff cannot move another holder cash and concurrent movement cannot overdraw', async () => {
    await db.doc('dailyCashouts/fixture').set({
      recordedByUserId: 'billing',
      drawerTotal: 300
    });
    await assert.rejects(transfer(req({
      date: '2026-10-15',
      fromUserId: 'manager',
      toType: 'person',
      toUserId: 'owner',
      amount: 100,
      reason: 'Forbidden'
    }, 'billing')), /own held/);
    const draft = {
      date: '2026-10-15',
      fromUserId: 'billing',
      toType: 'person',
      toUserId: 'owner',
      amount: 200,
      reason: 'Concurrency fixture'
    };
    const results = await Promise.allSettled([transfer(req(draft)), transfer(req(draft))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('cashTransfers').get()).size, 1);
  });
  it('server rejects changing trusted Cashout totals or erasing financial history', async () => {
    const q = await prepareCashout(req({
      date: '2026-10-15'
    }, 'owner'));
    const entry = await cashout.close(req({
      quoteId: q.id,
      drawerDenominations: {
        ...count,
        denom500: 2,
        denom200: 0
      },
      creditSales: 0,
      reason: ''
    }, 'owner'));
    const before = require('./cashoutPolicy').correctionValuesFromEntry(entry);
    await assert.rejects(cashout.correction(req({
      cashoutId: entry.id,
      expectedRevision: 1,
      proposed: {
        ...before,
        cashSales: 999
      },
      reason: 'Forged cash collections',
      applyImmediately: true
    }, 'owner')), /source totals/);
    await assert.rejects(cashout.deleteLegacy(req({
      cashoutId: entry.id,
      expectedRevision: 1,
      reason: 'Delete'
    }, 'owner')), /cannot be erased/);
    assert.equal((await read('dailyCashouts/' + entry.id)).cashSales, 0);
  });
  it('owner-only opening payable, staff zero creation and original invoice preservation', async () => {
    const input = {
      id: 'new-vendor',
      canonicalName: 'New synthetic vendor',
      ownerName: 'Fixture',
      contact: '999',
      address: 'Local',
      suppliedBrands: ['Fixture'],
      openingBalancePaise: 25000,
      openingDate: '2026-10-15',
      openingReason: 'Verified opening fixture'
    };
    await assert.rejects(register.createVendor(req(input)), /Only the owner/);
    await register.createVendor(req(input, 'owner'));
    assert.equal((await read('vendorAccountStatesV2/new-vendor')).outstandingPaise, 25000);
    await register.createVendor(req({
      ...input,
      id: 'zero-vendor',
      canonicalName: 'Zero fixture',
      openingBalancePaise: 0
    }));
    assert.equal((await read('vendorsV2/zero-vendor')).openingBalancePaise, 0);
    assert.equal((await read('purchasesV2/historical')).invoiceTotalPaise, 12345);
  });
  it('vendor return decisions require owner and cap the credited payable', async () => {
    const source = await decisions.createReturn(req({
      id: 'return',
      vendorId: 'vendor',
      date: '2026-10-15',
      description: 'Damaged packet',
      quantity: 1,
      unit: 'packet',
      valuePaise: 10000,
      reason: 'Synthetic damage'
    }));
    await assert.rejects(decisions.resolveReturn(req({
      returnId: source.id,
      expectedRevision: 1,
      outcome: 'vendor-credit',
      creditedValuePaise: 10000,
      outcomeReason: 'Fixture credit'
    })), /account cannot/);
    await assert.rejects(decisions.resolveReturn(req({
      returnId: source.id,
      expectedRevision: 1,
      outcome: 'vendor-credit',
      creditedValuePaise: 10001,
      outcomeReason: 'Over-credit'
    }, 'owner')), /cannot exceed/);
    await decisions.resolveReturn(req({
      returnId: source.id,
      expectedRevision: 1,
      outcome: 'vendor-credit',
      creditedValuePaise: 9000,
      outcomeReason: 'Fixture approved credit'
    }, 'owner'));
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 91000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('staff correction stays pending, owner posts delta and stale replay rejects', async () => {
    const data = payment(20000),
      source = req(data);
    await register.settlement(source);
    const request = await decisions.correct(req({
      id: 'correction',
      sourceRecordId: data.id,
      expectedRevision: 1,
      proposed: {
        date: '2026-10-15',
        amountPaise: 25000,
        mode: 'cash',
        notes: 'Corrected fixture'
      },
      reason: 'Verified omitted amount',
      applyImmediately: false
    }));
    assert.equal(request.status, 'pending');
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 80000);
    const approval = req({
      requestId: 'correction',
      decision: 'approve'
    }, 'owner');
    await decisions.decision(approval);
    await decisions.decision(approval);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 75000);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise, 75000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -25000);
    await assert.rejects(decisions.correct(req({
      id: 'stale',
      sourceRecordId: data.id,
      expectedRevision: 1,
      proposed: {
        date: '2026-10-15',
        amountPaise: 26000,
        mode: 'cash',
        notes: 'Stale'
      },
      reason: 'Stale correction',
      applyImmediately: true
    }, 'owner')), /stale/);
  });
  it('cancels an ordinary open-counter expense with source evidence instead of erasing history', async () => {
    const out = await register.expense(req(expense(5000)));
    await decisions.cancelExpense(req({
      expenseId: out.id,
      expectedRevision: 1,
      reason: 'Verified expense cancellation'
    }, 'owner'));
    assert.equal((await read('cashouts/' + out.id)).paymentStatus, 'cancelled');
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
    assert.equal((await db.collection('cashouts').get()).size, 1);
  });
  it('preserves manually counted legacy vendor cash without inventing another debit', async () => {
    await db.doc('vendorSettlementsV2/legacy-manual').set({
      id: 'legacy-manual',
      vendorId: 'vendor',
      amountPaise: 20000,
      mode: 'cash',
      date: '2026-10-14',
      createdByUserId: 'billing'
    });
    await db.doc('dailyCashouts/legacy-count').set({
      id: 'legacy-count',
      date: '2026-10-14',
      recordedByUserId: 'owner',
      cashExpense: 200,
      drawerTotal: 800,
      createdAt: '2026-10-14T18:25:00Z'
    });
    const before = await read(base + '/handover/main'),
      summary = await cashout.readSummary({
        auth: req({}, 'owner').auth,
        data: { date: '2026-10-15' }
      });
    assert.equal(summary.expectedDrawerPaise, 100000);
    assert.deepEqual(await read(base + '/handover/main'), before);
    assert.equal((await db.collection('vendorSettlementsV2').get()).size, 1);
  });
  it('Cashout correction preserves unlinked legacy card/bank sales and changes holder count only', async () => {
    await db.doc('dailyCashouts/legacy').set({
      id: 'legacy',
      date: '2026-10-14',
      recordedBy: 'Synthetic owner',
      recordedByUserId: 'owner',
      cashSales: 100,
      upiSales: 0,
      creditSales: 0,
      returns: 0,
      cashExpense: 0,
      cashAudit: 100,
      drawerTotal: 100,
      drawerDenominations: {
        ...count,
        denom500: 0,
        denom200: 0,
        denom100: 1
      },
      remainingBalance: 100,
      createdAt: '2026-10-14T18:25:00Z',
      revision: 1
    });
    await db.doc('sales/sale-single-store-2026-10-14').set({
      id: 'sale-single-store-2026-10-14',
      cashSales: 100,
      upiSales: 0,
      cardSales: 25,
      bankTransferSales: 75,
      creditSales: 0,
      returnsDiscounts: 0,
      totalSales: 200,
      createdAt: '2026-10-14T18:25:00Z'
    });
    const old = await read('dailyCashouts/legacy'),
      values = require('./cashoutPolicy').correctionValuesFromEntry(old);
    await cashout.correction(req({
      cashoutId: 'legacy',
      expectedRevision: 1,
      proposed: {
        ...values,
        drawerDenominations: {
          ...values.drawerDenominations,
          denom100: 2
        }
      },
      reason: 'Verified actual count correction',
      applyImmediately: true
    }, 'owner'));
    const sales = await read('sales/sale-single-store-2026-10-14');
    assert.equal(sales.totalSales, 200);
    assert.equal(sales.cardSales, 25);
    assert.equal(sales.bankTransferSales, 75);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
    assert.equal((await read('dailyCashouts/legacy')).drawerTotal, 200);
  });
  it('corrects an unallocated bank payment and recovers its result without undefined invoice effects', async () => {
    await register.settlement(req({id:'unallocated',vendorId:'vendor',date:'2026-10-15',amountPaise:60000,mode:'bank-transfer'}));
    assert.equal((await read('bankBalanceControl/main')).balancePaise,500000);
    const request=req({id:'unallocated-correction',sourceRecordId:'unallocated',expectedRevision:1,proposed:{date:'2026-10-15',amountPaise:50000,mode:'bank-transfer',notes:'Verified account payment'},reason:'Wrong amount on account payment',applyImmediately:true},'owner');
    const first=await decisions.correct(request);
    assert.equal(first.adjustmentPaise,10000);
    assert.equal(Object.hasOwn(first,'allocationAdjustment'),false);
    assert.equal(Object.hasOwn(first,'nextInvoiceState'),false);
    assert.deepEqual(await decisions.correct(request),first);
    assert.equal((await read('bankBalanceControl/main')).balancePaise,500000);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise,50000);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise,100000);
    assert.equal((await read('vendorSettlementsV2/unallocated')).amountPaise,60000);
    assert.equal((await read('vendorSettlementStatesV2/unallocated')).amountPaise,50000);
    assert.equal((await db.collection('vendorLedgerCorrectionRequestsV2').get()).size,1);
    assert.equal((await db.collection('invoiceAllocationsV2').get()).size,0);
  });

  const historicalDate = '2026-10-14';
  const expenseReview = (date = historicalDate, uid = 'owner') => cashout.readSummary({ auth: req({}, uid).auth, data: { date, expenseReconciliation: true } });
  async function legacyExpense(amount = 4000, extra = {}, id = 'historical-legacy') {
    const value = { id, date: historicalDate, amount, category: 'Store Maintenance', paymentMode: 'Cash', createdAt: historicalDate + 'T10:00:00Z', ...extra };
    await db.doc('cashouts/' + id).set(value);
    return value;
  }
  async function reconciliation(totalPaise = 465600, extra = {}) {
    const view = await expenseReview(extra.date || historicalDate);
    return req({ date: view.date, totalPaise, expectedFingerprint: view.expectedFingerprint, correctCompleted: view.completedCashoutCount > 0, reason: 'Owner verified the historical daily expense total', ...extra }, 'owner');
  }
  it('reconciles legacy and trusted cash expenses independently from refunds/vendor payments, with zero drawer impact and replay recovery', async () => {
    const original = await legacyExpense();
    await legacyExpense(100.25, { fundingVersion: 1, sourceKind: 'expense', amountPaise: 10025 }, 'trusted');
    await legacyExpense(999, { paymentStatus: 'cancelled' }, 'cancelled');
    await legacyExpense(50, { paymentMode: 'Bank Transfer' }, 'bank');
    await legacyExpense(200, { category: 'Vendor Payment' }, 'vendor-cash');
    await legacyExpense(50, { sourceKind: 'pos-return', category: 'POS Refund', amountPaise: 5000 }, 'refund-mirror');
    await db.doc(base + '/events/refund-historical').set({ type: 'bill-return-approved', refundDate: historicalDate, refundMethod: 'cash', refundAmountPaise: 5000, createdAt: historicalDate + 'T11:00:00Z' });
    const before = await read(base + '/handover/main');
    const view = await expenseReview();
    assert.equal(view.recordedCashExpensePaise, 410025);
    assert.equal(view.legacyCashExpensePaise, 400000);
    assert.equal(view.vendorCashPaymentPaise, 20000);
    assert.equal(view.cashRefundPaise, 5000);
    const request = await reconciliation(), result = await cashout.reconcileExpenses(request);
    assert.equal(result.adjustmentPaise, 55575); // 465600 - 410025, independently specified.
    assert.equal(result.cashPaidOutPaise, 490600); // Expenses + vendor payment + one refund.
    assert.equal(result.drawerImpactPaise, 0);
    assert.deepEqual(await read(base + '/handover/main'), before);
    assert.deepEqual(await read('cashouts/historical-legacy'), original);
    assert.equal((await db.collection('cashouts').get()).size, 6);
    assert.deepEqual(await cashout.reconcileExpenses(request), result);
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).revision, 1);
    await assert.rejects(cashout.reconcileExpenses({ ...request, data: { ...request.data, totalPaise: 465601 } }), /different actor or intent/);
    await assert.rejects(cashout.reconcileExpenses(await reconciliation()), /already confirmed/);
    const quote = await prepareCashout(req({ date: historicalDate }));
    assert.equal(quote.cashPaidOutPaise, 490600);
    assert.equal(quote.ordinaryCashExpensePaise, 465600);
    const entry = await cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Physical cash actually being removed now' }));
    assert.equal(entry.cashExpense, 4906);
    assert.equal(expectedCash(await read(base + '/handover/main')), 30000); // Only counted 70000 was removed.
  });
  it('coordinates two simultaneous historical confirmations so only one dated adjustment is accepted', async () => {
    await legacyExpense();
    const first = await reconciliation(), second = { ...first, data: { ...first.data, operationId: randomUUID() } };
    const outcomes = await Promise.allSettled([cashout.reconcileExpenses(first), cashout.reconcileExpenses(second)]);
    assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(value => value.status === 'rejected').length, 1);
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).adjustmentPaise, 65600);
    assert.equal((await db.collection('financeOperations').get()).size, 1);
    assert.equal(expectedCash(await read(base + '/handover/main')), 100000);
  });
  it('rejects stale review and requires reconfirmation when a missing expense is later recorded', async () => {
    await legacyExpense();
    const stale = await reconciliation();
    await legacyExpense(100, {}, 'late-source');
    await assert.rejects(cashout.reconcileExpenses(stale), /changed/);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
    await cashout.reconcileExpenses(await reconciliation());
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).adjustmentPaise, 55600);
    await legacyExpense(556, {}, 'later-itemised');
    await assert.rejects(cashout.readSummary({ auth: req({}).auth, data: { date: historicalDate } }), /sources changed/);
    const view = await expenseReview();
    assert.equal(view.reconciliationStale, true);
    assert.equal(view.savedConfirmedExpensePaise, 465600);
    await cashout.reconcileExpenses(await reconciliation());
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).adjustmentPaise, 0);
    assert.equal((await prepareCashout(req({ date: historicalDate }))).cashPaidOutPaise, 465600);
  });
  it('covers any past date, includes sources without createdAt, and isolates each dates reconciliation', async () => {
    await legacyExpense(4000, { createdAt: null });
    const f = db.doc('cashouts/historical-legacy'); await f.update({ createdAt: require('firebase-admin/firestore').FieldValue.delete() });
    assert.equal((await expenseReview()).recordedCashExpensePaise, 400000);
    await cashout.reconcileExpenses(await reconciliation());
    await legacyExpense(20, { date: '2025-01-01' }, 'old-other-date');
    await cashout.reconcileExpenses(await reconciliation(3025, { date: '2025-01-01' }));
    assert.equal((await read('cashoutExpenseReconciliations/2025-01-01')).adjustmentPaise, 1025);
    assert.equal((await expenseReview()).confirmedExpensePaise, 465600);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 2);
    assert.equal(expectedCash(await read(base + '/handover/main')), 100000);
  });
  it('restricts review/posting to active owners and rejects current/future/invalid dates and malformed values', async () => {
    await legacyExpense();
    const request = await reconciliation();
    for (const uid of ['billing', 'manager', 'disabled']) {
      await assert.rejects(expenseReview(historicalDate, uid), /cannot perform/);
      await assert.rejects(cashout.reconcileExpenses({ ...request, auth: req({}, uid).auth }), /cannot perform/);
    }
    for (const date of ['2026-10-15', '2026-10-16', '2026-02-30']) {
      await assert.rejects(cashout.reconcileExpenses({ ...request, data: { ...request.data, date } }), /past dates|Invalid business date/);
    }
    for (const totalPaise of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(cashout.reconcileExpenses({ ...request, data: { ...request.data, totalPaise } }), /valid integer/);
    await assert.rejects(cashout.reconcileExpenses({ ...request, data: { ...request.data, reason: 'x' } }), /at least five/);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
  });
  it('uses the IST day boundary rather than UTC to decide whether a date is historical', async () => {
    now = Date.parse('2026-10-14T18:29:59Z');
    await assert.rejects(expenseReview(), /past dates/);
    now = Date.parse('2026-10-14T18:30:00Z');
    assert.equal((await expenseReview()).date, historicalDate);
    await cashout.reconcileExpenses(await reconciliation(0));
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).confirmedExpensePaise, 0);
  });
  it('blocks unclassified or inconsistent historical cash sources without partial writes', async () => {
    await legacyExpense(4000, { category: 'Unclassified legacy movement' });
    let request = await reconciliation();
    await assert.rejects(cashout.reconcileExpenses(request), /cannot be classified safely/);
    await assert.rejects(prepareCashout(req({ date: historicalDate })), /Unclassified/);
    await legacyExpense(4000, { amountPaise: 123 });
    await assert.rejects(expenseReview(), /inconsistent amount/);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
    assert.equal((await db.collection('financeCashoutQuotes').get()).size, 0);
  });
  it('blocks reconciliation during a Cashout count and invalidates the quote if historical sources change', async () => {
    await legacyExpense();
    const request = await reconciliation(), quote = await prepareCashout(req({ date: historicalDate }));
    await assert.rejects(cashout.reconcileExpenses(request), /count is active/);
    await legacyExpense(1, {}, 'source-during-count');
    await assert.rejects(cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Historical test count' })), /Source totals changed/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
    assert.equal(expectedCash(await read(base + '/handover/main')), 100000);
  });
  it('corrects a completed Cashout with explicit owner confirmation and audit while preserving sales, count, sources and drawer', async () => {
    await legacyExpense();
    const quote = await prepareCashout(req({ date: historicalDate }));
    const entry = await cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Historical count fixture' }));
    const paths = [base + '/handover/main', base + '/drawerClosures/' + entry.id, 'sales/sale-single-store-' + historicalDate, 'cashMovementControl/main', 'cashouts/historical-legacy'];
    const before = await Promise.all(paths.map(read));
    let request = await reconciliation();
    await assert.rejects(cashout.reconcileExpenses({ ...request, data: { ...request.data, correctCompleted: false } }), /explicitly confirm/);
    const result = await cashout.reconcileExpenses(request);
    assert.deepEqual(result.correctedCashoutIds, [entry.id]);
    const updated = await read('dailyCashouts/' + entry.id);
    assert.equal(updated.cashExpense, 4656);
    assert.equal(updated.revision, entry.revision + 1);
    for (const key of Object.keys(entry).filter(key => !['cashExpense', 'revision'].includes(key))) assert.deepEqual(updated[key], entry[key], key);
    assert.deepEqual(await Promise.all(paths.map(read)), before);
    const audit = (await db.collection('cashoutCorrectionRequests').get()).docs[0].data();
    assert.equal(audit.status, 'approved');
    assert.equal(audit.before.cashExpense, 4000);
    assert.equal(audit.proposed.cashExpense, 4656);
    assert.equal(audit.reviewedByUserId, 'owner');
    assert.deepEqual(await cashout.reconcileExpenses(request), result);
    // A second explicit correction can reduce a mistaken declared total, without cancelling sources or crediting cash.
    await cashout.reconcileExpenses(await reconciliation(390025));
    assert.equal((await read('dailyCashouts/' + entry.id)).cashExpense, 3900.25);
    assert.equal((await read('cashoutExpenseReconciliations/' + historicalDate)).adjustmentPaise, -9975);
    assert.deepEqual(await Promise.all(paths.map(read)), before);
    assert.equal((await db.collection('cashoutCorrectionRequests').get()).size, 2);
  });
  it('does not replace a pending correction and rejects a review if a Cashout appears after review', async () => {
    await legacyExpense();
    const request = await reconciliation();
    await db.doc('dailyCashouts/other-close').set({ id: 'other-close', date: historicalDate, cashExpense: 4000, cashSales: 0, upiSales: 0, creditSales: 0, returns: 0, cashAudit: 0, createdAt: historicalDate + 'T18:00:00Z', revision: 1 });
    await assert.rejects(cashout.reconcileExpenses(request), /changed/);
    await db.doc('cashoutCorrectionRequests/pending').set({ cashoutId: 'other-close', status: 'pending' });
    await assert.rejects(cashout.reconcileExpenses(await reconciliation()), /correction is pending/);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
    assert.equal((await read('dailyCashouts/other-close')).cashExpense, 4000);
  });
  it('allocates a downward correction across multiple completed Cashouts without touching protected refunds', async () => {
    await legacyExpense(100);
    for (const [id, cashExpense, refund] of [['first', 80, 0], ['second', 20, 1000]]) await db.doc('dailyCashouts/' + id).set({ id, date: historicalDate, cashExpense, posCashRefundPaise: refund, cashSales: 0, upiSales: 0, creditSales: 0, returns: 0, cashAudit: 0, financePostingVersion: 1, sourceTotals: { vendorCashPaymentPaise: 0, cashRefundPaise: refund }, revision: 1, createdAt: historicalDate + (id === 'first' ? 'T10:00:00Z' : 'T11:00:00Z') });
    await db.doc(base + '/events/protected-refund').set({ type: 'bill-return-approved', refundDate: historicalDate, refundMethod: 'cash', refundAmountPaise: 1000 });
    const result = await cashout.reconcileExpenses(await reconciliation(1000));
    assert.equal(result.cashPaidOutPaise, 2000); // 1000 expenses + 1000 refund.
    assert.equal((await read('dailyCashouts/first')).cashExpense, 10);
    assert.equal((await read('dailyCashouts/second')).cashExpense, 10);
    assert.equal((await db.collection('cashoutCorrectionRequests').get()).size, 2);
    assert.equal(expectedCash(await read(base + '/handover/main')), 100000);
  });

  it('retains ambiguous older completed payouts and refuses to reinterpret vendor payments as ordinary expenses', async () => {
    await legacyExpense();
    const legacy = { id: 'old-close', date: historicalDate, cashExpense: 4200, createdAt: historicalDate + 'T18:00:00Z', revision: 1 };
    await db.doc('dailyCashouts/old-close').set(legacy);
    assert.match((await expenseReview()).completedCorrectionBlockedReason, /no separate vendor\/refund evidence/);
    await assert.rejects(cashout.reconcileExpenses(await reconciliation()), /individual owner correction/);
    assert.deepEqual(await read('dailyCashouts/old-close'), legacy);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
  });
  it('refuses expense-only correction when vendor/refund evidence changed after Cashout', async () => {
    await legacyExpense();
    const quote = await prepareCashout(req({ date: historicalDate }));
    const entry = await cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Historical count fixture' }));
    await legacyExpense(200, { category: 'Vendor Payment' }, 'late-vendor-payment');
    const before = await read('dailyCashouts/' + entry.id);
    assert.match((await expenseReview()).completedCorrectionBlockedReason, /Vendor payments or refunds differ/);
    await assert.rejects(cashout.reconcileExpenses(await reconciliation()), /linked sources/);
    assert.deepEqual(await read('dailyCashouts/' + entry.id), before);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
  });
  it('queues no partial corrections when an older Cashout has a pending correction', async () => {
    await legacyExpense(100);
    for (const [id, hour] of [['first', '10'], ['second', '11']]) await db.doc('dailyCashouts/' + id).set({ id, date: historicalDate, cashExpense: 50, cashSales: 0, upiSales: 0, creditSales: 0, returns: 0, cashAudit: 0, financePostingVersion: 1, sourceTotals: { vendorCashPaymentPaise: 0, cashRefundPaise: 0 }, revision: 1, createdAt: historicalDate + 'T' + hour + ':00:00Z' });
    await db.doc('cashoutCorrectionRequests/pending-first').set({ cashoutId: 'first', status: 'pending' });
    await assert.rejects(cashout.reconcileExpenses(await reconciliation(1000)), /correction is pending/);
    assert.equal((await read('dailyCashouts/first')).cashExpense, 50);
    assert.equal((await read('dailyCashouts/second')).cashExpense, 50);
    assert.equal((await db.collection('cashoutCorrectionRequests').get()).size, 1);
    assert.equal((await db.collection('cashoutExpenseReconciliations').get()).size, 0);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
  });

  async function historicalCashout(timing = 'remove-now', extra = {}) {
    const quote = await cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: timing }, 'owner'));
    const entry = await cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Verified historical cash record', ...extra }, 'owner'));
    return { quote, entry };
  }
  const drawerReview = () => cashout.readSummary({ auth: req({}, 'owner').auth, data: { date: '2026-10-14', drawerReversal: true } });
  const reverseRequest = view => req({ date: view.date, cashoutId: view.cashoutId, expectedRevision: view.expectedRevision, expectedFingerprint: view.expectedFingerprint, expectedRestorePaise: view.restorePaise, reason: 'Owner confirmed cash had already been removed earlier' }, 'owner');
  async function legacyDrawerEvidence(entry) {
    const { FieldValue } = require('firebase-admin/firestore');
    // Simulate the exact pre-repair persisted contract, after using a real posting.
    await db.doc('dailyCashouts/' + entry.id).update({ drawerDebitCheckpoint: FieldValue.delete() });
    await db.doc('financeOperations/' + entry.sourceOperationId).update({ 'result.drawerDebitCheckpoint': FieldValue.delete() });
    const ledger = await read(base + '/handover/main');
    await db.doc(base + '/reconciliations/' + ledger.checkpoint.reconciliationId).set({ kind: 'login', date: ledger.checkpoint.date, createdAt: '2026-10-15T04:00:00Z', actual: { cash: ledger.checkpoint.cashActualPaise } });
  }
  it('requires an explicit historical cash-removal choice and rejects old ambiguous quotes', async () => {
    await assert.rejects(cashout.prepare(req({ date: '2026-10-14' }, 'owner')), /Choose Cash already removed/);
    await assert.rejects(cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: 'wrong' }, 'owner')), /Choose Cash already removed/);
    await assert.rejects(cashout.prepare(req({ date: '2026-10-15', historicalCashTiming: 'already-removed' }, 'owner')), /only for past dates/);
    assert.equal((await db.collection('financeOperations').get()).size, 0);
    const quote = await cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: 'remove-now' }, 'owner'));
    await db.doc('financeCashoutQuotes/' + quote.id).update({ historicalCashTiming: require('firebase-admin/firestore').FieldValue.delete() });
    await assert.rejects(cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Old quote compatibility test' }, 'owner')), /old quote has no cash-removal choice/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    assert.equal(expectedCash(await read(base + '/handover/main')), 100000);
  });
  it('records cash already removed without reserving or debiting the live drawer while current expenses continue', async () => {
    const before = await read(base + '/handover/main');
    const quote = await cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: 'already-removed' }, 'owner'));
    assert.equal(quote.reservationId, null);
    assert.deepEqual(await read(base + '/handover/main'), before);
    await register.expense(req(expense(10000)));
    const afterExpense = await read(base + '/handover/main');
    const request = req({ quoteId: quote.id, drawerDenominations: { ...count, denom500: 200 }, creditSales: 0, reason: 'Cash was taken out on the earlier date' }, 'owner');
    const entry = await cashout.close(request);
    assert.equal(entry.drawerDebitPaise, 0);
    assert.equal(entry.historicalCashTiming, 'already-removed');
    assert.equal(entry.drawerTotal, 100200); // Can exceed today's balance; no withdrawal occurs.
    assert.deepEqual(await read(base + '/handover/main'), afterExpense);
    assert.equal((await read(base + '/drawerClosures/' + entry.id)).removedPaise, 0);
    assert.equal((await read(base + '/drawerClosures/' + entry.id)).differencePaise, null);
    assert.deepEqual(await cashout.close(request), entry);
    await assert.rejects(cashout.applyHistoricalDrawerDebit(req({ cashoutId: entry.id, expectedRevision: 1, reason: 'Attempt another deduction' }, 'owner')), /cannot be deducted/);
  });
  it('owner-only already-removed mode rejects staff and role changes after preparation', async () => {
    for (const uid of ['billing', 'manager', 'disabled']) await assert.rejects(cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: 'already-removed' }, uid)), /owner|cannot perform/);
    const quote = await cashout.prepare(req({ date: '2026-10-14', historicalCashTiming: 'already-removed' }, 'owner'));
    await db.doc('users/owner').update({ role: 'billing' });
    await assert.rejects(cashout.close(req({ quoteId: quote.id, drawerDenominations: count, creditSales: 0, reason: 'Role changed during review' }, 'owner')), /Owner confirmation/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    assert.equal((await read(base + '/handover/main')).countReservation, null);
  });
  it('reverses the legacy 14300 duplicate debit once while retaining all subsequent expenses and source evidence', async () => {
    await db.doc(base + '/handover/main').update({ 'checkpoint.cashActualPaise': 1642000 });
    const { entry } = await historicalCashout('remove-now', { drawerDenominations: { denom500: 28, denom200: 0, denom100: 3, denom50: 0, denom20: 0, denom10: 0, change: 0 } });
    await legacyDrawerEvidence(entry);
    await register.expense(req(expense(5000)));
    const retained = ['sales/sale-single-store-2026-10-14', base + '/drawerClosures/' + entry.id, 'cashMovementControl/main', 'financeOperations/' + entry.sourceOperationId];
    const snapshots = await Promise.all(retained.map(read));
    const view = await drawerReview();
    assert.equal(view.beforePaise, 207000); // 1642000 - 1430000 - 5000.
    assert.equal(view.restorePaise, 1430000);
    assert.equal(view.afterPaise, 1637000);
    const request = reverseRequest(view), result = await cashout.reverseHistoricalDrawer(request);
    assert.equal(result.restoredPaise, 1430000);
    assert.equal(expectedCash(await read(base + '/handover/main')), 1637000);
    assert.deepEqual(await Promise.all(retained.map(read)), snapshots);
    assert.equal((await read('dailyCashouts/' + entry.id)).drawerTotal, 14300);
    assert.equal((await read('dailyCashouts/' + entry.id)).historicalCashTiming, 'already-removed');
    assert.deepEqual(await cashout.reverseHistoricalDrawer(request), result);
    await assert.rejects(cashout.reverseHistoricalDrawer({ ...request, data: { ...request.data, operationId: randomUUID() } }), /already corrected/);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 1);
  });
  it('preserves new sales/expenses between reversal preview and confirmation', async () => {
    await historicalCashout();
    const view = await drawerReview();
    await register.expense(req(expense(5000)));
    const result = await cashout.reverseHistoricalDrawer(reverseRequest(view));
    assert.equal(result.beforePaise, 25000);
    assert.equal(result.afterPaise, 95000);
    assert.equal(expectedCash(await read(base + '/handover/main')), 95000);
  });
  it('does not add money after a later physical cash count already replaced the wrong balance', async () => {
    const { entry } = await historicalCashout();
    await legacyDrawerEvidence(entry);
    now += 60000;
    await db.doc(base + '/reconciliations/new-count').set({ kind: 'logout', date: '2026-10-15', createdAt: new Date(now).toISOString(), actual: { cash: 85000 } });
    const ledger = await read(base + '/handover/main');
    await db.doc(base + '/handover/main').update({ checkpoint: { ...ledger.checkpoint, reconciliationId: 'new-count', cashActualPaise: 85000, cashNetPaise: ledger.cashNetPaise } });
    const before = await read(base + '/handover/main'), view = await drawerReview();
    assert.equal(view.restorePaise, 0);
    assert.equal(view.absorbedByLaterCount, true);
    await cashout.reverseHistoricalDrawer(reverseRequest(view));
    assert.deepEqual(await read(base + '/handover/main'), before);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 1);
  });
  it('recognises a later drawer closing even when its checkpoint retains the old count ID', async () => {
    const { entry } = await historicalCashout();
    await legacyDrawerEvidence(entry);
    now += 60000;
    const quote = await cashout.prepare(req({ date: '2026-10-15' }, 'owner'));
    await cashout.close(req({ quoteId: quote.id, drawerDenominations: { denom500: 0, denom200: 1, denom100: 1, denom50: 0, denom20: 0, denom10: 0, change: 0 }, creditSales: 0, reason: '' }, 'owner'));
    const before = await read(base + '/handover/main');
    assert.equal(before.checkpoint.reconciliationId, 'opening');
    const view = await drawerReview(); assert.equal(view.restorePaise, 0);
    await cashout.reverseHistoricalDrawer(reverseRequest(view));
    assert.deepEqual(await read(base + '/handover/main'), before);
    assert.equal(expectedCash(before), 0);
  });
  it('restores only a correction delta still affecting the current checkpoint', async () => {
    const { entry } = await historicalCashout();
    now += 60000;
    const ledger = await read(base + '/handover/main');
    await db.doc(base + '/handover/main').update({ checkpoint: { ...ledger.checkpoint, cashActualPaise: 50000, cashNetPaise: ledger.cashNetPaise, reconciliationId: 'new-count' } });
    const values = require('./cashoutPolicy').correctionValuesFromEntry(entry);
    await cashout.correction(req({ cashoutId: entry.id, expectedRevision: 1, proposed: { ...values, drawerDenominations: { ...count, denom100: 1 } }, reason: 'Verified extra cash actually removed now', applyImmediately: true }, 'owner'));
    const view = await drawerReview();
    assert.equal(view.originalDebitPaise, 80000);
    assert.equal(view.restorePaise, 10000);
    await cashout.reverseHistoricalDrawer(reverseRequest(view));
    assert.equal(expectedCash(await read(base + '/handover/main')), 50000);
  });
  it('rejects a stale reversal after a checkpoint changes and coordinates concurrent reversals', async () => {
    await historicalCashout();
    const stale = await drawerReview(), ledger = await read(base + '/handover/main');
    await db.doc(base + '/handover/main').update({ checkpoint: { ...ledger.checkpoint, cashActualPaise: 50000, cashNetPaise: ledger.cashNetPaise, reconciliationId: 'new-count' } });
    await assert.rejects(cashout.reverseHistoricalDrawer(reverseRequest(stale)), /changed/);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 0);
    const view = await drawerReview(), a = reverseRequest(view), b = reverseRequest(view);
    const outcomes = await Promise.allSettled([cashout.reverseHistoricalDrawer(a), cashout.reverseHistoricalDrawer(b)]);
    assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 1);
    assert.equal(expectedCash(await read(base + '/handover/main')), 50000);
  });
  it('does not change the drawer when correcting historical denominations after an already-removed reversal', async () => {
    const { entry } = await historicalCashout();
    await cashout.reverseHistoricalDrawer(reverseRequest(await drawerReview()));
    const before = await read(base + '/handover/main'), current = await read('dailyCashouts/' + entry.id);
    const values = require('./cashoutPolicy').correctionValuesFromEntry(current);
    await cashout.correction(req({ cashoutId: entry.id, expectedRevision: current.revision, proposed: { ...values, drawerDenominations: { ...count, denom100: 1 } }, reason: 'Corrected historical amount only', applyImmediately: true }, 'owner'));
    assert.deepEqual(await read(base + '/handover/main'), before);
    assert.equal((await read('dailyCashouts/' + entry.id)).drawerTotal, 800);
  });
  it('blocks active counts, incomplete posting evidence, pending corrections and unauthorised reversal', async () => {
    const { entry } = await historicalCashout(), view = await drawerReview();
    for (const uid of ['billing', 'manager', 'disabled']) {
      await assert.rejects(cashout.readSummary({ auth: req({}, uid).auth, data: { date: '2026-10-14', drawerReversal: true } }), /cannot perform/);
      await assert.rejects(cashout.reverseHistoricalDrawer({ ...reverseRequest(view), auth: req({}, uid).auth }), /cannot perform/);
    }
    await db.doc(base + '/handover/main').update({ countReservation: { id: 'active', startedAt: Timestamp.fromMillis(now) } });
    await assert.rejects(cashout.reverseHistoricalDrawer(reverseRequest(await drawerReview())), /cash count is active/);
    await db.doc(base + '/handover/main').update({ countReservation: null });
    await db.doc('cashoutCorrectionRequests/pending-reversal').set({ cashoutId: entry.id, status: 'pending' });
    await assert.rejects(drawerReview(), /pending Cashout correction/);
    await db.doc('cashoutCorrectionRequests/pending-reversal').delete();
    await db.doc('financeOperations/' + entry.sourceOperationId).delete();
    await assert.rejects(drawerReview(), /posting history is incomplete/);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 0);
    assert.equal(expectedCash(await read(base + '/handover/main')), 30000);
  });
  it('does not guess legacy posting order when a physical count has an indistinguishable timestamp', async () => {
    const { entry } = await historicalCashout(); await legacyDrawerEvidence(entry);
    await db.doc(base + '/reconciliations/opening').update({ createdAt: entry.createdAt });
    await assert.rejects(drawerReview(), /too close to order safely/);
    assert.equal((await db.collection('cashoutDrawerCorrections').get()).size, 0);
    assert.equal(expectedCash(await read(base + '/handover/main')), 30000);
  });
});
