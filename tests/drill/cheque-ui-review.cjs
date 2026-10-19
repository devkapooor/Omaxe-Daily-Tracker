// Verify current review cheques without resetting fixtures or confirming any debit.
const fs = require('node:fs'), path = require('node:path')
async function check(tool, out) {
  const admin = require('./safe-admin.cjs')
  await admin.health()
  const journal = JSON.parse(fs.readFileSync(path.join(out, 'cheque-review-fixtures.json')))
  if (journal.project !== admin.PROJECT || !journal.synthetic || !journal.completedAt) throw Error('Prepared isolated cheque samples are required.')
  const { chromium, expect } = require(path.join(tool, 'test'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const origins = new Set(['http://127.0.0.1:5178', 'http://127.0.0.1:9099', 'http://127.0.0.1:8080', 'http://127.0.0.1:5001'])
  const evidence = { synthetic: true, reset: false, financialPosting: false, rows: [], pageErrors: [] }
  await context.tracing.start({ screenshots: true, snapshots: true })
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
    const projects = [...(request.postData() || '').matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(match => match[1])
    if (!origins.has(url.origin) || projects.some(project => project !== admin.PROJECT) || url.port === '5001' && (!url.pathname.startsWith('/demo-alphahub-drill/') || !['getServerTime', 'presentDueCheque'].includes(url.pathname.split('/').at(-1)))) return route.abort('blockedbyclient')
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  try {
    await page.goto('http://127.0.0.1:5178/')
    evidence.proof = await page.evaluate(async () => {
      const f = await import('/src/shared/lib/firebase.ts')
      return { project: f.firebaseConfig.projectId, auth: f.auth.emulatorConfig?.host, firestore: f.db._settings.host, functions: f.functions.emulatorOrigin, bypass: f.isLocalAuthBypassEnabled }
    })
    expect(evidence.proof).toEqual({ project: admin.PROJECT, auth: '127.0.0.1', firestore: '127.0.0.1:8080', functions: 'http://127.0.0.1:5001', bypass: false })
    await page.getByLabel('Email', { exact: true }).fill('ui-owner@drill.invalid')
    await page.getByLabel('Password', { exact: true }).fill(admin.PASSWORD)
    await page.getByRole('button', { name: 'Open Workspace', exact: true }).click()
    await page.getByRole('button', { name: /^Register(?:\s|$)/ }).first().click()
    await page.getByRole('tab', { name: 'Cheques', exact: true }).click()
    await expect(page.getByRole('table', { name: 'Cheques', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveCount(6)
    await expect(page.getByRole('button', { name: 'Not yet', exact: true })).toHaveCount(0)
    await expect(page.getByRole('table', { name: 'Cheques', exact: true }).locator('summary')).toHaveCount(0)
    let confirmationChecked = false
    for (const sample of journal.cheques) {
      const source = await admin.get('chequesV2/' + sample.number)
      const row = page.getByRole('row', { name: 'Cheque ' + sample.number, exact: true })
      await expect(row).toBeVisible()
      const pending = ['issued', 'presented'].includes(source.status)
      const expectedLabel = pending ? source.date > admin.date ? 'Issued' : 'In progress' : source.status.charAt(0).toUpperCase() + source.status.slice(1)
      await expect(row).toContainText(expectedLabel)
      const view = row.getByRole('button', { name: 'View cheque ' + sample.number, exact: true })
      await view.click()
      const details = page.getByRole('dialog', { name: 'Cheque details', exact: true })
      await expect(details.getByText('Payee', { exact: true })).toBeVisible()
      await expect(details.getByText(sample.number, { exact: true })).toBeVisible()
      await expect(details.locator('input,textarea')).toHaveCount(0)
      await details.getByRole('button', { name: 'Close cheque details', exact: true }).click()
      await expect(view).toBeFocused()
      const action = row.getByRole('button', { name: 'Mark cheque ' + sample.number + ' as debited', exact: true })
      if (pending) {
        await expect(action).toBeVisible()
        if (source.date > admin.date) await expect(action).toBeDisabled()
        else {
          await expect(action).toBeEnabled()
          if (!confirmationChecked) {
            await action.click()
            const dialog = page.getByRole('dialog', { name: 'Confirm bank debit', exact: true })
            await expect(dialog.getByLabel('Type CONFIRM to proceed')).toHaveValue('')
            await expect(dialog.getByRole('button', { name: 'OK', exact: true })).toBeDisabled()
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            expect((await admin.get('chequesV2/' + sample.number)).revision).toBe(source.revision)
            confirmationChecked = true
          }
        }
      } else {
        await expect(row.getByRole('button')).toHaveCount(1)
        await expect(view).toBeVisible()
      }
      evidence.rows.push({ number: sample.number, storedStatus: source.status, label: expectedLabel, action: pending ? source.date > admin.date ? 'disabled until due' : 'mark as debited' : 'none' })
    }
    const dueSample = journal.cheques.find(sample => sample.label === 'Due Presented')
    const dueRow = page.getByRole('row', { name: 'Cheque ' + dueSample.number, exact: true })
    const cancelAction = dueRow.getByRole('button', { name: 'Cancel cheque ' + dueSample.number, exact: true })
    if (await cancelAction.isVisible()) {
      await cancelAction.click()
      const exception = page.getByRole('dialog', { name: 'Cancel cheque', exact: true })
      await expect(exception.getByLabel('Reason', { exact: true })).toHaveValue('')
      await expect(exception.getByLabel('Type CONFIRM to proceed')).toHaveValue('')
      await expect(exception.getByRole('button', { name: 'OK', exact: true })).toBeDisabled()
      await exception.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await page.screenshot({ path: path.join(out, 'cheque-single-action-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect(await page.getByRole('table', { name: 'Cheques', exact: true }).evaluate(table => table.parentElement.scrollWidth > table.parentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: path.join(out, 'cheque-single-action-phone.png'), fullPage: true })
    const phoneEye = page.getByRole('button', { name: 'View cheque ' + journal.cheques[0].number, exact: true })
    await phoneEye.click()
    const phoneDetails = page.getByRole('dialog', { name: 'Cheque details', exact: true })
    await expect(phoneDetails.getByText('Payee', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: path.join(out, 'cheque-icon-details-phone.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(phoneDetails).toHaveCount(0)
    expect(evidence.pageErrors).toEqual([])
    evidence.confirmationChecked = confirmationChecked
    evidence.status = 'PASS: existing synthetic cheque UI; debit posting not exercised'
  } catch (error) {
    evidence.status = 'FAIL'; evidence.failure = error.message
    await page.screenshot({ path: path.join(out, 'cheque-single-action-failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
    fs.writeFileSync(path.join(out, 'cheque-single-action-ui.json'), JSON.stringify(evidence, null, 2))
    await context.tracing.stop({ path: path.join(out, 'cheque-single-action-ui-trace.zip') })
    await browser.close()
  }
}
module.exports = { check }
