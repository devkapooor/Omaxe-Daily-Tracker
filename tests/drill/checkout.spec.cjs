const { test, expect } = require('./helpers.cjs')
const crypto = require('node:crypto')
const path = require('node:path')
const REPO = '/src/features/pos/data/posRepository.ts'
const CLIENT = '/tests/drill/client.ts'
const COUNTER = '/src/features/pos/data/cashierHandoverRepository.ts'
const endpoint = 'http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/finalizePosCheckout'
const output = name => path.resolve('output/playwright', process.env.DRILL_RUN_ID, name)
async function input(h, quantity = 2, id = crypto.randomUUID()) {
  const product = await h.get(h.base + '/products/drill-product-1')
  return { operationId: id, businessDate: h.date, lines: [{ id: 'A', kind: 'product', productId: product.id, barcode: product.barcode, description: product.name, quantity, unitPricePaise: product.sellingPricePaise, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: product.sellingPricePaise * quantity }] }
}
async function post(h, page, data) { return h.rpc(page, CLIENT, 'call', ['finalizePosCheckout', data]) }
async function rejected(action) {
  try { await action(); return null } catch (error) {
    if (/DRILL_HELPER_|not a function|Failed to fetch dynamically imported module/.test(error.message)) throw error
    return error.message
  }
}
async function snapshot(h) {
  const names = ['bills', 'billStates', 'sequences', 'events', 'stockMovements', 'products', 'handover', 'cashierStates']
  const value = {}
  for (const name of names) value[name] = (await h.records(h.base + '/' + name)).sort((a, b) => a.id.localeCompare(b.id))
  return value
}
async function unchanged(h, page, data, pattern) {
  const before = await snapshot(h)
  const error = await rejected(() => post(h, page, data))
  expect(error).toMatch(pattern)
  const after = await snapshot(h)
  expect(after).toEqual(before)
  h.evidence.assertions.push({ rejected: error, before, after })
}
async function scan(page, barcode) {
  const field = page.getByRole('textbox', { name: 'Scan barcode or search product name', exact: true })
  await field.fill(barcode); await field.press('Enter'); await expect(field).toHaveValue('')
}

test('B1-01 trusted normal totals, actor, cash change and atomic sources', async ({ drill: h }) => {
  const { page } = await h.session('billingA')
  const data = await input(h), b = await h.get(h.base + '/products/drill-product-2')
  data.lines.push({ id: 'B', kind: 'product', productId: b.id, barcode: b.barcode, description: b.name, quantity: 1, unitPricePaise: 4500, expectedProductRevision: 1, stockAtScan: 10 })
  data.discount = { mode: 'percentage', percentage: 5, amountPaise: 1125 }
  data.payments = [{ method: 'cash', amountPaise: 21375 }]; data.cashTenderedPaise = 25000; data.cashChangePaise = 3625
  const bill = await post(h, page, data)
  expect(bill).toMatchObject({ id: data.operationId, subtotalPaise: 22500, totalPaise: 21375, cashChangePaise: 3625, createdByUid: 'drill-billingA', createdByRole: 'billing', businessDate: h.date, sequenceNumber: 1 })
  expect(bill.receiptNumber).toMatch(/^TNS-\d{8}-\d{9}-000001$/)
  expect((await h.get(h.base + '/products/drill-product-1')).currentQuantity).toBe(18)
  expect((await h.get(h.base + '/products/drill-product-2')).currentQuantity).toBe(9)
  expect((await h.records(h.base + '/stockMovements')).map(m => m.quantityDelta).sort((a, b) => a - b)).toEqual([-2, -1])
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(21375)
  expect((await h.get(h.base + '/cashierStates/drill-billingA')).needsLogoutCheck).toBe(true)
  expect(await h.get(h.base + '/billStates/' + bill.id)).toMatchObject({ revision: 1, state: 'active' })
  expect(await h.get(h.base + '/events/' + bill.id)).toMatchObject({ type: 'bill-finalized', billId: bill.id, totalPaise: 21375, actorUid: 'drill-billingA' })
  h.evidence.assertions.push({ independentlyExpected: { subtotalPaise: 22500, discountPaise: 1125, totalPaise: 21375, changePaise: 3625 }, bill })
})

