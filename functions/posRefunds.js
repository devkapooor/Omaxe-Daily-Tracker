const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')
const { hash, canonical, istDate } = require('./stockOperations')
const p = require('./posRefundPolicy')
const BASE = 'posSandboxes/test', STAFF = ['owner', 'manager', 'billing']
const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) p.fail('Invalid return reference.', 'invalid-argument'); return value }
const text = (value, label) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) p.fail(`${label} is required (at most 1000 characters).`, 'invalid-argument'); return value.trim() }
function object(data, keys) {
  if (data?.type === 'void') p.fail('Bill cancellation (void) is retired. Use eligible item returns.', 'failed-precondition')
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !keys.includes(k))) p.fail('Return request contains unsupported fields.', 'invalid-argument')
  return data
}
function normalize(data) {
  object(data, ['billId', 'returnLines', 'returnCondition'])
  id(data.billId)
  if (!['sellable', 'damaged'].includes(data.returnCondition)) p.fail('Choose Sellable or Damaged.', 'invalid-argument')
  if (!Array.isArray(data.returnLines)) p.fail('Select original bill quantities.', 'invalid-argument')
  return { billId: data.billId, returnLines: data.returnLines, returnCondition: data.returnCondition }
}
function createPosRefundHandlers(db, clock = () => Date.now()) {
  const ref = (collection, key) => db.doc(`${BASE}/${collection}/${id(key)}`)
  async function actorFor(tx, request, roles) {
    if (!request.auth?.uid) p.fail('Sign in before returning items.', 'unauthenticated')
    const profile = (await tx.get(db.doc(`users/${request.auth.uid}`))).data()
    if (!activeUser(profile) || !roles.includes(profile.role)) p.fail('Your account cannot perform this return operation.', 'permission-denied')
    return { uid: request.auth.uid, name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : request.auth.uid, role: profile.role }
  }
  async function run(request, kind, intent, roles, write) {
    const operationId = id(intent.operationId), fingerprint = hash(JSON.stringify(canonical(intent)))
    return db.runTransaction(async tx => {
      const actor = await actorFor(tx, request, roles), operationRef = ref('refundOperations', operationId), saved = await tx.get(operationRef)
      if (saved.exists) {
        if (saved.get('actorUid') !== actor.uid || saved.get('kind') !== kind || saved.get('intentHash') !== fingerprint) p.fail('This return reference belongs to a different actor or intent. Recover the original operation.', 'already-exists')
        return saved.get('result')
      }
      const nowMs = clock(), timestamp = new Date(nowMs).toISOString(), writes = []
      let result
      try { result = await write({ tx, actor, nowMs, timestamp, writes, operationId }) }
      catch (error) { if (error instanceof HttpsError && error.details?.refundRejected) error.details = { ...error.details, refundUnposted: true }; throw error }
      writes.forEach(fn => fn())
      tx.create(operationRef, { kind, actorUid: actor.uid, intentHash: fingerprint, result, createdAt: timestamp })
      return result
    })
  }
  async function source(tx, billId) {
    const [billSnapshot, stateSnapshot, controlSnapshot] = await Promise.all([tx.get(ref('bills', billId)), tx.get(ref('billStates', billId)), tx.get(ref('refundStates', billId))])
    if (!billSnapshot.exists || !stateSnapshot.exists) p.fail('Original bill or its state is missing. No refund was posted.')
    const bill = { ...billSnapshot.data(), id: billId }, state = stateSnapshot.data()
    if (state.billId !== billId || !['active', 'partially-returned', 'voided'].includes(state.state)) p.fail('Original bill state evidence is invalid.')
    if (state.state === 'voided') p.fail('This historical bill is voided and cannot be refunded again.')
    if (!Number.isFinite(Date.parse(bill.createdAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(bill.businessDate)) p.fail('Original bill date evidence is unavailable.')
    p.integer(state.revision, 'Bill state revision', 1)
    const lines = p.allocateBill(bill), returned = p.returnedMap(lines, state.returnedQuantities), sourceHash = hash(JSON.stringify(canonical({ lines: bill.lines, subtotalPaise: bill.subtotalPaise, discount: bill.discount, totalPaise: bill.totalPaise, payments: bill.payments, createdAt: bill.createdAt, businessDate: bill.businessDate })))
    let refundedPaise = 0
    if (controlSnapshot.exists) {
      const control = controlSnapshot.data()
      if (control.policyVersion !== 1 || control.sourceHash !== sourceHash || control.stateRevision !== state.revision || JSON.stringify(canonical(control.returnedQuantities)) !== JSON.stringify(canonical(returned))) p.fail('Return controls do not reconcile with the source. Preserve history for owner review.')
      refundedPaise = p.integer(control.refundedPaise, 'Previously refunded amount')
      if (refundedPaise !== lines.reduce((sum, line) => p.safe(sum + p.valueThrough(line, returned[line.id])), 0)) p.fail('Recorded refunded value does not reconcile.')
    } else {
      // Legacy source proof is filtered and explicitly bounded. Overflow is an
      // honest compatibility blocker, never a sliced or guessed financial total.
      const [requests, events] = await Promise.all([
        tx.get(db.collection(`${BASE}/approvals`).where('billId', '==', billId).limit(201)),
        tx.get(db.collection(`${BASE}/events`).where('billId', '==', billId).where('type', '==', 'bill-return-approved').limit(201)),
      ])
      if (requests.size > 200 || events.size > 200) p.fail('This legacy bill has more than 200 source records. A separately reviewed reconciliation is required; no totals were guessed.')
      const approved = requests.docs.filter(d => d.get('status') === 'approved')
        .sort((a, b) => String(a.get('reviewedAt')).localeCompare(String(b.get('reviewedAt'))) || a.id.localeCompare(b.id))
      const consumed = p.returnedMap(lines), eventByRequest = new Map()
      for (const event of events.docs) {
        const a = event.get('approvalId')
        if (typeof a !== 'string' || eventByRequest.has(a)) p.fail('Legacy refund events are missing or duplicated. No values were repaired.')
        eventByRequest.set(a, event.data())
      }
      for (const old of approved) {
        const r = old.data(), event = eventByRequest.get(old.id)
        if (r.type !== 'return' || !['sellable', 'damaged'].includes(r.returnCondition) || !['cash', 'upi', 'card', 'bank-transfer'].includes(r.refundMethod) || !Number.isFinite(Date.parse(r.reviewedAt)) || !r.reviewedByUid || !event || event.refundAmountPaise !== r.refundAmountPaise || event.refundMethod !== r.refundMethod || event.returnCondition !== r.returnCondition || event.actorUid !== r.reviewedByUid) p.fail('Legacy return source evidence is incomplete or inconsistent.')
        const q = p.quoteSelection(lines, consumed, r.returnLines)
        if (!q.selected.length || q.refundPaise !== r.refundAmountPaise) p.fail('Legacy partial refund value is ambiguous or excessive. Preserve its original records for review.')
        q.selected.forEach(item => { consumed[item.lineId] += item.quantity })
        refundedPaise = p.safe(refundedPaise + q.refundPaise)
        eventByRequest.delete(old.id)
      }
      if (eventByRequest.size || JSON.stringify(canonical(consumed)) !== JSON.stringify(canonical(returned))) p.fail('Recorded returned quantities do not match genuine historical refund sources.')
    }
    return { bill, state, lines, returned, refundedPaise, sourceHash, stateRef: stateSnapshot.ref, controlRef: controlSnapshot.ref }
  }
  async function buildQuote(tx, input, actor, nowMs) {
    const src = await source(tx, input.billId), timestamp = new Date(nowMs).toISOString(), businessDate = istDate(timestamp)
    const selected = p.quoteSelection(src.lines, src.returned, input.returnLines)
    const productIds = input.returnCondition === 'sellable' ? [...new Set(selected.selected.map(item => src.lines.find(line => line.id === item.lineId)).filter(line => line.kind === 'product').map(line => line.productId))] : []
    const [ledgerSnapshot, cashierSnapshot, ...products] = await Promise.all([tx.get(ref('handover', 'main')), tx.get(ref('cashierStates', actor.uid)), ...productIds.map(productId => tx.get(ref('products', productId)))])
    const ledger = ledgerSnapshot.data(), cashier = cashierSnapshot.data(), productEffects = []
    for (let index = 0; index < products.length; index++) {
      const snapshot = products[index], productId = productIds[index]
      if (!snapshot.exists) p.fail('A mapped product is missing. Sellable stock cannot be restored; ask the owner to review the source.')
      const product = snapshot.data(), delta = selected.selected.reduce((sum, item) => src.lines.some(line => line.id === item.lineId && line.kind === 'product' && line.productId === productId) ? p.safe(sum + item.quantity) : sum, 0)
      p.integer(product.revision, 'Product revision', 1); p.integer(product.currentQuantity, 'Recorded stock', -Number.MAX_SAFE_INTEGER)
      productEffects.push({ productId, barcode: product.barcode ?? '', beforeQuantity: product.currentQuantity, afterQuantity: p.safe(product.currentQuantity + delta), quantityDelta: delta, revisionBefore: product.revision, revisionAfter: p.safe(product.revision + 1) })
    }
    let availableCashPaise = null
    if (ledger?.initialized && ledger.checkpoint) {
      const checkpoint = ledger.checkpoint
      p.integer(checkpoint.cashActualPaise, 'Counted drawer cash'); p.integer(checkpoint.cashNetPaise, 'Checkpoint net cash', -Number.MAX_SAFE_INTEGER); p.integer(ledger.cashNetPaise, 'Current net cash', -Number.MAX_SAFE_INTEGER)
      availableCashPaise = p.safe(Number(BigInt(checkpoint.cashActualPaise) + BigInt(ledger.cashNetPaise) - BigInt(checkpoint.cashNetPaise)))
    }
    const quote = { billId: input.billId, receiptNumber: src.bill.receiptNumber, sourceBillCreatedAt: src.bill.createdAt, sourceBillRevision: src.state.revision, businessDate, refundMethod: 'cash', refundPaise: selected.refundPaise, returnCondition: input.returnCondition, selected: selected.selected, lines: src.lines.map(line => ({ lineId: line.id, description: line.description || line.id, barcode: line.barcode || '', billedQuantity: line.quantity, returnedQuantity: src.returned[line.id], remainingQuantity: line.quantity - src.returned[line.id], unitPricePaise: line.unitPricePaise, lineNetPaise: line.netPaise })), productEffects, availableCashPaise, counterRevision: ledger?.revision ?? null, counterId: ledger?.counterSession?.openingReconciliationId ?? null }
    quote.confirmationHash = hash(JSON.stringify(canonical(quote)))
    return { quote, src, ledger, cashier, ledgerRef: ledgerSnapshot.ref, cashierRef: cashierSnapshot.ref, products }
  }
  async function quote(request) {
    const input = normalize(request.data)
    return db.runTransaction(async tx => { const actor = await actorFor(tx, request, STAFF); return (await buildQuote(tx, input, actor, clock())).quote })
  }
  async function post(request) {
    object(request.data, ['operationId', 'billId', 'returnLines', 'returnCondition', 'reason', 'refundMethod', 'refundAmountPaise', 'sourceBillRevision', 'businessDate', 'confirmationHash', 'legacyRequestId'])
    const d = request.data, input = normalize({ billId: d.billId, returnLines: d.returnLines, returnCondition: d.returnCondition }), reason = text(d.reason, 'Return reason')
    if (d.refundMethod !== 'cash') p.fail('Customer returns are Cash only.', 'invalid-argument')
    p.integer(d.refundAmountPaise, 'Displayed refund'); p.integer(d.sourceBillRevision, 'Source revision', 1)
    const intent = { ...d, ...input, reason }
    return run(request, 'post-return', intent, STAFF, async ({ tx, actor, nowMs, timestamp, writes, operationId }) => {
      const result = await buildQuote(tx, input, actor, nowMs), { quote: q, src, ledger, cashier, products } = result
      if (!q.selected.length) p.fail('Select at least one return quantity.')
      if (d.sourceBillRevision !== q.sourceBillRevision || d.businessDate !== q.businessDate || d.confirmationHash !== q.confirmationHash || d.refundAmountPaise !== q.refundPaise) p.fail('Return quote or counter changed. Refresh the quote and confirm the latest quantities and cash before paying.')
      if (!ledger?.initialized || ledger.counterSession?.status !== 'open' || ledger.checkpoint?.date !== q.businessDate || ledger.counterSession.date !== q.businessDate) p.fail('Open the current-day shared counter before completing a return.')
      const reservation = ledger.countReservation
      if (reservation && (!reservation.startedAt?.toMillis || nowMs < reservation.startedAt.toMillis() + 300000)) p.fail(`${reservation.name || 'A cashier'} is counting the shared drawer. Wait until the count is saved or cancelled.`)
      if (!cashier || cashier.uid !== actor.uid || cashier.authTime !== request.auth.token?.auth_time || cashier.closed !== false || cashier.joinedCounterId !== ledger.counterSession.openingReconciliationId) p.fail('Join the open shared counter before completing a cash return.')
      p.integer(ledger.revision, 'Counter revision', 1)
      const postedBillRevision = p.safe(src.state.revision + 1), counterRevision = p.safe(ledger.revision + 1)
      if (q.availableCashPaise < q.refundPaise) p.fail('Insufficient expected cash in the shared drawer. Complete a valid count/cash setup before paying.')
      const sourceRef = ref('approvals', operationId), eventId = `return-${hash(operationId)}`, expenseId = `pos-refund-${operationId}`, dayRef = ref('refundDays', q.businessDate)
      const [existingSource, existingEvent, expense, day, legacy] = await Promise.all([tx.get(sourceRef), tx.get(ref('events', eventId)), tx.get(db.doc(`cashouts/${expenseId}`)), tx.get(dayRef), d.legacyRequestId ? tx.get(ref('approvals', d.legacyRequestId)) : Promise.resolve(null)])
      if (existingSource.exists || existingEvent.exists || expense.exists) p.fail('Return source already exists without matching operation evidence. Preserve the reference for review.')
      if (legacy && (!legacy.exists || legacy.get('status') !== 'pending' || legacy.get('type') !== 'return' || legacy.get('billId') !== d.billId || (actor.role !== 'owner' && legacy.get('requestedByUid') !== actor.uid))) p.fail('This legacy return cannot be closed by this account. Create a fresh eligible return or ask the owner to close the old request.')
      const returned = { ...src.returned }; q.selected.forEach(item => { returned[item.lineId] += item.quantity })
      const record = { id: operationId, type: 'return', billId: d.billId, receiptNumber: src.bill.receiptNumber, sourceBillCreatedAt: src.bill.createdAt, sourceBillRevision: src.state.revision, postedBillRevision, reason, returnCondition: input.returnCondition, returnLines: q.selected.map(item => ({ lineId: item.lineId, quantity: item.quantity, refundPaise: item.refundPaise })), refundDate: q.businessDate, refundMethod: 'cash', refundAmountPaise: q.refundPaise, status: 'posted', postingMode: 'staff-immediate', ownerReviewStatus: 'pending', requestedAt: timestamp, requestedByUid: actor.uid, requestedByName: actor.name, postedAt: timestamp, postedByUid: actor.uid, postedByName: actor.name, postedByRole: actor.role, eventId, expenseId: q.refundPaise ? expenseId : null, handoverDate: q.businessDate, ...(d.legacyRequestId ? { legacyRequestId: d.legacyRequestId } : {}) }
      writes.push(() => tx.create(sourceRef, record), () => tx.update(src.stateRef, { state: 'partially-returned', revision: postedBillRevision, returnedQuantities: returned, updatedAt: timestamp, updatedByUid: actor.uid }), () => tx.set(src.controlRef, { billId: d.billId, policyVersion: 1, sourceHash: src.sourceHash, stateRevision: postedBillRevision, returnedQuantities: returned, refundedPaise: p.safe(src.refundedPaise + q.refundPaise), lastReturnId: operationId, updatedAt: timestamp }))
      for (let index = 0; index < products.length; index++) {
        const effect = q.productEffects[index], movementId = `return-${hash(`${operationId}:${effect.productId}`)}`
        writes.push(() => tx.update(products[index].ref, { currentQuantity: effect.afterQuantity, revision: effect.revisionAfter, lastMovementId: movementId, updatedAt: timestamp, updatedByUid: actor.uid, updatedByName: actor.name }), () => tx.create(ref('stockMovements', movementId), { id: movementId, type: 'sellable-return', productId: effect.productId, barcode: effect.barcode, quantityDelta: effect.quantityDelta, beforeQuantity: effect.beforeQuantity, afterQuantity: effect.afterQuantity, productRevisionBefore: effect.revisionBefore, productRevisionAfter: effect.revisionAfter, billId: d.billId, approvalId: operationId, businessDate: q.businessDate, originalBusinessDate: src.bill.businessDate, reason, createdAt: timestamp, actorUid: actor.uid, actorName: actor.name, actorRole: actor.role }))
      }
      writes.push(() => tx.create(ref('events', eventId), { id: eventId, type: 'bill-return-approved', postingMode: 'staff-immediate', stockMovementCount: q.productEffects.length, nonStockReturn: q.productEffects.length === 0, billId: d.billId, approvalId: operationId, refundDate: q.businessDate, refundAmountPaise: q.refundPaise, refundMethod: 'cash', returnCondition: input.returnCondition, expenseId: record.expenseId, createdAt: timestamp, actorUid: actor.uid, actorName: actor.name, actorRole: actor.role }))
      if (q.refundPaise) writes.push(() => tx.create(db.doc(`cashouts/${expenseId}`), { id: expenseId, storeId: 'single-store', date: q.businessDate, paidTo: src.bill.customerName?.trim() || `Customer refund ${src.bill.receiptNumber}`, amount: q.refundPaise / 100, amountPaise: q.refundPaise, category: 'POS Refund', paymentMode: 'Cash', approvedBy: '', sourceKind: 'pos-return', billId: d.billId, approvalId: operationId, eventId, postedByUid: actor.uid, postedByName: actor.name, postedByRole: actor.role, notes: `Receipt ${src.bill.receiptNumber}: ${reason}`, createdAt: timestamp, updatedAt: timestamp }))
      const dayData = day.data() ?? { revision: 0, cashRefundPaise: 0, returnCount: 0 }
      p.integer(dayData.revision, 'Refund day revision'); p.integer(dayData.cashRefundPaise, 'Recorded day refunds'); p.integer(dayData.returnCount, 'Recorded day return count')
      writes.push(() => tx.set(dayRef, { date: q.businessDate, revision: p.safe(dayData.revision + 1), cashRefundPaise: p.safe(dayData.cashRefundPaise + q.refundPaise), returnCount: p.safe(dayData.returnCount + 1), updatedAt: timestamp, lastReturnId: operationId }), () => tx.update(result.ledgerRef, { cashNetPaise: p.safe(ledger.cashNetPaise - q.refundPaise), revision: counterRevision, lastOperation: 'refund', lastOperationId: operationId, updatedByUid: actor.uid }), () => tx.update(result.cashierRef, { needsLogoutCheck: true, updatedAt: timestamp }))
      if (legacy) writes.push(() => tx.update(legacy.ref, { status: 'stale', reviewedAt: timestamp, reviewedByUid: actor.uid, reviewedByName: actor.name, reviewReason: 'Explicitly requoted and completed as a cash return.', supersededByReturnId: operationId }))
      return record
    })
  }
  async function review(request) {
    object(request.data, ['operationId', 'returnId'])
    const intent = { operationId: id(request.data.operationId), returnId: id(request.data.returnId) }
    return run(request, 'review-return', intent, ['owner'], async ({ tx, actor, timestamp, writes }) => {
      const target = ref('approvals', intent.returnId), saved = await tx.get(target)
      if (!saved.exists || saved.get('status') !== 'posted' || saved.get('postingMode') !== 'staff-immediate') p.fail('This source is not a completed staff return.')
      if (saved.get('ownerReviewStatus') === 'reviewed') return { id: saved.id, reviewedAt: saved.get('reviewedAt'), reviewedByUid: saved.get('reviewedByUid') }
      const result = { id: saved.id, reviewedAt: timestamp, reviewedByUid: actor.uid }
      writes.push(() => tx.update(target, { ownerReviewStatus: 'reviewed', reviewedAt: timestamp, reviewedByUid: actor.uid, reviewedByName: actor.name })); return result
    })
  }
  async function closeLegacy(request) {
    object(request.data, ['operationId', 'requestId', 'reason'])
    const intent = { operationId: id(request.data.operationId), requestId: id(request.data.requestId), reason: text(request.data.reason, 'Closing reason') }
    return run(request, 'close-legacy-request', intent, ['owner'], async ({ tx, actor, timestamp, writes }) => {
      const target = ref('approvals', intent.requestId), saved = await tx.get(target)
      if (!saved.exists || saved.get('status') !== 'pending' || !['return', 'void'].includes(saved.get('type'))) p.fail('This legacy request is no longer pending.')
      const result = { id: saved.id, status: 'rejected' }
      writes.push(() => tx.update(target, { status: 'rejected', reviewedAt: timestamp, reviewedByUid: actor.uid, reviewedByName: actor.name, reviewReason: intent.reason })); return result
    })
  }
  async function prepareCashout(request) {
    object(request.data, ['operationId', 'date'])
    const d = request.data
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) p.fail('Select the counter closing date.', 'invalid-argument')
    return run(request, 'prepare-cashout-refund-proof', d, STAFF, async ({ tx, actor, timestamp, operationId, writes }) => {
      const [day, ledger, latest] = await Promise.all([tx.get(ref('refundDays', d.date)), tx.get(ref('handover', 'main')), tx.get(db.collection('dailyCashouts').where('date', '==', d.date).orderBy('createdAt', 'desc').limit(1))])
      if (!day.exists || !ledger.get('initialized') || ledger.get('counterSession.status') !== 'open' || ledger.get('counterSession.date') !== d.date) p.fail('Open this date\'s shared counter before preparing its refund-aware cashout.')
      const total = p.integer(day.get('cashRefundPaise'), 'Server day refunds')
      const previous = latest.docs[0]
      const closedTotal = previous?.get('refundAccountingVersion') === 1 ? p.integer(previous.get('posRefundDayTotalPaise'), 'Previous closing refund snapshot') : 0
      if (closedTotal > total) p.fail('Previous refund closing evidence exceeds the server day total. No history was repaired.')
      let refundQuery = db.collection(`${BASE}/events`).where('refundDate', '==', d.date).orderBy('createdAt', 'desc')
      if (previous) refundQuery = refundQuery.where('createdAt', '>', previous.get('createdAt'))
      let cursor, windowRefundPaise = 0
      do {
        const page = await tx.get((cursor ? refundQuery.startAfter(cursor) : refundQuery).limit(100))
        for (const event of page.docs) if (event.get('type') === 'bill-return-approved') windowRefundPaise = p.safe(windowRefundPaise + p.integer(event.get('refundAmountPaise'), 'Recorded window refund'))
        cursor = page.size === 100 ? page.docs.at(-1) : null
      } while (cursor)
      const result = { id: operationId, actorUid: actor.uid, date: d.date, posCashRefundPaise: total - closedTotal, windowRefundPaise, posRefundDayRevision: day.get('revision'), posRefundDayTotalPaise: total, posSourceHandoverRevision: ledger.get('revision'), createdAt: timestamp }
      writes.push(() => tx.create(ref('refundCashoutQuotes', operationId), result)); return result
    })
  }
  return { quote, post, review, closeLegacy, prepareCashout }
}
module.exports = { createPosRefundHandlers }
