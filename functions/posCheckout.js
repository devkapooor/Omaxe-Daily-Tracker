const { createHash } = require('node:crypto')
const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')

const BASE = 'posSandboxes/test'
const fail = (message, kind = 'validation', code = 'invalid-argument', extra = {}) => {
  throw new HttpsError(code, message, { checkoutRejected: true, kind, ...extra })
}
function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe whole number of at least ${minimum}.`)
  return value
}
function text(value, label, maximum = 2000) {
  if (typeof value !== 'string' || value.length > maximum) fail(`${label} is invalid.`)
  return value.trim()
}
function object(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} contains unsupported fields.`)
}
function money(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('Bill amount is too large.')
  return Number(value)
}
function percentageDiscount(subtotal, percentage) {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) fail('Discount percentage must be between 0 and 100.')
  // Decimal intent converted to an exact rational; financial arithmetic is paise.
  const [, whole, fraction = '', exponent = '0'] = String(percentage).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  const scale = fraction.length - Number(exponent)
  const numerator = BigInt(whole + fraction) * (scale < 0 ? 10n ** BigInt(-scale) : 1n)
  const divisor = 100n * (scale > 0 ? 10n ** BigInt(scale) : 1n)
  return money((BigInt(subtotal) * numerator + divisor / 2n) / divisor)
}
function normalize(input) {
  object(input, ['operationId', 'businessDate', 'lines', 'discount', 'payments', 'customerName', 'customerMobile', 'cashTenderedPaise', 'cashChangePaise'], 'Checkout')
  if (typeof input.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.operationId)) fail('A stable checkout operation ID is required.')
  if (typeof input.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) fail('Business date is invalid.')
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200) fail('A bill requires 1 to 200 lines.')
  const ids = new Set()
  const lines = input.lines.map(line => {
    object(line, ['id', 'kind', 'productId', 'barcode', 'description', 'quantity', 'unitPricePaise', 'expectedProductRevision', 'stockAtScan'], 'Line')
    if (line.kind !== 'product' || typeof line.productId !== 'string' || !line.productId || line.productId.includes('/') || line.productId.length > 200) fail('Resolve or remove every unknown product before finalizing this bill.')
    const id = text(line.id, 'Line ID', 200)
    if (!id || ids.has(id)) fail('Line IDs must be unique.')
    ids.add(id)
    return { id, kind: 'product', productId: line.productId, barcode: text(line.barcode, 'Barcode', 200), description: text(line.description, 'Description', 2000), quantity: integer(line.quantity, 'Quantity', 1), unitPricePaise: integer(line.unitPricePaise, 'Quoted price'), expectedProductRevision: integer(line.expectedProductRevision, 'Product revision', 1), ...(line.stockAtScan !== undefined ? { stockAtScan: integer(line.stockAtScan, 'Scanned stock', -Number.MAX_SAFE_INTEGER) } : {}) }
  })
  object(input.discount, ['mode', 'amountPaise', 'percentage', 'overrideReason'], 'Discount')
  if (!['none', 'percentage', 'amount'].includes(input.discount.mode)) fail('Discount mode is invalid.')
  const discount = { mode: input.discount.mode, amountPaise: integer(input.discount.amountPaise, 'Quoted discount'), ...(input.discount.mode === 'percentage' ? { percentage: input.discount.percentage } : {}), ...(input.discount.overrideReason !== undefined ? { overrideReason: text(input.discount.overrideReason, 'Discount reason') } : {}) }
  if (discount.mode !== 'percentage' && input.discount.percentage !== undefined) fail('Percentage is only valid for a percentage discount.')
  if (discount.mode === 'percentage') percentageDiscount(0, discount.percentage)
  if (!Array.isArray(input.payments) || input.payments.length === 0 || input.payments.length > 3) fail('Add one to three payment allocations.')
  const methods = new Set()
  const payments = input.payments.map(payment => {
    object(payment, ['method', 'amountPaise', 'reference'], 'Payment')
    if (!['cash', 'upi', 'card'].includes(payment.method) || methods.has(payment.method)) fail('Choose distinct supported payment methods.')
    methods.add(payment.method)
    return { method: payment.method, amountPaise: integer(payment.amountPaise, 'Payment'), ...(payment.reference !== undefined ? { reference: text(payment.reference, 'Payment reference', 500) } : {}) }
  })
  return { businessDate: input.businessDate, lines, discount, payments, ...(input.customerName !== undefined ? { customerName: text(input.customerName, 'Customer name', 500) } : {}), ...(input.customerMobile !== undefined ? { customerMobile: text(input.customerMobile, 'Customer mobile', 100) } : {}), ...(input.cashTenderedPaise !== undefined ? { cashTenderedPaise: integer(input.cashTenderedPaise, 'Cash tendered') } : {}), ...(input.cashChangePaise !== undefined ? { cashChangePaise: integer(input.cashChangePaise, 'Cash change') } : {}) }
}
function istDate(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) }
function receiptNumber(date, timestamp, sequence) {
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' }).formatToParts(new Date(timestamp))
  const part = type => parts.find(p => p.type === type)?.value || ''
  return `TNS-${date.replaceAll('-', '')}-${part('hour')}${part('minute')}${part('second')}${part('fractionalSecond')}-${String(sequence).padStart(6, '0')}`
}

