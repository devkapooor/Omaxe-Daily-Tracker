// Visible, real-app review using only the existing guarded demo environment.
const fs = require('node:fs'), path = require('node:path')
module.exports.open = async (tool, out) => {
  const admin = require('./safe-admin.cjs')
  await admin.seed()
  const { chromium } = require(tool)
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-networking'] })
  const origins = new Set(['http://127.0.0.1:5178', 'http://127.0.0.1:9099', 'http://127.0.0.1:8080', 'http://127.0.0.1:5001'])
  const endpoint = 'http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/finalizePosCheckout'
  const evidence = { project: admin.PROJECT, contexts: [], blocked: [], localRequests: [] }
  async function pageFor(role) {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
      if (!origins.has(url.origin) || (url.port === '5001' && !url.pathname.startsWith('/demo-alphahub-drill/'))) {
        evidence.blocked.push(url.origin + url.pathname); return route.abort('blockedbyclient')
      }
      const projects = [...(request.postData() || '').matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(match => match[1])
      if (projects.some(project => project !== admin.PROJECT)) return route.abort('blockedbyclient')
      evidence.localRequests.push({ method: request.method(), url: url.origin + url.pathname }); return route.continue()
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5178/')
    const proof = await page.evaluate(async () => {
      const f = await import('/src/shared/lib/firebase.ts')
      return { project: f.firebaseConfig.projectId, auth: f.auth.emulatorConfig?.host, firestore: f.db._settings.host, functions: f.functions.emulatorOrigin, bypass: f.isLocalAuthBypassEnabled }
    })
    if (proof.project !== admin.PROJECT || proof.auth !== '127.0.0.1' || proof.firestore !== '127.0.0.1:8080' || proof.functions !== 'http://127.0.0.1:5001' || proof.bypass) throw Error('Preview isolation proof failed')
    evidence.contexts.push({ role, proof })
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(role.toLowerCase() + '@drill.invalid')
    await page.getByLabel('Password', { exact: true }).fill(admin.PASSWORD)
    await page.getByRole('button', { name: 'Open Workspace', exact: true }).click()
    await page.getByRole('button', { name: /^POS(?:\s|$)/ }).first().click()
    await page.getByRole('textbox', { name: 'Scan barcode or search product name', exact: true }).waitFor()
    return page
  }
  async function scan(page, barcode) {
    const field = page.getByRole('textbox', { name: 'Scan barcode or search product name', exact: true })
    await field.fill(barcode); await field.press('Enter'); await field.waitFor({ state: 'visible' })
    await page.getByRole('button', { name: /^Remove Drill Product/ }).waitFor()
  }
  const normal = await pageFor('owner')
  await scan(normal, '00001')
  const recovery = await pageFor('billingA')
  await scan(recovery, '00002')
  await recovery.route(endpoint, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    if (route.request().url() !== endpoint) throw Error('Recovery preview endpoint mismatch')
    const result = await route.fetch({ maxRedirects: 0 })
    if (result.status() !== 200) throw Error('Preview posting failed')
    evidence.committedRecoveryBill = (await result.json()).result
    await route.abort('failed')
  })
  await recovery.getByRole('button', { name: 'Finalize Bill', exact: true }).click()
  await recovery.getByRole('button', { name: 'Recover checkout', exact: true }).waitFor()
  await recovery.unroute(endpoint)
  await normal.screenshot({ path: path.join(out, 'review-normal-desktop.png'), fullPage: true })
  await recovery.screenshot({ path: path.join(out, 'review-recovery-desktop.png'), fullPage: true })
  fs.writeFileSync(path.join(out, 'preview.json'), JSON.stringify(evidence, null, 2))
  console.log('Two visible guarded Chrome windows are ready: owner normal checkout and billing recovery. Demo data only.')
  await new Promise(resolve => browser.on('disconnected', resolve))
}
