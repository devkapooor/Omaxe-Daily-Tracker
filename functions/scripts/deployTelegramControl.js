// Add the isolated owner page while retaining every current Hosting file/config.
// Run only after release approval. No financial records or dashboard files change.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { createHash } = require('node:crypto')
let phase = 'initialize'

async function deploy() {
  if (!process.argv.includes('--deploy')) throw new Error('Explicit --deploy is required')
  const root = path.resolve(__dirname, '../..')
  const cli = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib')
  const auth = require(path.join(cli, 'auth'))
  const network = require(path.join(cli, 'apiv2'))
  const account = auth.getProjectDefaultAccount(root)
  if (!account?.tokens?.refresh_token) throw new Error('Existing Firebase CLI sign-in required')
  const fresh = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])
  if (!fresh.expires_at || fresh.access_token === account.tokens.refresh_token) throw new Error('Firebase session must be refreshed')
  network.setRefreshToken(account.tokens.refresh_token)
  network.setAccessToken(fresh.access_token)
  const client = new network.Client({ urlPrefix: 'https://firebasehosting.googleapis.com', apiVersion: 'v1beta1' })
  const site = 'sites/alphahub-f137b'
  const latest = async () => (await client.get('/' + site + '/releases', { queryParams: { pageSize: 1 }, timeout: 20000 })).body.releases?.[0]
  phase = 'read-live-release'
  const base = await latest()
  if (!base?.version?.name) throw new Error('Existing Hosting release unavailable')
  phase = 'read-live-version'
  const version = (await client.get('/' + base.version.name, { timeout: 20000 })).body
  const original = {}
  let pageToken
  phase = 'read-live-file-manifest'
  do {
    const page = (await client.get('/' + base.version.name + '/files', { queryParams: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) }, timeout: 20000 })).body
    for (const file of page.files || []) original[file.path] = file.hash
    pageToken = page.nextPageToken
  } while (pageToken)
  if (!original['/index.html'] || Object.keys(original).length < 3) throw new Error('Live Hosting file manifest is incomplete')
  const source = path.join(root, 'output/telegram-settings-dist')
  const added = {}, compressed = new Map()
  const secret = JSON.parse(fs.readFileSync(path.join(root, 'functions/.env.telegram.secret.json'), 'utf8'))
  function collect(directory, relative = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = relative + '/' + item.name
      if (item.isDirectory()) { collect(path.join(directory, item.name), next); continue }
      if (next !== '/telegram-settings.html' && !next.startsWith('/telegram-assets/')) throw new Error('Unexpected owner-page path')
      const bytes = fs.readFileSync(path.join(directory, item.name))
      if (bytes.includes(Buffer.from(secret.token)) || bytes.includes(Buffer.from(secret.webhookSecret))) throw new Error('Private credential found in page assets')
      const gzip = zlib.gzipSync(bytes)
      const hash = createHash('sha256').update(gzip).digest('hex')
      added[next] = hash
      compressed.set(hash, gzip)
    }
  }
  phase = 'collect-owner-page'
  collect(source)
  if (!added['/telegram-settings.html']) throw new Error('Owner page is missing')
  const merged = { ...original, ...added }
  phase = 'create-version'
  const created = (await client.post('/' + site + '/versions', { config: version.config || {}, labels: { feature: 'telegram-control' } }, { timeout: 20000 })).body
  phase = 'populate-files'
  const populated = (await client.post('/' + created.name + ':populateFiles', { files: merged }, { timeout: 20000 })).body
  const upload = new URL(populated.uploadUrl)
  if (upload.origin !== 'https://upload-firebasehosting.googleapis.com') throw new Error('Unexpected Hosting upload destination')
  const uploadClient = new network.Client({ urlPrefix: upload.origin })
  phase = 'upload-owner-assets'
  for (const hash of populated.uploadRequiredHashes || []) {
    if (!compressed.has(hash)) throw new Error('Hosting requested a missing historical file; release refused')
    const uploaded = await uploadClient.request({ method: 'POST', path: upload.pathname + '/' + hash, headers: { 'Content-Type': 'application/octet-stream' }, body: compressed.get(hash), responseType: 'stream', resolveOnHTTPError: true, timeout: 30000, skipLog: { body: true, resBody: true } })
    for await (const chunk of uploaded.body) { void chunk }
    if (uploaded.status !== 200) throw new Error('Owner-page upload was not accepted')
  }
  phase = 'finalize-version'
  await client.patch('/' + created.name, { status: 'FINALIZED' }, { queryParams: { update_mask: 'status' }, timeout: 20000 })
  if ((await latest())?.version?.name !== base.version.name) throw new Error('Hosting changed during preparation; rerun the merge against the new release')
  phase = 'release-version'
  const released = (await client.post('/' + site + '/releases', { message: 'Add isolated Telegram owner controls; preserve existing dashboard files' }, { queryParams: { versionName: created.name }, timeout: 20000 })).body
  const receipt = { baseVersion: base.version.name, version: released.version?.name, oldFileCount: Object.keys(original).length, newFileCount: Object.keys(added).length, oldPathsPreserved: Object.keys(original).every(p => p.startsWith('/telegram-assets/') || p === '/telegram-settings.html' || original[p] === merged[p]), page: 'https://alphahub-f137b.web.app/telegram-settings.html', releasedAt: released.releaseTime }
  fs.mkdirSync(path.join(root, 'output/telegram-release'), { recursive: true })
  fs.writeFileSync(path.join(root, 'output/telegram-release/hosting-receipt.json'), JSON.stringify(receipt, null, 2), 'utf8')
  console.log(JSON.stringify(receipt))
}

deploy().catch(error => { console.error(JSON.stringify({ status: 'owner-page-release-failed', phase, code: typeof error.status === 'number' ? error.status : typeof error.code === 'number' ? error.code : null, detailsWithheld: true })); process.exitCode = 1 })
