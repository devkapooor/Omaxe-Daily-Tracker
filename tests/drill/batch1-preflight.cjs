// Read-only project metadata. Deliberately does not use checkBillingEnabled:
// that Firebase CLI helper may enable an API. Never print credentials/accounts.
const fs = require('node:fs')
const path = require('node:path')
const cli = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib')
async function main() {
  const options = { project: 'alphahub-f137b', nonInteractive: true }
  const auth = require(path.join(cli, 'auth.js'))
  const account = auth.getGlobalDefaultAccount()
  if (!account) throw Error('Authenticated read-only billing metadata access unavailable')
  auth.setActiveAccount(options, account)
  await require(path.join(cli, 'requireAuth.js')).requireAuth(options)
  const { Client } = require(path.join(cli, 'apiv2.js'))
  const billing = await new Client({ urlPrefix: 'https://cloudbilling.googleapis.com', apiVersion: 'v1' })
    .get('/projects/alphahub-f137b/billingInfo', { headers: { 'x-goog-user-project': options.project } })
  const database = await new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' })
    .get('/projects/alphahub-f137b/databases/(default)')
  const functions = await new Client({ urlPrefix: 'https://cloudfunctions.googleapis.com', apiVersion: 'v2' })
    .get('/projects/alphahub-f137b/locations/asia-south1/functions')
  const evidence = {
    checkedAt: new Date().toISOString(), project: options.project,
    billingEnabled: billing.body.billingEnabled === true,
    firebasePlan: billing.body.billingEnabled === true ? 'Blaze (billing enabled)' : 'Billing disabled; implementation blocked',
    firestoreLocation: database.body.locationId,
    functions: (functions.body.functions || []).map(f => ({ name: f.name.split('/').at(-1), runtime: f.buildConfig?.runtime })),
    operations: ['GET billingInfo', 'GET database metadata', 'GET function metadata'],
    writes: 0, billingConfigurationChanges: 0,
  }
  const out = path.resolve('output/playwright', process.env.DRILL_RUN_ID || '2026-10-13-checkout-batch1')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'preflight.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
  if (!evidence.billingEnabled) process.exitCode = 1
}
main().catch(() => { console.error('Read-only project metadata preflight failed; no configuration change attempted.'); process.exitCode = 1 })
