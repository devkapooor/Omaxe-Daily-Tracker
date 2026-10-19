const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')

const basePath = 'posSandboxes/test'
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value)
const money = (value) => Number.isSafeInteger(value) && value >= 0

function createStockPriceHandlers(db, clock = () => new Date().toISOString()) {
  async function staff(transaction, uid, ownerOnly = false) {
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in before editing stock.')
    const snapshot = await transaction.get(db.doc(`users/${uid}`))
    const profile = snapshot.data()
    if (!activeUser(profile) || !['owner', 'manager', 'billing'].includes(profile.role) || (ownerOnly && profile.role !== 'owner')) {
      throw new HttpsError('permission-denied', ownerOnly ? 'Only the owner can review stock changes.' : 'Your account cannot edit stock.')
    }
    return { id: uid, name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : uid }
  }

  async function change(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before editing stock.')
    const draft = request.data ?? {}
    if (!validId(draft.productId) || !validId(draft.operationId) || !draft.operationId.startsWith('stock-price-') || !Number.isSafeInteger(draft.expectedRevision) || draft.expectedRevision < 1) {
      throw new HttpsError('invalid-argument', 'Invalid stock edit. Reopen the product and try again.')
    }
    if (!money(draft.mrpPaise) || !money(draft.sellingPricePaise)) throw new HttpsError('invalid-argument', 'Enter MRP and selling price of zero or greater, with up to two decimal places.')
    if (draft.sellingPricePaise > draft.mrpPaise) throw new HttpsError('invalid-argument', 'Selling price cannot be greater than MRP.')
    if (typeof draft.reason !== 'string' || draft.reason.trim().length < 5 || draft.reason.trim().length > 1000) throw new HttpsError('invalid-argument', 'Enter a change reason between 5 and 1000 characters.')
    const productRef = db.doc(`${basePath}/products/${draft.productId}`)
    const changeRef = db.doc(`${basePath}/stockPriceChanges/${draft.operationId}`)
    return db.runTransaction(async (transaction) => {
      const actor = await staff(transaction, request.auth.uid)
      const saved = await transaction.get(changeRef)
      const after = { mrpPaise: draft.mrpPaise, sellingPricePaise: draft.sellingPricePaise }
      const reason = draft.reason.trim()
      if (saved.exists) {
        const record = saved.data()
        if (record.actorUid !== actor.id || record.productId !== draft.productId || record.beforeRevision !== draft.expectedRevision || record.reason !== reason || record.after.mrpPaise !== after.mrpPaise || record.after.sellingPricePaise !== after.sellingPricePaise) {
          throw new HttpsError('already-exists', 'This edit reference was already used for different changes. Reopen the product.')
        }
        return record
      }
      const snapshot = await transaction.get(productRef)
      if (!snapshot.exists) throw new HttpsError('not-found', 'This product no longer exists.')
      const product = snapshot.data()
      if (product.revision !== draft.expectedRevision) throw new HttpsError('failed-precondition', 'This product changed on another terminal. Cancel editing and reopen Edit Stock to use its latest values.')
      const sourceValues = { ...(product.sourceValues ?? {}) }
      const keys = Object.keys(sourceValues).filter((key) => key.trim().toLocaleLowerCase('en-IN') === 'printed mrp')
      const mrpText = keys.length ? String(sourceValues[keys[0]]).trim() : ''
      const rawMrp = mrpText ? Number(mrpText.replace(/[₹,\s]/g, '')) : NaN
      const before = { mrpPaise: Number.isFinite(rawMrp) && rawMrp >= 0 && Number.isSafeInteger(Math.round(rawMrp * 100)) ? Math.round(rawMrp * 100) : null, sellingPricePaise: money(product.sellingPricePaise) ? product.sellingPricePaise : null }
      if (before.mrpPaise === after.mrpPaise && before.sellingPricePaise === after.sellingPricePaise) throw new HttpsError('failed-precondition', 'Change MRP or selling price before saving.')
      const timestamp = clock()
      const afterRevision = product.revision + 1
      const beforeRecordedValues = before.mrpPaise === null || before.sellingPricePaise === null ? { mrp: keys.length ? String(sourceValues[keys[0]]) : null, selling: product.sellingPricePaise === undefined ? null : String(product.sellingPricePaise) } : undefined
      const record = { id: draft.operationId, productId: draft.productId, barcode: product.barcode, productName: product.name, before, after, ...(beforeRecordedValues ? { beforeRecordedValues } : {}), beforeRevision: product.revision, afterRevision, reason, actorUid: actor.id, actorName: actor.name, createdAt: timestamp, reviewStatus: 'pending' }
      keys.forEach((key) => { delete sourceValues[key] })
      if (after.mrpPaise !== null) sourceValues['Printed MRP'] = (after.mrpPaise / 100).toFixed(2)
      const priceProvenance = { ...(product.priceProvenance ?? { mrp: null, selling: null }), ...(before.mrpPaise !== after.mrpPaise ? { mrp: `price:${record.id}` } : {}), ...(before.sellingPricePaise !== after.sellingPricePaise ? { selling: `price:${record.id}` } : {}) }
      transaction.update(productRef, { sourceValues, sellingPricePaise: after.sellingPricePaise, priceProvenance, revision: afterRevision, lastMovementId: record.id, updatedAt: timestamp, updatedByUid: actor.id, updatedByName: actor.name, lastPriceEdit: { changeId: record.id, at: timestamp, byUid: actor.id, byName: actor.name } })
      transaction.create(changeRef, record)
      transaction.create(db.doc(`${basePath}/stockMovements/${record.id}`), { id: record.id, productId: record.productId, barcode: record.barcode, type: 'stock-price-correction', quantityDelta: 0, beforeQuantity: product.currentQuantity, afterQuantity: product.currentQuantity, productRevisionBefore: product.revision, productRevisionAfter: afterRevision, beforeMrpPaise: before.mrpPaise, afterMrpPaise: after.mrpPaise, beforeSellingPricePaise: before.sellingPricePaise, afterSellingPricePaise: after.sellingPricePaise, correctionId: record.id, reason, createdAt: timestamp, actorUid: actor.id, actorName: actor.name })
      return record
    })
  }

  async function review(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before reviewing stock changes.')
    if (!validId(request.data?.id)) throw new HttpsError('invalid-argument', 'Invalid stock change reference.')
    return db.runTransaction(async (transaction) => {
      const actor = await staff(transaction, request.auth.uid, true)
      const reference = db.doc(`${basePath}/stockPriceChanges/${request.data.id}`)
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists) throw new HttpsError('not-found', 'Stock change was not found.')
      if (snapshot.data().reviewStatus === 'reviewed') return { id: reference.id, reviewStatus: 'reviewed' }
      transaction.update(reference, { reviewStatus: 'reviewed', reviewedAt: clock(), reviewedByUid: actor.id, reviewedByName: actor.name })
      return { id: reference.id, reviewStatus: 'reviewed' }
    })
  }
  return { change, review }
}

module.exports = { createStockPriceHandlers }
