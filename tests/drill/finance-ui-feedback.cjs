// Focused UI checks against the existing demo records. Does not seed/reset or post money.
const fs = require('node:fs'), path = require('node:path')
async function check(tool, out) {
  const admin = require('./safe-admin.cjs')
  await admin.health()
  // Separate synthetic owner avoids replacing the owner's active review login.
  try { await admin.auth.getUser('drill-ui-owner') } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
    await admin.auth.createUser({ uid: 'drill-ui-owner', email: 'ui-owner@drill.invalid', password: admin.PASSWORD })
    await admin.db.doc('users/drill-ui-owner').set({ name: 'UI review owner', email: 'ui-owner@drill.invalid', role: 'owner', disabled: false, approvalStatus: 'approved', createdAt: new Date().toISOString() })
  }
  const { chromium, expect } = require(path.join(tool, 'test'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let currentPage
  const evidence = { reset: false, financialPosting: false, assertions: [], errors: [], blocked: [] }
  const origins = new Set(['http://127.0.0.1:5178', 'http://127.0.0.1:9099', 'http://127.0.0.1:8080', 'http://127.0.0.1:5001'])
  try {
    for (const role of ['manager', 'billingA', 'ui-owner']) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url())
        if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
        const projects = [...(request.postData() || '').matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(match => match[1])
        if (!origins.has(url.origin) || projects.some(project => project !== admin.PROJECT) || url.port === '5001' && !url.pathname.startsWith('/demo-alphahub-drill/')) return route.abort('blockedbyclient')
        if (url.port === '5001' && !['getServerTime', 'getFinanceCashoutSummary'].includes(url.pathname.split('/').at(-1))) {
          evidence.blocked.push(url.pathname)
          return route.abort('blockedbyclient')
        }
        return route.continue()
      })
      const page = await context.newPage()
      currentPage = page
      page.on('pageerror', error => evidence.errors.push(error.message))
      await page.goto('http://127.0.0.1:5178/')
      const proof = await page.evaluate(async () => {
        const f = await import('/src/shared/lib/firebase.ts')
        return { project: f.firebaseConfig.projectId, auth: f.auth.emulatorConfig?.host, firestore: f.db._settings.host, functions: f.functions.emulatorOrigin, bypass: f.isLocalAuthBypassEnabled }
      })
      expect(proof).toEqual({ project: admin.PROJECT, auth: '127.0.0.1', firestore: '127.0.0.1:8080', functions: 'http://127.0.0.1:5001', bypass: false })
      await page.getByLabel('Email', { exact: true }).fill(role.toLowerCase() + '@drill.invalid')
      await page.getByLabel('Password', { exact: true }).fill(admin.PASSWORD)
      await page.getByRole('button', { name: 'Open Workspace', exact: true }).click()
      await expect(page.getByRole('button', { name: /^Stock(?:\s|$)/ }).first()).toBeVisible()
      async function nav(label) {
        const open = page.getByRole('button', { name: 'Open navigation', exact: true })
        if (await open.isVisible()) await open.click()
        await page.getByRole('button', { name: new RegExp('^' + label + '(?:\\s|$)') }).first().click()
      }
      await nav('Vendor Workspace')
      await expect(page.getByRole('tab', { name: 'Vendors', exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Payments', exact: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: 'Cheques', exact: true })).toHaveCount(0)
      await nav('Register')
      await expect(page.getByText('Recorded bank balance', { exact: false })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /bank.*balance/i })).toHaveCount(0)
      if (role === 'ui-owner') {
        await nav('Dashboard')
        await expect(page.getByText('Recorded bank balance', { exact: false })).toBeVisible()
        await page.screenshot({ path: path.join(out, 'ui-feedback-owner-dashboard-bank.png'), fullPage: true })
        await nav('Register')
      }
      await page.getByLabel('Payment type', { exact: true }).click()
      await page.getByRole('option', { name: 'Vendor payment', exact: true }).click()
      await expect(page.getByLabel('Vendor name starts with', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0)
      await page.getByLabel('Vendor', { exact: true }).fill('Drill Vendor 06')
      await page.getByRole('option', { name: 'Drill Vendor 062', exact: true }).click()
      await expect(page.getByLabel('Vendor', { exact: true })).toHaveValue('Drill Vendor 062')
      await page.screenshot({ path: path.join(out, 'ui-feedback-' + role + '-register.png'), fullPage: true })
      evidence.assertions.push({ role, proof, vendorTabsRemoved: true, bankInRegister: false, bankOnOwnerDashboard: role === 'ui-owner', singlePagedVendorPicker: true })
      if (role !== 'ui-owner') {
        await nav('Cashout')
        await expect(page.getByRole('heading', { name: 'Cashout', exact: true })).toBeVisible()
        await expect(page.getByText('Cashout is currently locked', { exact: true })).toHaveCount(0)
        evidence.assertions.push({ role, cashoutNavigationAvailableWithoutTimeWindow: true })
        await context.close()
        continue
      }
      await nav('Cashout')
      await expect(page.getByLabel('Expected drawer / System Audit', { exact: true })).not.toHaveValue('—')
      const dateBox = await page.getByLabel('Cashout For Date', { exact: true }).boundingBox()
      const cashBox = await page.getByLabel('Gross cash collections (before refunds)', { exact: true }).boundingBox()
      const machineBox = await page.getByLabel('Gross UPI + Card collections', { exact: true }).boundingBox()
      expect(Math.abs(dateBox.y - cashBox.y)).toBeLessThan(2)
      expect(Math.abs(dateBox.y - machineBox.y)).toBeLessThan(2)
      expect(cashBox.x).toBeGreaterThan(dateBox.x)
      expect(machineBox.x).toBeGreaterThan(cashBox.x)
      await page.screenshot({ path: path.join(out, 'ui-feedback-' + role + '-cashout-desktop.png'), fullPage: true })
      // Layout-only popup probe: a context-local quote opens the form without reserving a count.
      // It is never submitted or cancelled. This is not a full-stack Cashout acceptance result.
      await page.evaluate(async () => {
        const f = await import('/src/features/register/data/financeRepository.ts')
        const { auth } = await import('/src/shared/lib/firebase.ts')
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const summary = await f.getFinanceCashoutSummary(date)
        localStorage.setItem('alphahub:cashout-count:' + auth.currentUser.uid, JSON.stringify({ ...summary, id: 'ui-layout-only', actorUid: auth.currentUser.uid, date }))
      })
      await page.reload()
      await expect(page.getByRole('button', { name: /^Stock(?:\s|$)/ }).first()).toBeVisible()
      const dialog = page.getByRole('dialog', { name: 'Complete Daily Cashout', exact: true })
      if (!(await dialog.isVisible())) await nav('Cashout')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('500', { exact: true })).toBeFocused()
      await dialog.getByRole('button', { name: 'Save Cashout and Close Drawer', exact: true }).focus()
      await page.keyboard.press('Tab')
      await expect(dialog.getByLabel('500', { exact: true })).toBeFocused()
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(dialog).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await page.screenshot({ path: path.join(out, 'ui-feedback-' + role + '-drawer-phone.png'), fullPage: true })
      evidence.assertions.push({ role, proof, vendorTabsRemoved: true, bankInRegister: false, bankOnOwnerDashboard: role === 'ui-owner', singlePagedVendorPicker: true, threeColumnCashout: true, popupLayoutAndFocus: true, phoneOverflow: false, popupPosting: 'NOT RUN: layout-only local quote' })
      await context.close()
      currentPage = null
    }
    expect(evidence.errors).toEqual([])
    evidence.status = 'PASS: focused UI checks only; financial posting not exercised'
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({ path: path.join(out, 'ui-feedback-failure.png'), fullPage: true }).catch(() => {})
      fs.writeFileSync(path.join(out, 'ui-feedback-failure-dom.txt'), await currentPage.locator('body').innerText().catch(() => ''))
    }
    evidence.status = 'FAIL'
    evidence.failure = error.message
    throw error
  } finally {
    fs.writeFileSync(path.join(out, 'ui-feedback-browser.json'), JSON.stringify(evidence, null, 2))
    await browser.close()
  }
}
module.exports = { check }
