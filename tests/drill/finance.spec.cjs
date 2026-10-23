const {
  test,
  expect
} = require('./helpers.cjs');
const crypto = require('node:crypto');
const FIN = '/src/features/register/data/financeRepository.ts',
  CLIENT = '/tests/drill/client.ts';
async function seedFinance(h) {
  const b = h.db.batch(),
    stamp = new Date().toISOString();
  b.set(h.db.doc('vendorAccountStatesV2/drill-alpha'), {
    id: 'drill-alpha',
    vendorId: 'drill-alpha',
    outstandingPaise: 100000,
    revision: 1
  });
  b.set(h.db.doc('invoiceStatesV2/finance-invoice'), {
    id: 'finance-invoice',
    invoiceId: 'finance-invoice',
    vendorId: 'drill-alpha',
    openAmountPaise: 100000,
    reservedAmountPaise: 0,
    revision: 1
  });
  b.set(h.db.doc('bankBalanceControl/main'), {
    initialized: true,
    balancePaise: 500000,
    revision: 1
  });
  b.set(h.db.doc('appMetadata/appSettings'), {
    currentBankBalance: 5000
  }, {
    merge: true
  });
  b.set(h.db.doc('chequeBooksV2/book-1120-1199'), {
    id: 'book-1120-1199',
    active: true,
    startNumber: 1120,
    endNumber: 1199,
    revision: 1,
    createdAt: stamp
  });
  await b.commit();
}
async function expense(page, amount = '50') {
  await page.getByLabel('Recipient', {
    exact: true
  }).fill('Synthetic utility');
  await page.getByLabel('Amount (₹)', {
    exact: true
  }).fill(amount);
  await page.getByRole('button', {
    name: 'Record payment',
    exact: true
  }).click();
}
async function post(h, page, kind, intent) {
  return h.rpc(page, FIN, 'postFinanceOperation', [kind, intent]);
}
async function call(h, page, kind, intent) {
  return h.rpc(page, CLIENT, 'call', ['postFinanceOperation', {
    kind,
    intent: {
      operationId: crypto.randomUUID(),
      ...intent
    }
  }]);
}
async function failure(action) {
  try {
    await action();
    return null;
  } catch (e) {
    if (/DRILL_HELPER|Failed to fetch dynamically/.test(e.message)) throw e;
    return e.message;
  }
}
async function choose(page, label, name) {
  await page.getByLabel(label, {
    exact: true
  }).click();
  await page.getByRole('option', {
    name,
    exact: typeof name === 'string'
  }).click();
}
const counts = {
  denom500: 2,
  denom200: 0,
  denom100: 0,
  denom50: 0,
  denom20: 0,
  denom10: 0,
  change: 0
};
test('F45-01 Register cash expense and vendor payment reconcile drawer, allocations, Cashout and Logs', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
    page
  } = await h.session('owner');
  await h.nav(page, 'Register');
  await expense(page);
  await expect.poll(async () => (await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-5000);
  await choose(page, 'Payment type', 'Vendor payment');
  await choose(page, 'Vendor', 'Drill Alpha Vendor');
  await choose(page, 'Invoice allocation', /^finance-invoice/);
  await page.getByLabel('Amount (₹)', {
    exact: true
  }).fill('200');
  await page.getByRole('button', {
    name: 'Record payment',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(80000);
  expect((await h.get('invoiceStatesV2/finance-invoice')).openAmountPaise).toBe(80000);
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-25000);
  expect(await h.records('cashouts')).toHaveLength(2);
  await h.nav(page, 'Cashout');
  await expect(page.getByLabel('Expected drawer / System Audit', {
    exact: true
  })).toHaveValue('750');
  await expect(page.getByLabel('Cash Paid Out (source-linked)', {
    exact: true
  })).toHaveValue('250');
  await page.getByRole('button', {
    name: 'Continue To Cash Drawer',
    exact: true
  }).click();
  await expect(page.getByRole('region', {
    name: 'Complete Daily Cashout'
  })).toBeVisible();
  await page.getByLabel('500', {
    exact: true
  }).fill('1');
  await page.getByLabel('200', {
    exact: true
  }).fill('1');
  await page.getByLabel('50', {
    exact: true
  }).fill('1');
  await page.getByRole('button', {
    name: 'Save Cashout and Close Drawer',
    exact: true
  }).click();
  await expect.poll(async () => (await h.records('dailyCashouts')).length).toBe(1);
  const [closing] = await h.records('dailyCashouts');
  expect(closing).toMatchObject({
    cashAudit: 750,
    drawerTotal: 750,
    cashExpense: 250,
    recordedByUserId: 'drill-owner',
    financePostingVersion: 1
  });
  expect(closing.holderBalancesAtClose.find(v => v.userId === 'drill-owner').amountPaise).toBe(75000);
  expect((await h.get(h.base + '/handover/main')).checkpoint.cashActualPaise).toBe(0);
  await h.nav(page, 'Logs');
  await page.getByRole('tab', {
    name: 'Daily Cashouts',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'View complete cashout',
    exact: true
  }).first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('logs-visible-actions.png'),
    fullPage: true
  });
  h.evidence.assertions.push({
    independent: {
      openingPaise: 100000,
      expensePaise: 5000,
      vendorPaymentPaise: 20000,
      expectedDrawerPaise: 75000
    }
  });
});
test('F45-02 app does not expose a bank balance and bank expenses still post without a baseline', async ({
  drill: h
}) => {
  await seedFinance(h);
  await h.db.doc('bankBalanceControl/main').delete();
  await h.db.doc('appMetadata/appSettings').delete();
  const {
    page
  } = await h.session('owner');
  await h.nav(page, 'Dashboard');
  await expect(page.getByText('Recorded bank balance', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /bank.*balance/i })).toHaveCount(0);
  await h.nav(page, 'Register');
  await choose(page, 'Payment method', 'Bank Transfer');
  await expense(page, '100');
  expect((await h.records('cashouts'))[0]).toMatchObject({ amountPaise: 10000, paymentMode: 'Bank Transfer' });
  expect(await h.get('bankBalanceControl/main')).toBeUndefined();
  expect(await h.get('appMetadata/appSettings')).toBeUndefined();
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(0);
});
test('F45-03 cheque UI preserves lifecycle and payable posting without an app bank balance', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
    page
  } = await h.session('owner');
  await h.nav(page, 'Register');
  await choose(page, 'Payment type', 'Vendor payment');
  await choose(page, 'Vendor', 'Drill Alpha Vendor');
  await choose(page, 'Invoice allocation', /^finance-invoice/);
  await choose(page, 'Payment method', 'Cheque');
  await page.getByLabel('Amount (₹)', {
    exact: true
  }).fill('200');
  await page.getByLabel('Cheque number', {
    exact: true
  }).fill('1120');
  await page.getByRole('button', {
    name: 'Register issued cheque',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get('chequesV2/1120'))?.status).toBe('issued');
  expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);
  await page.getByRole('tab', {
    name: 'Cheques',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get('chequesV2/1120')).status).toBe('presented');
  await expect(page.getByRole('button', { name: 'Not yet', exact: true })).toHaveCount(0);
  await expect(page.getByRole('row', { name: 'Cheque 1120', exact: true })).toContainText('In progress');
  expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);
  await page.getByRole('button', {
    name: 'Mark cheque 1120 as debited',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Confirm bank debit'
  });
  await expect(dialog.getByRole('button', {
    name: 'OK',
    exact: true
  })).toBeDisabled();
  await dialog.getByLabel('Type CONFIRM to proceed').fill('CONFIRM');
  await dialog.getByRole('button', {
    name: 'OK',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);
  expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(80000);
  expect((await h.get('invoiceStatesV2/finance-invoice')).reservedAmountPaise).toBe(0);
  expect(await h.records('cashouts')).toHaveLength(1);
  await expect(page.getByRole('button', {
    name: 'Mark cheque 1120 as debited',
    exact: true
  })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('cheque-debited.png'),
    fullPage: true
  });
});
test('F45-04 lost acknowledgement and refresh recover original expense without duplicate form submission', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
    page
  } = await h.session('billingA');
  await h.nav(page, 'Register');
  let dropped = false;
  const endpoint = '**/asia-south1/postFinanceOperation';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (!dropped && body?.data?.kind === 'expense') {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await expense(page);
  await expect.poll(async () => (await h.records('cashouts')).length).toBe(1);
  await expect(page.getByText('Financial operation needs recovery', {
    exact: true
  })).toBeVisible();
  await page.reload();
  await h.nav(page, 'Register');
  await expect(page.getByText('Financial operation needs recovery', {
    exact: true
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Recover original result',
    exact: true
  }).click();
  await page.waitForLoadState('domcontentloaded');
  await h.nav(page, 'Register');
  await expect(page.getByLabel('Amount (₹)', {
    exact: true
  })).toHaveValue('');
  expect(await h.records('cashouts')).toHaveLength(1);
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-5000);
  h.evidence.assertions.push({
    lostAcknowledgement: dropped,
    exactlyOnceExpensePaise: 5000
  });
});
test('F45-05 count lease blocks direct payout and checkout, cancellation and refresh retain correct source', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
    page
  } = await h.session('owner');
  await h.nav(page, 'Cashout');
  await page.getByRole('button', {
    name: 'Continue To Cash Drawer',
    exact: true
  }).click();
  await expect(page.getByRole('region', {
    name: 'Complete Daily Cashout'
  })).toBeVisible();
  const ledger = await h.get(h.base + '/handover/main');
  expect(ledger.countReservation.kind).toBe('cashout');
  expect(await failure(() => call(h, page, 'expense', {
    amountPaise: 100,
    category: 'Electricity',
    paidTo: 'Blocked fixture',
    mode: 'cash',
    notes: ''
  }))).toMatch(/being counted/i);
  expect(await h.records('cashouts')).toHaveLength(0);
  expect(await failure(() => h.rpc(page, CLIENT, 'call', ['finalizePosCheckout', {
    operationId: crypto.randomUUID(),
    businessDate: h.date,
    lines: [{
      id: 'a',
      kind: 'product',
      productId: 'drill-product-1',
      barcode: '00001',
      description: 'Drill Product A',
      quantity: 1,
      unitPricePaise: 9000,
      expectedProductRevision: 1,
      stockAtScan: 20
    }],
    discount: {
      mode: 'none',
      amountPaise: 0
    },
    payments: [{
      method: 'cash',
      amountPaise: 9000
    }]
  }]))).toMatch(/counting the shared drawer/i);
  expect(await h.records(h.base + '/bills')).toHaveLength(0);
  await page.reload();
  // The active Cashout page and its reserved-count modal restore on refresh.
  // Assert recovery directly; navigation is correctly blocked by that modal.
  await expect(page.getByRole('region', {
    name: 'Complete Daily Cashout'
  })).toBeVisible();
  await page.getByRole('button', {
    name: 'Cancel count',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get(h.base + '/handover/main')).countReservation).toBeNull();
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(0);
});
test('F45-06 independent terminals cannot overspend one drawer', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
      page: a
    } = await h.session('billingA'),
    {
      page: b
    } = await h.session('billingB');
  const intent = {
    amountPaise: 70000,
    category: 'Electricity',
    paidTo: 'Concurrency fixture',
    mode: 'cash',
    notes: ''
  };
  const results = await Promise.all([failure(() => call(h, a, 'expense', intent)), failure(() => call(h, b, 'expense', intent))]);
  expect(results.filter(r => r === null)).toHaveLength(1);
  expect(results.filter(r => r !== null)[0]).toMatch(/insufficient/);
  expect(await h.records('cashouts')).toHaveLength(1);
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-70000);
});
test('F45-07 direct writes and staff cheque/bank authority forgeries are rejected unchanged', async ({
  drill: h
}) => {
  await seedFinance(h);
  for (const role of ['owner', 'manager', 'billingA']) {
    const {
      page
    } = await h.session(role);
    for (const name of ['cashouts', 'dailyCashouts', 'vendorSettlementsV2', 'vendorAccountStatesV2', 'chequesV2', 'sales', 'cashMovementControl']) expect(await failure(() => h.rpc(page, CLIENT, 'write', [name + '/forged-' + role, {
      id: 'forged-' + role,
      amount: 1,
      revision: 1
    }]))).toMatch(/permission|insufficient/i);
    expect(await failure(() => h.rpc(page, CLIENT, 'write', ['appMetadata/appSettings', {
      currentBankBalance: 999999
    }, 'update']))).toMatch(/permission|insufficient/i);
    expect(await failure(() => call(h, page, 'bank-baseline', {
      balancePaise: 999999,
      expectedRevision: 1,
      reason: 'Forged owner'
    }))).toMatch(/unsupported/i);
  }
  expect(await h.records('cashouts')).toHaveLength(0);
  expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);
});
test('F45-08 phone Logs icons and edit typed confirmation preserve trusted totals and history', async ({
  drill: h
}) => {
  await seedFinance(h);
  const {
    page
  } = await h.session('owner', {
    viewport: {
      width: 390,
      height: 844
    }
  });
  const q = await post(h, page, 'cashout-count-start', {
    date: h.date
  });
  const entry = await post(h, page, 'cashout-close', {
    quoteId: q.id,
    drawerDenominations: counts,
    creditSales: 0,
    reason: ''
  });
  await h.nav(page, 'Logs');
  await page.getByRole('tab', {
    name: 'Daily Cashouts',
    exact: true
  }).click();
  await expect(page.getByRole('button', {
    name: 'View complete cashout',
    exact: true
  }).last()).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Delete cashout',
    exact: true
  }).last()).toBeDisabled();
  await page.getByRole('button', {
    name: 'Edit cashout',
    exact: true
  }).last().click();
  await page.getByLabel('Change', {
    exact: true
  }).fill('1');
  await page.getByLabel('Reason For Correction', {
    exact: true
  }).fill('Verified synthetic count correction');
  await page.getByRole('button', {
    name: 'Apply Owner Correction',
    exact: true
  }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Confirm Cashout edit'
  });
  await expect(dialog.getByLabel('Type CONFIRM to proceed')).toHaveValue('');
  await expect(dialog.getByRole('button', {
    name: 'OK',
    exact: true
  })).toBeDisabled();
  expect((await h.get('dailyCashouts/' + entry.id)).revision).toBe(1);
  await dialog.getByLabel('Type CONFIRM to proceed').fill('CONFIRM');
  await dialog.getByRole('button', {
    name: 'OK',
    exact: true
  }).click();
  await expect.poll(async () => (await h.get('dailyCashouts/' + entry.id)).revision).toBe(2);
  expect((await h.get('dailyCashouts/' + entry.id)).drawerTotal).toBe(1001);
  expect((await h.get('sales/sale-single-store-' + h.date)).cashSales).toBe(0);
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(0);
  await page.screenshot({
    path: test.info().outputPath('phone-logs-icons.png'),
    fullPage: true
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('F45-09 cash payout preserves mandatory logout count and its source evidence',async({drill:h})=>{await seedFinance(h);const {page}=await h.session('billingA');await post(h,page,'expense',{amountPaise:5000,category:'Electricity',paidTo:'Logout fixture',mode:'cash',notes:''});const before=await h.get(h.base+'/cashierStates/drill-billingA');expect(before.needsLogoutCheck).toBe(true);const actor=await h.actor(page),module='/src/features/pos/data/cashierHandoverRepository.ts';const reserved=await h.rpc(page,module,'reserveCount',[actor,'logout']);const record=await h.rpc(page,module,'submitHandover',[actor,'logout',{'500':1,'200':2,'50':1},0,0,0,reserved.revision,h.date,'',reserved.id]);expect(record.actual.cash).toBe(95000);expect(record.expected.cash).toBe(95000);const after=await h.get(h.base+'/cashierStates/drill-billingA');expect(after.closed).toBe(true);expect(after.needsLogoutCheck).toBe(false);expect(after.lastFinancialOperationId).toBe(before.lastFinancialOperationId);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(-5000)})
