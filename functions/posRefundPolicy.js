const { HttpsError } = require('firebase-functions/v2/https')
const fail = (message, code = 'failed-precondition') => { throw new HttpsError(code, message, { refundRejected: true }) }
function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe whole number of at least ${minimum}.`, 'invalid-argument')
  return value
}
function safe(value) { if (!Number.isSafeInteger(value)) fail('Return value or quantity exceeds the safe integer range.'); return value }
function amount(value) { if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('Return amount exceeds the safe integer range.'); return Number(value) }
function allocateBill(bill) {
  if (!bill || !Array.isArray(bill.lines) || !bill.lines.length || bill.lines.length > 200) fail('This bill cannot be safely quoted. Preserve its source and ask the owner to review it.')
  const ids = new Set()
  const lines = bill.lines.map((line, index) => {
    if (typeof line.id !== 'string' || !line.id || ids.has(line.id)) fail('Historical bill line identities are missing or duplicated. No quantities were changed.')
    ids.add(line.id)
    if (!['product', 'temporary'].includes(line.kind)) fail('Historical bill line type is unavailable.')
    if (line.kind === 'product' && (typeof line.productId !== 'string' || !line.productId || line.productId.includes('/'))) fail('Historical mapped product identity is unavailable.')
    const quantity = integer(line.quantity, 'Billed quantity', 1), unitPricePaise = integer(line.unitPricePaise, 'Original bill price')
    return { ...line, quantity, unitPricePaise, index, grossPaise: amount(BigInt(quantity) * BigInt(unitPricePaise)) }
  })
  const subtotal = amount(lines.reduce((sum, line) => sum + BigInt(line.grossPaise), 0n))
  const discount = integer(bill.discount?.amountPaise, 'Original bill discount')
  if (subtotal !== bill.subtotalPaise || discount > subtotal || subtotal - discount !== bill.totalPaise) fail('Original bill totals do not reconcile. No historical values were repaired.')
  if (!Array.isArray(bill.payments) || bill.payments.some(p => !['cash', 'upi', 'card', 'bank-transfer'].includes(p.method) || !Number.isSafeInteger(p.amountPaise) || p.amountPaise < 0) || amount(bill.payments.reduce((n, p) => n + BigInt(p.amountPaise), 0n)) !== bill.totalPaise) fail('Original bill payment evidence does not reconcile.')
  let allocated = 0
  for (const line of lines) {
    const numerator = BigInt(discount) * BigInt(line.grossPaise)
    line.discountPaise = subtotal ? Number(numerator / BigInt(subtotal)) : 0
    line.remainder = subtotal ? numerator % BigInt(subtotal) : 0n
    allocated += line.discountPaise
  }
  const ranked = [...lines].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
  for (let i = 0; i < discount - allocated; i++) ranked[i].discountPaise++
  return lines.map(({ remainder, index, ...line }) => ({ ...line, netPaise: line.grossPaise - line.discountPaise }))
}
function valueThrough(line, quantity) { integer(quantity, 'Consumed quantity'); if (quantity > line.quantity) fail('Recorded returns exceed the billed quantity.'); return amount(BigInt(line.netPaise) * BigInt(quantity) / BigInt(line.quantity)) }
function returnedMap(lines, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Recorded return quantity evidence is unavailable.')
  const ids = new Set(lines.map(line => line.id))
  if (Object.keys(raw).some(id => !ids.has(id))) fail('Recorded returns contain an unknown bill line.')
  return Object.fromEntries(lines.map(line => {
    const qty = integer(raw[line.id] ?? 0, 'Previously returned quantity')
    if (qty > line.quantity) fail('Recorded returns exceed the billed quantity.')
    return [line.id, qty]
  }))
}
function quoteSelection(lines, returned, selection) {
  if (!Array.isArray(selection) || selection.length > 200) fail('Select at most 200 original bill lines.', 'invalid-argument')
  const byId = new Map(lines.map(line => [line.id, line])), used = new Set()
  const selected = selection.map(item => {
    if (!item || Object.keys(item).some(key => !['lineId', 'quantity'].includes(key)) || typeof item.lineId !== 'string' || used.has(item.lineId) || !byId.has(item.lineId)) fail('Select each original bill line once; unknown or duplicate lines are not allowed.', 'invalid-argument')
    used.add(item.lineId)
    const line = byId.get(item.lineId), quantity = integer(item.quantity, 'Return quantity', 1), before = returned[line.id]
    if (quantity > line.quantity - before) fail(`Return quantity exceeds the remaining billed units for ${line.description || line.id}.`)
    return { lineId: line.id, quantity, refundPaise: valueThrough(line, before + quantity) - valueThrough(line, before) }
  }).sort((a, b) => lines.findIndex(line => line.id === a.lineId) - lines.findIndex(line => line.id === b.lineId))
  return { selected, refundPaise: amount(selected.reduce((sum, item) => sum + BigInt(item.refundPaise), 0n)) }
}
module.exports = { fail, integer, safe, allocateBill, returnedMap, valueThrough, quoteSelection }
