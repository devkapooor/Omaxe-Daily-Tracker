const s = require('./stockOperations')
function receiptPricing(lines, shortage) {
  const receivedValuePaise = lines.reduce((sum, line) => s.safe(sum + s.safe(line.quantity * line.unitCostPaise)), 0)
  if (!shortage) return { receivedValuePaise, invoiceTotalPaise: receivedValuePaise }
  s.object(shortage, ['originalInvoiceTotalPaise', 'state', 'creditNoteNumber', 'creditNoteDate', 'expectedCreditPaise'])
  const original = s.integer(shortage.originalInvoiceTotalPaise, 'Original invoice total', 1)
  if (original <= receivedValuePaise) s.fail('Original invoice must exceed received stock value when items are short.')
  if (!['pending', 'received'].includes(shortage.state)) s.fail('Choose whether the credit note is pending or received.')
  const record = { originalInvoiceTotalPaise: original, state: shortage.state, expectedCreditPaise: original - receivedValuePaise }
  if (shortage.state === 'received') {
    record.creditNoteNumber = s.text(shortage.creditNoteNumber, 'Credit note number', 160)
    record.creditNoteDate = s.date(shortage.creditNoteDate)
  }
  return { receivedValuePaise, invoiceTotalPaise: shortage.state === 'pending' ? original : receivedValuePaise, shortage: record }
}
module.exports = { receiptPricing }
