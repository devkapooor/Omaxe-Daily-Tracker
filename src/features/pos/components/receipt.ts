import type { PosBill } from '../domain/types'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)
const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function printPosReceipt(bill: PosBill, format: 'thermal' | 'a4') {
  const width = format === 'thermal' ? '80mm' : '210mm'
  const rows = bill.lines.map((line) => `<tr><td>${escapeHtml(line.description)}${line.kind === 'temporary' ? ' <b>[UNRESOLVED]</b>' : ''}<br><small>${escapeHtml(line.barcode)}</small></td><td>${line.quantity}</td><td>${money(line.unitPricePaise)}</td><td>${money(line.unitPricePaise * line.quantity)}</td></tr>`).join('')
  const payments = bill.payments.map((payment) => `<li>${escapeHtml(payment.method.toUpperCase())}: ${money(payment.amountPaise)}${payment.reference ? ` (${escapeHtml(payment.reference)})` : ''}</li>`).join('')
  const popup = window.open('', '_blank', 'width=900,height=800')
  if (!popup) throw new Error('Allow pop-ups to print the receipt.')
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(bill.receiptNumber)}</title><style>
    @page{size:${format === 'thermal' ? '80mm auto' : 'A4'};margin:${format === 'thermal' ? '4mm' : '14mm'}}
    body{font:12px system-ui,sans-serif;color:#000;margin:0 auto;width:${width};max-width:100%;box-sizing:border-box;padding:${format === 'thermal' ? '0' : '8mm'}}
    h1{text-align:center;font-size:${format === 'thermal' ? '16px' : '24px'};margin:0 0 8px;border:3px solid #000;padding:6px}h2{text-align:center;margin:4px 0;font-size:15px}
    table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #999;padding:5px 2px;text-align:right}th:first-child,td:first-child{text-align:left}.totals{text-align:right;font-size:14px}.warning{text-align:center;font-weight:900;margin-top:12px}
  </style></head><body><h1>SALES RECEIPT</h1><h2>POS Receipt</h2><p><b>${escapeHtml(bill.receiptNumber)}</b><br>Date: ${escapeHtml(bill.businessDate)}<br>Operator: ${escapeHtml(bill.createdByName)}</p>${bill.customerName ? `<p>Customer: ${escapeHtml(bill.customerName)}${bill.customerMobile ? ` · ${escapeHtml(bill.customerMobile)}` : ''}</p>` : ''}<table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totals">Subtotal: ${money(bill.subtotalPaise)}<br>Discount: ${money(bill.discount.amountPaise)}<br><b>Total: ${money(bill.totalPaise)}</b></div><ul>${payments}</ul>${bill.cashChangePaise ? `<p>Cash change: ${money(bill.cashChangePaise)}</p>` : ''}<p class="warning">RECEIPT ONLY · GST/HSN DETAILS NOT SHOWN · NOT A TAX INVOICE</p><script>window.onload=()=>{window.print();window.close()}</script></body></html>`)
  popup.document.close()
}
