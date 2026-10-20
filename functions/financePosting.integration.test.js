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
  createFinanceOperations
} = require('./financeOperations');
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
      invoiceTotalPaise: 12345,
      createdAt: '2026-10-01T05:00:00Z'
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
  it('serializes concurrent terminals spending the same counter/payable', async () => {
    const results = await Promise.allSettled([register.settlement(req(payment(70000), 'billing')), register.settlement(req(payment(70000), 'manager'))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise, 30000);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, -70000);
    assert.equal((await db.collection('cashouts').get()).size, 1);
  });
  it('posts bank-funded expense and vendor payment once without changing drawer', async () => {
    await register.expense(req(expense(10000, {
      mode: 'bank-transfer'
    })));
    await register.settlement(req(payment(20000, {
      mode: 'bank-transfer'
    })));
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 470000);
    assert.equal((await read('appMetadata/appSettings')).currentBankBalance, 4700);
    assert.equal((await read(base + '/handover/main')).cashNetPaise, 0);
  });
  it('requires owner baseline confirmation and rejects stale/forged baseline', async () => {
    await db.doc('bankBalanceControl/main').delete();
    await assert.rejects(register.expense(req(expense(100, {
      mode: 'bank-transfer'
    }))), /owner must confirm/);
    await assert.rejects(register.bankBaseline(req({
      balancePaise: 100,
      expectedRevision: 0,
      reason: 'Fixture'
    })), /account cannot/);
    await register.bankBaseline(req({
      balancePaise: 300000,
      expectedRevision: 0,
      reason: 'Independently verified fixture bank balance'
    }, 'owner'));
    assert.equal((await read('appMetadata/appSettings')).currentBankBalance, 3000);
    await assert.rejects(register.bankBaseline(req({
      balancePaise: 1,
      expectedRevision: 0,
      reason: 'Stale'
    }, 'owner')), /changed/);
    assert.equal((await db.collection('settingsAudit').get()).size, 1);
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
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 480000);
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
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 495000);
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
    const quote = await cashout.prepare(req({
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
  it('posts a late prior-day Cashout from the next-day opening evidence without closing the live counter', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    const batch = db.batch();
    batch.set(db.doc(base + '/handover/main'), {
      initialized: true,
      revision: 4,
      cashNetPaise: 118000,
      dailyTotals: { '2026-10-15': { upi: 0, card: 0 }, '2026-10-16': { upi: 0, card: 0 } },
      checkpoint: { date: '2026-10-16', cashActualPaise: 100000, cashNetPaise: 100000, upiActualPaise: 0, cardActualPaise: 0, upiNetPaise: 0, cardNetPaise: 0, reconciliationId: 'opening-16' },
      counterSession: { status: 'open', date: '2026-10-16', openingReconciliationId: 'opening-16', openedByUid: 'owner' },
      countReservation: null,
    });
    for (const uid of ['owner', 'billing', 'manager']) batch.set(db.doc(base + '/cashierStates/' + uid), {
      uid, authTime: 42, closed: false, needsLogoutCheck: false, joinedCounterId: 'opening-16',
    });
    batch.set(db.doc(base + '/reconciliations/opening-16'), {
      id: 'opening-16', uid: 'owner', authTime: 42, kind: 'login', date: '2026-10-16',
      actual: { cash: 100000, upi: 0, card: 0 }, createdAt: '2026-10-15T18:31:00.000Z',
    });
    batch.set(db.doc(base + '/bills/sale-15'), {
      id: 'sale-15', businessDate: '2026-10-15', createdAt: '2026-10-15T12:00:00.000Z',
      payments: [{ method: 'cash', amountPaise: 50000 }],
    });
    batch.set(db.doc(base + '/bills/sale-16'), {
      id: 'sale-16', businessDate: '2026-10-16', createdAt: '2026-10-16T05:30:00.000Z',
      payments: [{ method: 'cash', amountPaise: 18000 }],
    });
    await batch.commit();

    const preview = await cashout.readSummary({ auth: req({}).auth, data: { date: '2026-10-15' } });
    assert.equal(preview.lateCashout, true);
    assert.equal(preview.grossMethods.cash, 50000);
    const quote = await cashout.prepare(req({ date: '2026-10-15' }));
    assert.equal(quote.lateCashout, true);
    assert.equal(quote.counterDate, '2026-10-16');
    assert.equal(quote.lateCashoutCarryoverPaise, 100000);
    assert.equal(quote.currentExpectedDrawerPaise, 118000);
    assert.equal(quote.grossMethods.cash, 50000);
    assert.equal(quote.expectedDrawerPaise, 100000);
    await assert.rejects(register.expense(req(expense(100))), /being counted/);

    const closeRequest = req({
      quoteId: quote.id,
      drawerDenominations: { denom500: 2, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 0 },
      creditSales: 0,
      reason: '',
    });
    const entry = await cashout.close(closeRequest);
    assert.equal(entry.date, '2026-10-15');
    assert.equal(entry.cashSales, 500);
    assert.equal(entry.drawerTotal, 1000);
    assert.equal(entry.lateCashoutVersion, 1);
    assert.equal(entry.sourceTotals.date, '2026-10-15');
    assert.equal(entry.sourceTotals.grossMethods.cash, 50000);
    assert.equal(entry.sourceTotals.currentExpectedDrawerPaise, undefined);
    assert.equal(entry.sourceTotals.counterDate, undefined);
    assert.equal(entry.sourceTotals.subsequentNetCashPaise, undefined);
    assert.equal((await read('dailyCashouts/' + entry.id)).drawerTotal, 1000);
    assert.equal((await read(base + '/drawerClosures/' + entry.id)).kind, 'late-cashout');
    assert.equal((await read(base + '/drawerClosures/' + entry.id)).resultingBalancePaise, 18000);
    assert.deepEqual(await cashout.close(closeRequest), entry);
    const ledger = await read(base + '/handover/main');
    assert.deepEqual(ledger.counterSession, { status: 'open', date: '2026-10-16', openingReconciliationId: 'opening-16', openedByUid: 'owner' });
    assert.equal(ledger.checkpoint.cashActualPaise, 18000);
    assert.equal(ledger.checkpoint.cashNetPaise, 118000);
    assert.equal((await db.collection('dailyCashouts').get()).size, 1);
    assert.equal((await read('sales/sale-single-store-2026-10-15')).cashSales, 500);
    assert.equal((await read(base + '/bills/sale-16')).payments[0].amountPaise, 18000);
    assert.equal((await read(base + '/cashierStates/billing')).joinedCounterId, 'opening-16');
    assert.equal((await read(base + '/cashierStates/billing')).needsLogoutCheck, true);
    assert.equal((await read('financeOperations/' + closeRequest.data.operationId)).actorUid, 'billing');
  });
  it('rejects a late Cashout that would remove current-day collections', async () => {
    now = Date.parse('2026-10-16T05:00:00.000Z');
    await db.doc(base + '/handover/main').update({
      cashNetPaise: 118000,
      checkpoint: { date: '2026-10-16', cashActualPaise: 100000, cashNetPaise: 100000, upiActualPaise: 0, cardActualPaise: 0, upiNetPaise: 0, cardNetPaise: 0, reconciliationId: 'opening-16' },
      counterSession: { status: 'open', date: '2026-10-16', openingReconciliationId: 'opening-16', openedByUid: 'owner' },
    });
    await db.doc(base + '/cashierStates/billing').update({ joinedCounterId: 'opening-16' });
    await db.doc(base + '/reconciliations/opening-16').set({ id: 'opening-16', uid: 'owner', authTime: 42, kind: 'login', date: '2026-10-16', actual: { cash: 100000, upi: 0, card: 0 }, createdAt: '2026-10-15T18:31:00.000Z' });
    const quote = await cashout.prepare(req({ date: '2026-10-15' }));
    await assert.rejects(cashout.close(req({
      quoteId: quote.id,
      drawerDenominations: { denom500: 2, denom200: 0, denom100: 0, denom50: 0, denom20: 0, denom10: 0, change: 1 },
      creditSales: 0,
      reason: 'Too much cash for prior day',
    })), /cannot remove today's collections/);
    assert.equal((await db.collection('dailyCashouts').get()).size, 0);
    assert.equal((await read(base + '/handover/main')).counterSession.date, '2026-10-16');
    assert.equal((await read(base + '/handover/main')).countReservation.id, quote.reservationId);
  });
  it('expired counts reject without closing and can be cancelled safely', async () => {
    const quote = await cashout.prepare(req({
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
    const q = await cashout.prepare(req({
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
    const quote = await cashout.prepare(req({ date: '2026-10-15' }, 'owner'));
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
  it('Cash Movement consumes held cash and bank deposit increases book without another drawer effect', async () => {
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
    assert.equal((await read('bankBalanceControl/main')).balancePaise, 510000);
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
    const q = await cashout.prepare(req({
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
    assert.equal((await read('bankBalanceControl/main')).balancePaise,440000);
    const request=req({id:'unallocated-correction',sourceRecordId:'unallocated',expectedRevision:1,proposed:{date:'2026-10-15',amountPaise:50000,mode:'bank-transfer',notes:'Verified account payment'},reason:'Wrong amount on account payment',applyImmediately:true},'owner');
    const first=await decisions.correct(request);
    assert.equal(first.adjustmentPaise,10000);
    assert.equal(Object.hasOwn(first,'allocationAdjustment'),false);
    assert.equal(Object.hasOwn(first,'nextInvoiceState'),false);
    assert.deepEqual(await decisions.correct(request),first);
    assert.equal((await read('bankBalanceControl/main')).balancePaise,450000);
    assert.equal((await read('vendorAccountStatesV2/vendor')).outstandingPaise,50000);
    assert.equal((await read('invoiceStatesV2/invoice')).openAmountPaise,100000);
    assert.equal((await read('vendorSettlementsV2/unallocated')).amountPaise,60000);
    assert.equal((await read('vendorSettlementStatesV2/unallocated')).amountPaise,50000);
    assert.equal((await db.collection('vendorLedgerCorrectionRequestsV2').get()).size,1);
    assert.equal((await db.collection('invoiceAllocationsV2').get()).size,0);
  });

});
