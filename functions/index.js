const { HttpsError, onCall } = require('firebase-functions/v2/https')
const { initializeApp, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { activeUser, pendingCashForUser } = require('./cashBalance')

if (getApps().length === 0) initializeApp()
const db = getFirestore()

exports.getServerTime = onCall({ region: 'asia-south1' }, (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to synchronize trusted time.')
  }
  return { serverTimeMs: Date.now() }
})

exports.createCashTransfer = onCall({ region: 'asia-south1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before recording a cash movement.')
  const actorId = request.auth.uid
  const profileSnapshot = await db.doc(`users/${actorId}`).get()
  const profile = profileSnapshot.data()
  if (!profile || !activeUser(profile) || !['owner', 'manager', 'billing'].includes(profile.role)) {
    throw new HttpsError('permission-denied', 'Your account cannot record cash movements.')
  }

  const draft = request.data || {}
  const amount = Number(draft.amount)
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    throw new HttpsError('invalid-argument', 'Enter a valid positive amount, up to two decimal places.')
  }
  if (typeof draft.reason !== 'string' || !draft.reason.trim()) {
    throw new HttpsError('invalid-argument', 'Enter cash movement notes.')
  }
  if (typeof draft.fromUserId !== 'string' || !draft.fromUserId) {
    throw new HttpsError('invalid-argument', 'Select the sender.')
  }
  if (profile.role === 'billing' && draft.fromUserId !== actorId) {
    throw new HttpsError('permission-denied', 'Billing staff can move only their own cash.')
  }
  if (!['person', 'bank'].includes(draft.toType)) {
    throw new HttpsError('invalid-argument', 'Select a valid destination.')
  }
  if (typeof draft.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    throw new HttpsError('invalid-argument', 'Enter a valid cash movement date.')
  }
  if (draft.toType === 'person' && (typeof draft.toUserId !== 'string' || draft.toUserId === draft.fromUserId)) {
    throw new HttpsError('invalid-argument', 'Choose a different person as the destination.')
  }
  if (draft.toType === 'bank' && !['bank', 'cdm'].includes(draft.bankDepositMethod)) {
    throw new HttpsError('invalid-argument', 'Select whether the cash was deposited at the bank or through a CDM machine.')
  }

  const [senderSnapshot, recipientSnapshot] = await Promise.all([
    db.doc(`users/${draft.fromUserId}`).get(),
    draft.toType === 'person' ? db.doc(`users/${draft.toUserId}`).get() : Promise.resolve(null),
  ])
  if (!senderSnapshot.exists || !activeUser(senderSnapshot.data())) {
    throw new HttpsError('failed-precondition', 'The selected sender is not an active staff member.')
  }
  if (recipientSnapshot && (!recipientSnapshot.exists || !activeUser(recipientSnapshot.data()))) {
    throw new HttpsError('failed-precondition', 'The selected recipient is not an active staff member.')
  }

  const id = typeof draft.operationId === 'string' && /^cash-transfer-[0-9a-f-]{36}$/.test(draft.operationId)
    ? draft.operationId
    : null
  if (!id) throw new HttpsError('invalid-argument', 'Cash movement request is missing a valid operation id. Refresh and try again.')
  const createdAt = new Date().toISOString()
  const controlRef = db.doc('cashMovementControl/main')
  const transferRef = db.doc(`cashTransfers/${id}`)
  const payload = {
    id,
    date: typeof draft.date === 'string' ? draft.date : new Date().toISOString().slice(0, 10),
    fromUserId: draft.fromUserId,
    toType: draft.toType,
    ...(draft.toType === 'person' ? { toUserId: draft.toUserId } : { bankDepositMethod: draft.bankDepositMethod }),
    amount,
    reason: draft.reason.trim(),
    createdBy: profile.name,
    recordType: draft.toType === 'bank' ? 'bank-transfer' : 'cash-movement',
    createdAt,
  }

  await db.runTransaction(async (transaction) => {
    const transferSnapshot = await transaction.get(transferRef)
    if (transferSnapshot.exists) return
    const controlSnapshot = await transaction.get(controlRef)
    // The shared control document serializes transfers, while the server reads
    // canonical cashouts and transfers only after acquiring that transaction lock.
    const [usersSnapshot, cashoutsSnapshot, transfersSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('dailyCashouts').get(),
      db.collection('cashTransfers').get(),
    ])
    const users = usersSnapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
    const cashouts = cashoutsSnapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
    const transfers = transfersSnapshot.docs.map((item) => ({ id: item.id, data: item.data() }))
    const available = pendingCashForUser(draft.fromUserId, users, cashouts, transfers)
    if (Math.round(available * 100) < Math.round(amount * 100)) {
      throw new HttpsError('failed-precondition', `Transfer blocked. ${profile.name} has only ₹${Math.max(available, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available.`)
    }

    transaction.create(transferRef, payload)
    transaction.set(controlRef, {
      revision: (controlSnapshot.exists ? Number(controlSnapshot.get('revision') || 0) : 0) + 1,
      lastOperation: 'cash-transfer',
      lastOperationId: id,
      updatedAt: createdAt,
    })
  })

  return { id, createdAt }
})
