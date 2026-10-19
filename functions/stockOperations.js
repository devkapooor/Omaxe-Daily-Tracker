const { createHash } = require('node:crypto')
const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')

const base = 'posSandboxes/test'
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (message, code = 'failed-precondition') => { throw new HttpsError(code, message, { stockRejected: true }) }
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail('Invalid stock reference.', 'invalid-argument')
  return value
}
function text(value, label, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${label} is required and must be at most ${max} characters.`, 'invalid-argument')
  return value.trim()
}
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${label} must be a safe whole number of ${min} or more.`, 'invalid-argument')
  return value
}
function safe(value) { if (!Number.isSafeInteger(value)) fail('Stock or amount exceeds the safe integer range.'); return value }
function revision(actual, expected) {
  integer(expected, 'Expected revision', 1)
  if (actual !== expected) fail('Product stock changed, or this source revision changed. Refresh and confirm its latest values before retrying.')
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('Enter a valid business date.', 'invalid-argument')
  return value
}
const istDate = stamp => new Date(Date.parse(stamp) + 19800000).toISOString().slice(0, 10)
function object(data, keys) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !keys.includes(k))) fail('Stock request contains unsupported fields.', 'invalid-argument')
  return data
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]))
  return value
}
function createOperations(db, clock = () => new Date().toISOString()) {
  const ref = (collection, key) => db.doc(`${base}/${collection}/${id(key)}`)
  async function run(request, kind, data, roles, post) {
    if (!request.auth?.uid) fail('Sign in before changing stock.', 'unauthenticated')
    const operationId = id(data.operationId), intentHash = hash(JSON.stringify(canonical(data)))
    return db.runTransaction(async tx => {
      const profile = (await tx.get(db.doc(`users/${request.auth.uid}`))).data()
      if (!activeUser(profile) || !roles.includes(profile.role)) fail('Your account cannot perform this stock operation.', 'permission-denied')
      const actor = { id: request.auth.uid, name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : request.auth.uid, role: profile.role }
      const opRef = ref('stockOperations', operationId), saved = await tx.get(opRef)
      if (saved.exists) {
        const op = saved.data()
        if (op.actorUid !== actor.id || op.kind !== kind || op.intentHash !== intentHash) fail('This operation reference was already used for a different actor or intent.', 'already-exists')
        return op.result
      }
      const timestamp = clock(), writes = []
      let result
      try { result = await post({ tx, actor, timestamp, writes, operationId }) }
      catch (error) {
        // This transaction has checked the stable operation receipt is absent.
        // Authentication failures before that check cannot disprove an earlier
        // commit and must never discard the client's recovery reference.
        if (error instanceof HttpsError && error.details?.stockRejected) error.details = { ...error.details, stockUnposted: true }
        throw error
      }
      for (const write of writes) write()
      tx.create(opRef, { kind, actorUid: actor.id, intentHash, result, createdAt: timestamp })
      return result
    })
  }
  return { ref, run }
}
const actorFields = actor => ({ actorUid: actor.id, actorName: actor.name, actorRole: actor.role })
const updated = (actor, timestamp) => ({ updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name })
const staff = ['owner', 'manager', 'billing']
function prices(product) {
  if (product && (!Number.isSafeInteger(product.sellingPricePaise) || product.sellingPricePaise < 0)) fail('Recorded selling price is unavailable or invalid. Correct it through Current Stock before stock posting.')
  const raw = Object.entries(product?.sourceValues ?? {}).find(([k]) => k.trim().toLocaleLowerCase('en-IN') === 'printed mrp')?.[1]
  const amount = typeof raw === 'string' && raw.trim() ? Number(raw.replace(/[₹,\s]/g, '')) : NaN
  const mrpPaise = Number.isFinite(amount) && amount >= 0 && Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) : null
  return { mrpPaise, sellingPricePaise: product?.sellingPricePaise ?? 0 }
}
function priceSources(sourceValues, mrpPaise) {
  const source = Object.fromEntries(Object.entries(sourceValues ?? {}).filter(([k]) => k.trim().toLocaleLowerCase('en-IN') !== 'printed mrp'))
  if (mrpPaise !== null) source['Printed MRP'] = (mrpPaise / 100).toFixed(2)
  return source
}
function priceEvidence({ tx, writes, ref, product, after, sourceKind, sourceRecordId, movementId, actor, timestamp, reason, afterRevision }) {
  const before = prices(product)
  if (before.mrpPaise === after.mrpPaise && before.sellingPricePaise === after.sellingPricePaise) return {}
  const changeId = `price-${movementId}`
  const rawMrp = Object.entries(product.sourceValues ?? {}).find(([key]) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')?.[1]
  const record = { id: changeId, productId: product.id, barcode: product.barcode, productName: product.name, before, after, ...(before.mrpPaise === null ? { beforeRecordedValues: { mrp: rawMrp === undefined ? null : String(rawMrp), selling: String(before.sellingPricePaise) } } : {}), beforeRevision: product.revision, afterRevision, sourceKind, sourceRecordId, movementId, reason, createdAt: timestamp, actorUid: actor.id, actorName: actor.name, reviewStatus: 'pending' }
  writes.push(() => tx.create(ref('stockPriceChanges', changeId), record))
  return { lastPriceEdit: { changeId, at: timestamp, byUid: actor.id, byName: actor.name }, priceBefore: before, priceAfter: after, priceChanged: true, beforeMrpPaise: before.mrpPaise, afterMrpPaise: after.mrpPaise, beforeSellingPricePaise: before.sellingPricePaise, afterSellingPricePaise: after.sellingPricePaise }
}
const searchName = name => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
function tokens(name) {
  const words = searchName(name).split(' ').filter(w => w.length >= 2)
  return [...new Set(words.flatMap(word => Array.from(word).slice(1).map((_, i) => Array.from(word).slice(0, i + 2).join(''))))]
}
function aliases(value) {
  const barcode = text(value, 'Barcode', 160), all = [barcode]
  if (/^\d+$/.test(barcode) && (barcode.length === 12 || (barcode.length === 13 && barcode.startsWith('0')))) {
    const body = barcode.slice(0, -1); let sum = 0
    for (let i = body.length - 1, p = 0; i >= 0; i--, p++) sum += Number(body[i]) * (p % 2 === 0 ? 3 : 1)
    if ((10 - sum % 10) % 10 === Number(barcode.at(-1))) all.push(barcode.length === 12 ? `0${barcode}` : barcode.slice(1))
  }
  return all.sort()
}
async function barcodeIdentity(db, tx, writes, barcode, newProductId, timestamp) {
  const keys = aliases(barcode), matches = new Set(), controls = []
  for (const key of keys) {
    const controlRef = db.doc(`${base}/barcodeReservations/${hash(key)}`)
    const saved = await tx.get(controlRef)
    if (saved.exists) matches.add(id(saved.get('productId')))
    controls.push({ key, ref: controlRef, saved })
    const result = await tx.get(db.collection(`${base}/products`).where('barcode', '==', key).limit(2))
    result.docs.forEach(doc => matches.add(doc.id))
    if (matches.size > 1) fail('This barcode matches multiple catalogue records. Ask the owner to review it; no records were merged.')
  }
  // Resolve the final shared identity for every alias; never capture a partial lookup.
  const productId = [...matches][0] ?? newProductId
  for (const control of controls) if (!control.saved.exists) writes.push(() => tx.create(control.ref, { barcode: control.key, productId, createdAt: timestamp }))
  return productId
}
module.exports = { base, hash, canonical, fail, id, text, integer, safe, revision, date, istDate, object, createOperations, actorFields, updated, staff, prices, priceSources, priceEvidence, searchName, tokens, aliases, barcodeIdentity }