test('B1-02 concurrent terminals serialize sequences and reconcile stock/cash', async ({ drill: h }) => {
  const { page: a } = await h.session('billingA'), { page: b } = await h.session('billingB')
  const ia = await input(h), ib = await input(h)
  ib.lines = [{ id: 'B', kind: 'product', productId: 'drill-product-2', barcode: '00002', description: 'Drill Product B', quantity: 2, unitPricePaise: 4500, expectedProductRevision: 1, stockAtScan: 10 }]
  ib.payments = [{ method: 'cash', amountPaise: 9000 }]
  const bills = await Promise.all([post(h, a, ia), post(h, b, ib)])
  expect(bills.map(bill => bill.sequenceNumber).sort()).toEqual([1, 2])
  expect(new Set(bills.map(bill => bill.receiptNumber)).size).toBe(2)
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(27000)
  expect((await h.get(h.base + '/products/drill-product-1')).currentQuantity).toBe(18)
  expect((await h.get(h.base + '/products/drill-product-2')).currentQuantity).toBe(8)
  expect(await h.records(h.base + '/stockMovements')).toHaveLength(2)
  h.evidence.assertions.push({ bills, independentCashNetPaise: 27000 })
})

test('B1-03 same intent races and replays once; changed payload and actor reject', async ({ drill: h }) => {
  const { page: a } = await h.session('billingA'), { page: b } = await h.session('billingB')
  const data = await input(h)
  const bills = await Promise.all([post(h, a, data), post(h, a, data)])
  expect(bills[0]).toEqual(bills[1])
  const before = await snapshot(h)
  expect(await post(h, a, data)).toEqual(bills[0]); expect(await snapshot(h)).toEqual(before)
  await unchanged(h, a, { ...data, customerName: 'Changed intent' }, /different intent/i)
  await unchanged(h, b, data, /different intent/i)
  expect(await h.records(h.base + '/bills')).toHaveLength(1)
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(18000)
  h.evidence.assertions.push({ original: bills[0], replay: bills[1], before })
})

test('B1-04 direct callable rejects forged quote, discount, payments and change', async ({ drill: h }) => {
  const { page } = await h.session('billingA'), data = await input(h)
  const cases = [
    [{ ...data, lines: [{ ...data.lines[0], unitPricePaise: 1 }], payments: [{ method: 'cash', amountPaise: 2 }] }, /updated since scan/i],
    [{ ...data, discount: { mode: 'percentage', percentage: 99, amountPaise: 17820, overrideReason: 'Supplied owner claim' }, payments: [{ method: 'cash', amountPaise: 180 }] }, /billing limit/i],
    [{ ...data, discount: { mode: 'percentage', percentage: 5, amountPaise: 1 } }, /discount quote/i],
    [{ ...data, payments: [{ method: 'cash', amountPaise: 17999 }] }, /exactly equal/i],
    [{ ...data, cashTenderedPaise: 17999 }, /tendered/i],
    [{ ...data, cashTenderedPaise: 20000, cashChangePaise: 9999 }, /change/i],
    [{ ...data, payments: [{ method: 'bank-transfer', amountPaise: 18000 }] }, /supported payment/i],
    [{ ...data, lines: [{ ...data.lines[0], expectedProductRevision: undefined }] }, /revision/i],
    [{ ...data, actor: { role: 'owner' } }, /unsupported fields/i],
  ]
  for (const [payload, pattern] of cases) await unchanged(h, page, payload, pattern)
})

