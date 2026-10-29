# Operations workspace revision — 30 October 2026

## Implemented locally

- **Handover review:** compact single-view dialog with denominations, payment comparison, staff note, and review action. The handover detail body has no scroll container.
- **Stock navigation:** removed the duplicate Audit History tab from Stock. Stock Audits remain available from Logs.
- **Receive Stock drafts:** searchable compact draft selector, resume, delete with confirmation, and clear/close behavior that keeps a saved draft. The GRN History Draft filter now defaults to all dates; optional date filtering uses last-saved time. Removed the exact invoice filter. Replacement and rejected-goods linked GRNs cannot use the ordinary reversal control.
- **Vendor invoices:** searchable by vendor or supplier invoice number, inclusive invoice-date range, sorting by vendor/date/invoice total/amount due in both directions, and one-line payment and GRN actions.
- **Scanned Vendor Returns:** select a vendor, scan existing products, enter quantities, and use the original submitted GRN cost. Drafts do not post stock or payable. Confirmed dispatch deducts current stock once. An owner-recorded credit note adjusts invoice/payable balances once without a second stock change. Replacements and physically returned rejected goods are received through linked zero-payable GRNs. Physical rejected-goods receipt restores stock and releases the original GRN return capacity. Legacy returns keep their original workflow.

## Numbered business references

Each type has a separate, shared, permanent sequence. Values use the confirmed format, for example `GRN0001`, then `GRN0002`; sequences expand past 9999, do not reset by date, and do not reuse deleted source numbers. Draft and submitted states retain the same source reference. References live in a server-only registry; Firestore document IDs and existing financial documents are not rewritten. References for existing records are assigned on first authorized display. The callable validates that each source exists and that the staff member may view it. Supplier invoice numbers and product barcodes remain unchanged.

| Prefix | Record type |
| --- | --- |
| `GRN` | Goods receipt |
| `AUDIT` | Stock audit batch |
| `PRODUCT` | Product |
| `VENDOR` | Vendor |
| `PARTY` | Saved party name |
| `HANDOVER` | Cashier handover |
| `PURCHASE` | Vendor purchase/invoice record |
| `PAYMENT` | Vendor payment |
| `RETURN` | Vendor return |
| `REFUND` | POS refund event |
| `EXPENSE` | Cash expense |
| `CASHOUT` | Daily cashout |
| `TRANSFER` | Cash transfer |
| `LOAN` | Loan |
| `REPAYMENT` | Loan repayment |
| `REQUEST` | POS/action request |
| `PAYCORR` | Vendor payment correction |
| `CASHCORR` | Cashout correction |
| `OPENCORR` | Vendor opening-balance correction |
| `MOVEMENT` | Stock movement |
| `REVERSAL` | Financial/stock reversal |
| `PRICE` | Stock price change |

Direct client writes to the reference registry and counter are denied by the Firestore fallback rules. Counters are allocated inside transactions. Read permission follows each source record, including owner-only loan details and requester/owner-only sensitive requests.

## Verification

- `npm run build` — passed (Vite reported the existing large-main-chunk advisory).
- Frontend and Firestore rules tests — 176 passed across 35 files.
- Node 22 isolated finance, stock, cash return, price, GRN/vendor, and reference/return suites — 107 passed across 7 suites after the final rejected-goods and GRN-reversal cases.
- `firestore.indexes.json` parses; added GRN draft updated-time and vendor/status lookup indexes.
- Emulator work used loopback only and dedicated `demo-*` projects. No production records were read or changed for mutation testing.

## Release state

These edits are local and ready for review. No deploy, commit, or push was performed. Deploying Hosting/Functions and the Firestore indexes remains a separate release action.
