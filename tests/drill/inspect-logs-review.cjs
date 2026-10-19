const fs = require('node:fs'), path = require('node:path')
async function inspect(tool, out) {
  const a = require('./safe-admin.cjs'); await a.health()
  const evidence = { project: a.PROJECT, reset: false, financialWrites: false, records: {}, tabs: [], errors: [] }
  for (const name of ['sales', 'dailyCashouts', 'cashouts', 'cashTransfers', 'purchases', 'purchasesV2', 'payments', 'vendorSettlementsV2', 'settingsAudit']) {
    const rows = await a.records(name)
    evidence.records[name] = { count: rows.length, samples: rows.slice(0, 5).map(r => ({ id: r.id, date: r.date || r.invoiceDate, amount: r.amount, sourceKind: r.sourceKind, paidTo: r.paidTo, invoiceNumber: r.invoiceNumber, cashAudit: r.cashAudit, drawerTotal: r.drawerTotal, cashExpense: r.cashExpense, cashSales: r.cashSales, returns: r.returns })) }
  }
  const { chromium, expect } = require(path.join(tool, 'test'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const origins = new Set(['http://127.0.0.1:5178', 'http://127.0.0.1:9099', 'http://127.0.0.1:8080', 'http://127.0.0.1:5001'])
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
    const projects = [...(request.postData() || '').matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(match => match[1])
    if (!origins.has(url.origin) || projects.some(project => project !== a.PROJECT) || url.port === '5001' && url.pathname !== '/demo-alphahub-drill/asia-south1/getServerTime') return route.abort('blockedbyclient')
    return route.continue()
  })
  const page = await context.newPage(); page.on('pageerror', error => evidence.errors.push(error.message))
  try {
    await page.goto('http://127.0.0.1:5178/')
    const proof = await page.evaluate(async () => {
      const f = await import('/src/shared/lib/firebase.ts')
      return { project: f.firebaseConfig.projectId, auth: f.auth.emulatorConfig?.host, firestore: f.db._settings.host, functions: f.functions.emulatorOrigin, bypass: f.isLocalAuthBypassEnabled }
    })
    expect(proof).toEqual({ project: a.PROJECT, auth: '127.0.0.1', firestore: '127.0.0.1:8080', functions: 'http://127.0.0.1:5001', bypass: false }); evidence.proof = proof
    await page.getByLabel('Email', { exact: true }).fill('ui-owner@drill.invalid'); await page.getByLabel('Password', { exact: true }).fill(a.PASSWORD)
    await page.getByRole('button', { name: 'Open Workspace', exact: true }).click()
    await page.getByRole('button', { name: /^Logs(?:\s|$)/ }).first().click()
    for (const label of ['Sales', 'Expenses', 'Purchases', 'Payments', 'Daily Cashouts', 'Cash Transfers', 'Settings Audit', 'Stock Audits']) {
      await page.getByRole('tab', { name: label, exact: true }).click()
      await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('data-state', 'active')
      if (label === 'Expenses' && evidence.records.cashouts.count) await expect(page.getByText(evidence.records.cashouts.samples[0].paidTo, { exact: true }).first()).toBeVisible()
      if (label === 'Purchases' && evidence.records.purchasesV2.count) await expect(page.getByText(evidence.records.purchasesV2.samples[0].invoiceNumber, { exact: true }).first()).toBeVisible()
      if (label === 'Payments') await expect(page.getByRole('status').filter({ hasText: 'Loading vendor records' })).toHaveCount(0)
      const text = await page.getByRole('tabpanel').innerText()
      evidence.tabs.push({ label, text, rowCount: await page.getByRole('tabpanel').getByRole('row').count() })
      await page.screenshot({ path: path.join(out, 'logs-inspect-' + label.toLowerCase().replaceAll(' ', '-') + '.png'), fullPage: true })
      if (label === 'Daily Cashouts' && evidence.records.dailyCashouts.count) {
        const before = await a.records('dailyCashouts')
        const view = page.getByRole('button', { name: 'View complete cashout', exact: true }).first()
        await view.click()
        const details = page.getByRole('dialog', { name: 'Cashout details', exact: true })
        await expect(details).toBeVisible()
        await expect(details.locator('input,textarea,select')).toHaveCount(0)
        await page.screenshot({ path: path.join(out, 'logs-inspect-cashout-details.png'), fullPage: true })
        await page.keyboard.press('Escape')
        await expect(details).toHaveCount(0)
        await expect(view).toBeFocused()
        await expect(page.getByRole('button', { name: 'Delete cashout', exact: true }).first()).toBeDisabled()
        await page.getByRole('button', { name: 'Edit cashout', exact: true }).first().click()
        const edit = page.getByRole('dialog', { name: 'Edit Daily Cashout', exact: true })
        await expect(edit.getByLabel('Cash Sales', { exact: true })).toHaveAttribute('readonly', '')
        await expect(edit.getByLabel('Cash Expense', { exact: true })).toHaveAttribute('readonly', '')
        await edit.getByLabel('Reason For Correction', { exact: true }).fill('Synthetic read-only UI confirmation review')
        await edit.getByRole('button', { name: 'Apply Owner Correction', exact: true }).click()
        const confirmation = page.getByRole('dialog', { name: 'Confirm Cashout edit', exact: true })
        await expect(confirmation.getByLabel('Type CONFIRM to proceed')).toHaveValue('')
        await expect(confirmation.getByRole('button', { name: 'OK', exact: true })).toBeDisabled()
        await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
        await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
        const after = await a.records('dailyCashouts')
        expect(after.map(row => [row.id, row.revision])).toEqual(before.map(row => [row.id, row.revision]))
        evidence.cashoutActions = { eyeReadOnly: true, keyboardClose: true, focusRestored: true, protectedTotals: true, blankConfirm: true, cancelUnchanged: true, deleteDisabled: true }
      }

    }
    evidence.status = 'Read-only inspection completed; no workflow acceptance inferred'
  } catch (error) { evidence.status = 'Inspection failed'; evidence.failure = error.message; throw error }
  finally { fs.writeFileSync(path.join(out, 'logs-review-inspection.json'), JSON.stringify(evidence, null, 2)); await browser.close() }
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(evidence.records).map(([key, value]) => [key, value.count])), tabs: evidence.tabs.map(t => ({ label: t.label, rows: t.rowCount, empty: /No .*found|No cheques recorded/i.test(t.text) })), errors: evidence.errors }))
}
module.exports = { inspect }