test('B1-05 role discount policies from profile and configuration', async ({ drill: h }) => {
  const { page: billing } = await h.session('billingA'), { page: manager } = await h.session('manager'), { page: owner } = await h.session('owner')
  for (const page of [manager, owner]) {
    const data = await input(h)
    data.discount = { mode: 'percentage', percentage: 10, amountPaise: 1800 }; data.payments = [{ method: 'cash', amountPaise: 16200 }]
    await unchanged(h, page, data, /reason is required/i)
    data.discount.overrideReason = 'Approved fixture override'
    const bill = await post(h, page, data)
    expect(bill.totalPaise).toBe(16200)
    expect(['manager', 'owner']).toContain(bill.createdByRole)
  }
  await h.db.doc(h.base + '/configuration/checkout').set({ billingMaxDiscountPercentage: null })
  const data = await input(h); data.discount = { mode: 'amount', amountPaise: 100 }; data.payments = [{ method: 'cash', amountPaise: 17900 }]
  await unchanged(h, billing, data, /disabled for billing/i)
})

for (const method of ['upi', 'card', 'split']) test(`B1-06 ${method} settlement and ledger allocations`, async ({ drill: h }) => {
  const { page } = await h.session('billingA'), data = await input(h)
  data.payments = method === 'split' ? [{ method: 'cash', amountPaise: 6000 }, { method: 'upi', amountPaise: 7000 }, { method: 'card', amountPaise: 5000 }] : [{ method, amountPaise: 18000 }]
  if (method === 'split') { data.cashTenderedPaise = 10000; data.cashChangePaise = 4000 }
  const bill = await post(h, page, data), ledger = await h.get(h.base + '/handover/main')
  expect(ledger.cashNetPaise).toBe(method === 'split' ? 6000 : 0)
  expect(ledger.dailyTotals[h.date]).toEqual({ upi: method === 'upi' ? 18000 : method === 'split' ? 7000 : 0, card: method === 'card' ? 18000 : method === 'split' ? 5000 : 0 })
  expect(bill.totalPaise).toBe(18000)
  if (method === 'split') expect(bill.cashChangePaise).toBe(4000)
})

test('B1-07 counter count locks, cancelled lock, membership and committed recovery', async ({ drill: h }) => {
  const { page: a } = await h.session('billingA'), { page: b } = await h.session('billingB')
  const actor = await h.actor(a), data = await input(h)
  const reservation = await h.rpc(a, COUNTER, 'reserveCount', [actor, 'logout'])
  await unchanged(h, b, data, /counting the shared drawer/i)
  await h.rpc(a, COUNTER, 'releaseCount', [actor, reservation.id])
  const bill = await post(h, a, data)
  const locked = await h.rpc(a, COUNTER, 'reserveCount', [actor, 'logout'])
  const before = await snapshot(h)
  expect(await post(h, a, data)).toEqual(bill); expect(await snapshot(h)).toEqual(before)
  await h.rpc(a, COUNTER, 'releaseCount', [actor, locked.id])
  // Stop the actual UI's legitimate auto-join before testing a missing join.
  // Keep the real signed-in SDK identity and all outbound isolation guards.
  await a.goto('http://127.0.0.1:5178/tests/drill/sdk-only.html')
  await expect.poll(async () => (await h.rpc(a, CLIENT, 'authIdentity')).uid).toBe('drill-billingA')
  await h.clock(a)
  const next = await input(h)
  await h.db.doc(h.base + '/cashierStates/drill-billingA').update({ joinedCounterId: 'another-counter' })
  await unchanged(h, a, next, /Join the open shared counter/i)
  await h.db.doc(h.base + '/cashierStates/drill-billingA').update({ joinedCounterId: 'fixture-opening', authTime: 1 })
  await unchanged(h, a, next, /Join the open shared counter/i)
})

test('B1-08 zero price, negative stock policy and repeated SKU aggregation', async ({ drill: h }) => {
  const { page } = await h.session('billingA'), data = await input(h)
  data.lines.push({ ...data.lines[0], id: 'A-second', quantity: 1 }); data.payments[0].amountPaise = 27000
  const bill = await post(h, page, data)
  expect(bill.lines).toHaveLength(1)
  expect(bill.lines[0]).toMatchObject({ id: 'A', quantity: 3, unitPricePaise: 9000 })
  expect((await h.get(h.base + '/products/drill-product-1')).currentQuantity).toBe(17)
  expect(await h.records(h.base + '/stockMovements')).toHaveLength(1)
  expect((await h.records(h.base + '/stockMovements'))[0].quantityDelta).toBe(-3)
  await h.db.doc(h.base + '/products/drill-product-1').update({ sellingPricePaise: 0, currentQuantity: -3, revision: 3 })
  const zero = await post(h, page, await input(h, 1))
  expect(zero.totalPaise).toBe(0)
  expect((await h.get(h.base + '/products/drill-product-1')).currentQuantity).toBe(-4)
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(27000)
})

