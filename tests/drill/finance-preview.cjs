// One guarded, maximized local review window. Never connects to production.
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto')

async function open(tool, out) {
  const lock = path.resolve('output/playwright/.drill-browser-run.lock')
  if (fs.existsSync(lock)) {
    const previous = JSON.parse(fs.readFileSync(lock))
    let alive = false
    try { process.kill(previous.pid, 0); alive = true } catch (error) { if (error.code !== 'ESRCH') throw error }
    if (alive) throw Error('Another browser run owns the demo fixtures. Review refused until it finishes.')
    fs.unlinkSync(lock)
  }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, runId: process.env.DRILL_RUN_ID, batch: 'finance-preview' }), { flag: 'wx' })
  process.once('exit', () => {
    if (fs.existsSync(lock) && JSON.parse(fs.readFileSync(lock)).pid === process.pid) fs.unlinkSync(lock)
  })
  const admin = require('./safe-admin.cjs')
  await admin.health()
  const fixture = await admin.seed()
  const batch = admin.db.batch()
  batch.set(admin.db.doc('bankBalanceControl/main'), { initialized: true, balancePaise: 500000, revision: 1 })
  batch.set(admin.db.doc('appMetadata/appSettings'), { currentBankBalance: 5000 }, { merge: true })
  batch.set(admin.db.doc('chequeBooksV2/book-1120-1199'), { id: 'book-1120-1199', active: true, startNumber: 1120, endNumber: 1199, revision: 1, createdAt: new Date().toISOString() })
  await batch.commit()

  const { chromium, expect } = require(path.join(tool, 'test'))
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-networking', '--start-maximized'] })
  const context = await browser.newContext({ viewport: null, serviceWorkers: 'block' })
  const origins = new Set(['http://127.0.0.1:5178', 'http://127.0.0.1:9099', 'http://127.0.0.1:8080', 'http://127.0.0.1:5001'])
  const evidence = { project: admin.PROJECT, openedAt: new Date().toISOString(), fixture, blocked: [], requests: [] }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
    const projects = [...(request.postData() || '').matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(match => match[1])
    if (!origins.has(url.origin) || (url.port === '5001' && !url.pathname.startsWith('/demo-alphahub-drill/')) || projects.some(project => project !== admin.PROJECT)) {
      evidence.blocked.push(url.origin + url.pathname)
      return route.abort('blockedbyclient')
    }
    evidence.requests.push({ method: request.method(), url: url.origin + url.pathname })
    return route.continue()
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5178/')
  evidence.proof = await page.evaluate(async () => {
    const f = await import('/src/shared/lib/firebase.ts')
    return { project: f.firebaseConfig.projectId, auth: f.auth.emulatorConfig?.host, firestore: f.db._settings.host, functions: f.functions.emulatorOrigin, bypass: f.isLocalAuthBypassEnabled }
  })
  expect(evidence.proof).toEqual({ project: admin.PROJECT, auth: '127.0.0.1', firestore: '127.0.0.1:8080', functions: 'http://127.0.0.1:5001', bypass: false })
  await page.getByLabel('Email', { exact: true }).fill('owner@drill.invalid')
  await page.getByLabel('Password', { exact: true }).fill(admin.PASSWORD)
  await page.getByRole('button', { name: 'Open Workspace', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Stock(?:\s|$)/ }).first()).toBeVisible()
  await expect.poll(async () => (await admin.get(admin.base + '/cashierStates/drill-owner'))?.joinedCounterId).toBe('fixture-opening')
  const call = (name, data) => page.evaluate(async ({ name, data }) => (await import('/tests/drill/client.ts')).call(name, data), { name, data })
  const post = (kind, intent) => call('postFinanceOperation', { kind, intent: { operationId: randomUUID(), ...intent } })
  await post('vendor-purchase', { id: 'review-invoice', vendorId: 'drill-alpha', invoiceNumber: 'REVIEW-1000', invoiceDate: admin.date, receiptDate: admin.date, invoiceTotalPaise: 100000, category: 'Synthetic', notes: 'Local synthetic review invoice' })
  const product = await admin.get(admin.base + '/products/drill-product-1')
  const bill = await call('finalizePosCheckout', { operationId: randomUUID(), businessDate: admin.date, lines: [{ id: 'A', kind: 'product', productId: product.id, barcode: product.barcode, description: product.name, quantity: 2, unitPricePaise: 9000, expectedProductRevision: product.revision, stockAtScan: product.currentQuantity }], discount: { mode: 'none', amountPaise: 0 }, payments: [{ method: 'cash', amountPaise: 18000 }] })
  const selection = { billId: bill.id, returnCondition: 'sellable', returnLines: [{ lineId: 'A', quantity: 1 }] }
  const quote = await call('quotePosReturn', selection)
  await call('postPosReturn', { ...selection, operationId: randomUUID(), reason: 'Synthetic local review: one item returned', refundMethod: 'cash', refundAmountPaise: 9000, businessDate: quote.businessDate, sourceBillRevision: quote.sourceBillRevision, confirmationHash: quote.confirmationHash })
  await post('expense', { amountPaise: 5000, category: 'Electricity', paidTo: 'Synthetic utility', mode: 'cash', notes: 'Local review payment' })
  await post('vendor-payment', { id: 'review-vendor-payment', vendorId: 'drill-alpha', invoiceId: 'review-invoice', date: admin.date, amountPaise: 20000, mode: 'cash', notes: 'Local synthetic vendor payment' })
  const ledger = await admin.get(admin.base + '/handover/main')
  expect(ledger.cashNetPaise).toBe(-16000)
  evidence.expected = { openingPaise: 100000, grossCashSalesPaise: 18000, cashRefundsPaise: 9000, netCashSalesPaise: 9000, ordinaryExpensePaise: 5000, vendorPaymentPaise: 20000, expectedDrawerPaise: 84000, bankPaise: 500000, vendorOutstandingPaise: 80000 }
  await page.getByRole('button', { name: /^Register(?:\s|$)/ }).first().click()
  await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toBeVisible()
  evidence.layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }))
  await page.screenshot({ path: path.join(out, 'finance-review-register.png'), fullPage: true })
  fs.writeFileSync(path.join(out, 'finance-preview.json'), JSON.stringify(evidence, null, 2))
  await page.bringToFront()
  console.log('READY: one maximized owner review window, local emulators only. Expected drawer INR840; bank INR5000; vendor payable INR800. Browser test reset lock retained until this window closes.')
  await new Promise(resolve => browser.on('disconnected', resolve))
}
module.exports = { open }