function createCheckoutHandler(db, now = () => Date.now()) {
  return async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before checkout.')
    const uid = request.auth.uid
    const authTime = request.auth.token?.auth_time
    if (!Number.isSafeInteger(authTime) || authTime < 1) fail('Sign in again before checkout.', 'session', 'permission-denied')
    const intent = normalize(request.data)
    const operationId = request.data.operationId
    const intentHash = createHash('sha256').update(JSON.stringify({ uid, intent })).digest('hex')
    const billRef = db.doc(`${BASE}/bills/${operationId}`)
    return db.runTransaction(async tx => {
      const [profileSnapshot, existing] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(billRef)])
      const profile = profileSnapshot.data()
      if (!activeUser(profile) || !['owner', 'manager', 'billing'].includes(profile.role)) fail('Your account cannot finalize bills.', 'profile', 'permission-denied')
      if (existing.exists) {
        const bill = existing.data()
        if (bill.createdByUid !== uid || bill.checkout?.intentHash !== intentHash) fail('This checkout ID belongs to a different intent. Recover the original bill first.', 'intent-conflict', 'already-exists')
        // Recovery precedes stock revisions/counter checks: a committed bill is immutable.
        return bill
      }
      const nowMs = now(), timestamp = new Date(nowMs).toISOString(), date = istDate(new Date(nowMs))
      if (intent.businessDate !== date) fail('The counter business day changed. Review the cart and retry for today.', 'business-date', 'failed-precondition')
      const [year, month] = date.split('-').map(Number), start = month >= 4 ? year : year - 1
      const financialYear = `${start}-${String((start + 1) % 100).padStart(2, '0')}`
      const productIds = [...new Set(intent.lines.map(line => line.productId))]
      const configRef = db.doc(`${BASE}/configuration/checkout`), sequenceRef = db.doc(`${BASE}/sequences/${financialYear}`), ledgerRef = db.doc(`${BASE}/handover/main`), cashierRef = db.doc(`${BASE}/cashierStates/${uid}`)
      const [configSnapshot, sequenceSnapshot, ledgerSnapshot, cashierSnapshot, ...products] = await Promise.all([tx.get(configRef), tx.get(sequenceRef), tx.get(ledgerRef), tx.get(cashierRef), ...productIds.map(id => tx.get(db.doc(`${BASE}/products/${id}`)))])
      const ledger = ledgerSnapshot.data(), cashier = cashierSnapshot.data()
      if (!ledger?.initialized || ledger.counterSession?.status !== 'open' || ledger.checkpoint?.date !== date) fail('Open the shared counter with one count before billing.', 'counter', 'failed-precondition')
      const reservation = ledger.countReservation
      if (reservation && (!reservation.startedAt?.toMillis || nowMs < reservation.startedAt.toMillis() + 300000)) fail(`${reservation.name || 'A cashier'} is counting the shared drawer. Wait until the count is saved or cancelled.`, 'count-lock', 'failed-precondition')
      if (!cashier || cashier.uid !== uid || cashier.authTime !== authTime || cashier.closed !== false || cashier.joinedCounterId !== ledger.counterSession.openingReconciliationId) fail('Join the open shared counter before billing. Reconnect or retry your session.', 'membership', 'failed-precondition')
      const byId = new Map(products.map((snapshot, index) => [productIds[index], snapshot]))
      const quotedLines = intent.lines.map(line => {
        const snapshot = byId.get(line.productId), product = snapshot.data()
        if (!product) fail('Product no longer exists. Review the cart.', 'product', 'failed-precondition')
        integer(product.revision, 'Stored revision', 1); integer(product.sellingPricePaise, 'Stored price'); integer(product.currentQuantity, 'Stored stock', -Number.MAX_SAFE_INTEGER)
        if (product.revision !== line.expectedProductRevision || product.sellingPricePaise !== line.unitPricePaise) fail('Product updated since scan. Review the price and total before checkout.', 'product-changed', 'failed-precondition', { productId: line.productId, previousStock: line.stockAtScan ?? null, latestProduct: { name: product.name, sellingPricePaise: product.sellingPricePaise, currentQuantity: product.currentQuantity, revision: product.revision } })
        return { ...line, barcode: product.barcode, description: product.name, unitPricePaise: product.sellingPricePaise }
      })
      // The mounted POS already merges repeated scans. Keep new immutable bills
      // one line per SKU too: legacy return/void consumers restore per bill line.
      const merged = new Map()
      for (const line of quotedLines) {
        const previous = merged.get(line.productId)
        if (previous) previous.quantity = integer(previous.quantity + line.quantity, 'Combined quantity', 1)
        else merged.set(line.productId, { ...line })
      }
      const lines = [...merged.values()]
      const subtotalPaise = money(lines.reduce((sum, line) => sum + BigInt(line.quantity) * BigInt(line.unitPricePaise), 0n))
      const discount = { ...intent.discount }
      discount.amountPaise = discount.mode === 'none' ? 0 : discount.mode === 'percentage' ? percentageDiscount(subtotalPaise, discount.percentage) : discount.amountPaise
      if (discount.amountPaise !== intent.discount.amountPaise || discount.amountPaise > subtotalPaise) fail('Discount quote changed or is invalid. Review the total.')
      const config = configSnapshot.data(), limit = typeof config?.billingMaxDiscountPercentage === 'number' ? config.billingMaxDiscountPercentage : null
      if (limit !== null && (!Number.isFinite(limit) || limit < 0 || limit > 100)) fail('Checkout discount configuration is invalid.', 'configuration', 'failed-precondition')
      const effective = subtotalPaise === 0 ? 0 : discount.amountPaise * 100 / subtotalPaise
      if (profile.role === 'billing' && discount.amountPaise > 0 && (limit === null || effective > limit + 0.00001)) fail(limit === null ? 'Discounts are disabled for billing users until the owner configures a limit.' : `Discount exceeds the billing limit of ${limit}%.`, 'discount', 'permission-denied')
      if (profile.role !== 'billing' && limit !== null && effective > limit && !discount.overrideReason) fail('A reason is required when exceeding the configured discount limit.')
      const totalPaise = subtotalPaise - discount.amountPaise
      if (intent.payments.reduce((sum, p) => sum + BigInt(p.amountPaise), 0n) !== BigInt(totalPaise)) fail('Payment allocations must exactly equal the bill total.')
      const cashPaid = intent.payments.find(p => p.method === 'cash')?.amountPaise || 0
      const tendered = intent.cashTenderedPaise ?? cashPaid
      if (tendered < cashPaid || (cashPaid === 0 && tendered !== 0)) fail('Cash tendered is invalid for the cash allocation.')
      const change = tendered - cashPaid
      if (intent.cashChangePaise !== undefined && intent.cashChangePaise !== change) fail('Cash change does not match tendered cash and allocation.')
      const sequenceNumber = integer(sequenceSnapshot.data()?.lastNumber ?? 0, 'Receipt sequence') + 1
      integer(sequenceNumber, 'Next sequence', 1)
      const receipt = receiptNumber(date, timestamp, sequenceNumber)
      const actor = { actorUid: uid, actorName: profile.name, actorRole: profile.role }
      const bill = { id: operationId, handoverDate: date, cashierAuthTime: authTime, receiptNumber: receipt, financialYear, sequenceNumber, businessDate: date, ...(intent.customerName ? { customerName: intent.customerName } : {}), ...(intent.customerMobile ? { customerMobile: intent.customerMobile } : {}), lines, subtotalPaise, discount, totalPaise, payments: intent.payments, ...(cashPaid > 0 ? { cashTenderedPaise: tendered, cashChangePaise: change } : {}), status: 'finalized', testOnly: true, createdAt: timestamp, createdByUid: uid, createdByName: profile.name, createdByRole: profile.role, checkout: { version: 1, operationId, intentHash } }
      const dailyTotals = { ...ledger.dailyTotals }, day = { ...(dailyTotals[date] || { upi: 0, card: 0 }) }
      let cashNetPaise = integer(ledger.cashNetPaise, 'Cash ledger', -Number.MAX_SAFE_INTEGER)
      for (const payment of intent.payments) {
        if (payment.method === 'cash') cashNetPaise += payment.amountPaise
        if (payment.method === 'upi' || payment.method === 'card') day[payment.method] = integer(day[payment.method], 'Daily allocation', -Number.MAX_SAFE_INTEGER) + payment.amountPaise
      }
      integer(cashNetPaise, 'New cash ledger', -Number.MAX_SAFE_INTEGER); integer(day.upi, 'New UPI ledger', -Number.MAX_SAFE_INTEGER); integer(day.card, 'New card ledger', -Number.MAX_SAFE_INTEGER)
      dailyTotals[date] = day
      tx.create(billRef, bill)
      tx.create(db.doc(`${BASE}/billStates/${operationId}`), { billId: operationId, state: 'active', revision: 1, returnedQuantities: {}, updatedAt: timestamp, updatedByUid: uid })
      tx.set(sequenceRef, { financialYear, lastNumber: sequenceNumber, updatedAt: timestamp, updatedByUid: uid })
      tx.set(ledgerRef, { ...ledger, revision: integer(ledger.revision, 'Ledger revision') + 1, cashNetPaise, dailyTotals, lastOperation: 'bill', lastOperationId: operationId, updatedByUid: uid })
      tx.set(cashierRef, { ...cashier, needsLogoutCheck: true, lastBillId: operationId, updatedAt: timestamp })
      for (const productId of productIds) {
        const snapshot = byId.get(productId), product = snapshot.data()
        const quantity = intent.lines.filter(line => line.productId === productId).reduce((sum, line) => sum + BigInt(line.quantity), 0n)
        const delta = money(quantity), after = product.currentQuantity - delta, revision = product.revision + 1
        integer(after, 'New stock', -Number.MAX_SAFE_INTEGER); integer(revision, 'New product revision', 1)
        const movementId = `${operationId}-${productIds.indexOf(productId)}`
        tx.update(snapshot.ref, { currentQuantity: after, revision, lastMovementId: movementId, updatedAt: timestamp, updatedByUid: uid, updatedByName: profile.name })
        tx.create(db.doc(`${BASE}/stockMovements/${movementId}`), { id: movementId, productId, barcode: product.barcode, type: 'sale', quantityDelta: -delta, beforeQuantity: product.currentQuantity, afterQuantity: after, productRevisionBefore: product.revision, productRevisionAfter: revision, businessDate: date, billId: operationId, receiptNumber: receipt, createdAt: timestamp, ...actor })
      }
      tx.create(db.doc(`${BASE}/events/${operationId}`), { type: 'bill-finalized', billId: operationId, receiptNumber: receipt, businessDate: date, totalPaise, createdAt: timestamp, ...actor })
      return bill
    })
  }
}
module.exports = { createCheckoutHandler, normalize, percentageDiscount, receiptNumber, istDate }