test('B1-09 actual 200 distinct lines post atomically; 201 reject unchanged', async ({ drill: h }) => {
  const { page } = await h.session('billingA'), prototype = await h.get(h.base + '/products/drill-product-1'), batch = h.db.batch()
  const data = { operationId: crypto.randomUUID(), businessDate: h.date, lines: [], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 20000 }] }
  for (let i = 1; i <= 200; i++) {
    const id = 'limit-product-' + i, barcode = 'LIMIT' + i
    batch.set(h.db.doc(h.base + '/products/' + id), { ...prototype, id, barcode, name: 'Limit ' + i, currentQuantity: 10, sellingPricePaise: 100, revision: 1 })
    data.lines.push({ id: 'limit-line-' + i, kind: 'product', productId: id, barcode, description: 'Limit ' + i, quantity: 1, unitPricePaise: 100, expectedProductRevision: 1, stockAtScan: 10 })
  }
  await batch.commit()
  const bill = await post(h, page, data)
  expect(bill.lines).toHaveLength(200); expect(bill.totalPaise).toBe(20000)
  const movements = await h.records(h.base + '/stockMovements'); expect(movements).toHaveLength(200)
  expect(movements.every(m => m.quantityDelta === -1 && m.beforeQuantity === 10 && m.afterQuantity === 9)).toBe(true)
  expect((await h.records(h.base + '/products')).filter(p => p.id.startsWith('limit-product-')).every(p => p.currentQuantity === 9 && p.revision === 2)).toBe(true)
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(20000)
  await unchanged(h, page, { ...data, operationId: crypto.randomUUID(), lines: [...data.lines, { ...data.lines[0], id: '201' }] }, /1 to 200/i)
  h.evidence.assertions.push({ billId: bill.id, lineCount: 200, movementCount: movements.length, independentlyExpectedTotalPaise: 20000 })
})

test('B1-10 lost response after commit; refresh restores intent and original bill', async ({ drill: h }) => {
  const { page } = await h.session('billingA'); await h.nav(page, 'POS'); await scan(page, '00001'); await scan(page, '00001')
  await page.getByRole('spinbutton', { name: 'Cash received', exact: true }).fill('200')
  await page.route(endpoint, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    expect(route.request().url()).toBe(endpoint)
    const response = await route.fetch({ maxRedirects: 0 })
    expect(response.status()).toBe(200)
    h.evidence.assertions.push({ lostAcknowledgement: true, endpoint, committedResponse: await response.json() })
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Finalize Bill', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recover checkout', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Recover checkout', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Finalize Bill', exact: true, includeHidden: true })).toBeDisabled()
  const original = (await h.records(h.base + '/bills'))[0]; expect(original.totalPaise).toBe(18000)
  const before = await snapshot(h)
  await page.screenshot({ path: output('checkout-recovery-desktop.png'), fullPage: true })
  await page.unroute(endpoint); await page.reload()
  await expect(page.getByRole('button', { name: 'Recover checkout', exact: true })).toBeVisible()
  const pending = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith('alphahub:checkout:v1:')))
  expect(JSON.parse(pending[1]).operationId).toBe(original.id)
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: output('checkout-recovery-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Recover checkout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recover checkout', exact: true })).toHaveCount(0)
  expect(await snapshot(h)).toEqual(before)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('alphahub:checkout:v1:')))).toEqual([])
  await expect(page.getByLabel('0 items in cart')).toBeVisible()
  await page.screenshot({ path: output('checkout-recovered-phone.png'), fullPage: true })
})

test('B1-11 legacy direct checkout fails unchanged and retained held cart remains usable', async ({ drill: h }) => {
  const { page } = await h.session('billingA'), actor = await h.actor(page), data = await input(h)
  const heldId = await h.rpc(page, REPO, 'saveHeldCart', [{ label: 'Legacy unposted cart', lines: data.lines, discount: data.discount }, actor])
  const bill = await post(h, page, data), before = await snapshot(h)
  expect(await rejected(() => h.rpc(page, CLIENT, 'directBillWithoutStock', [bill.id, 'legacy-direct-bill']))).toMatch(/permission[-_]denied|insufficient permissions/i)
  expect(await snapshot(h)).toEqual(before)
  expect(await h.get(h.base + '/heldCarts/' + heldId)).toMatchObject({ label: 'Legacy unposted cart', revision: 1 })
  h.evidence.assertions.push({ oldClientWriteDenied: true, heldId, before })
})

test('B1-12 anonymous, disabled and missing profile callable rejection', async ({ drill: h }) => {
  const data = await input(h)
  for (const role of ['disabled', 'missing', 'unauthenticated']) {
    const { page } = await h.session(role, { gate: false })
    if (role !== 'unauthenticated') await expect.poll(async () => (await h.rpc(page, CLIENT, 'authIdentity')).uid).toBe('drill-' + role)
    await unchanged(h, page, data, /account cannot|Sign in|unauthenticated/i)
  }
})

test('B1-13 phone checkout controls and saved cash/change remain usable', async ({ drill: h }) => {
  const { page } = await h.session('billingA', { viewport: { width: 390, height: 844 } })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await h.nav(page, 'POS'); await scan(page, '00001'); await scan(page, '00001')
  await page.getByRole('spinbutton', { name: 'Cash received', exact: true }).fill('200')
  await expect(page.getByLabel('Change to return')).toContainText('20.00')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: output('checkout-normal-phone.png'), fullPage: true })
  await page.getByRole('button', { name: 'Finalize Bill', exact: true }).click()
  await expect.poll(async () => (await h.records(h.base + '/bills')).length).toBe(1)
  const bill = (await h.records(h.base + '/bills'))[0]
  expect(bill).toMatchObject({ totalPaise: 18000, cashChangePaise: 2000, createdByUid: 'drill-billingA' })
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(18000)
  await expect(page.getByLabel('0 items in cart')).toBeVisible()
})

test('B1-14 canonical repeated-SKU bill supports capped immediate return while new void stays retired', async ({ drill: h }) => {
 const { page } = await h.session('billingA'), actor = await h.actor(page), data = await input(h)
 data.lines.push({ ...data.lines[0], id: 'A-second', quantity: 1 }); data.payments[0].amountPaise = 27000
 const bill = await post(h, page, data)
 expect(bill.lines).toHaveLength(1); expect(bill.lines[0].quantity).toBe(3)
 expect(await rejected(() => h.rpc(page, REPO, 'requestBillAction', [{ type: 'void', billId: bill.id, reason: 'Retired void contract' }, actor]))).toMatch(/retired/i)
 const selection={billId:bill.id,returnCondition:'sellable',returnLines:[{lineId:'A',quantity:3}]}
 const q=await h.rpc(page,CLIENT,'call',['quotePosReturn',selection]);expect(q.refundPaise).toBe(27000)
 await h.rpc(page,CLIENT,'call',['postPosReturn',{...selection,operationId:crypto.randomUUID(),reason:'Canonical repeated SKU capped return',refundMethod:'cash',refundAmountPaise:27000,businessDate:q.businessDate,sourceBillRevision:q.sourceBillRevision,confirmationHash:q.confirmationHash}])
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0)
 expect(await h.get(h.base+'/billStates/'+bill.id)).toMatchObject({state:'partially-returned',returnedQuantities:{A:3}})
 expect((await h.get(h.base+'/bills/'+bill.id)).totalPaise).toBe(27000)
 expect((await h.records('cashouts'))[0].amountPaise).toBe(27000)
 expect(await rejected(()=>h.rpc(page,CLIENT,'call',['quotePosReturn',selection]))).toMatch(/remaining|already|exceed|returnable/i)
})
