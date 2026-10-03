# POS dashboard and stock restore — 3 October 2026

Dashboard release: `21a65d1`, deployed to https://alphahub-f137b.web.app.

## Completed

- Added a separate Dashboard tab inside POS (Test), with Today, This month and custom date ranges.
- Displays total sales, approved refunds, net collections, bill count, split bill count, discounts and voided bill totals.
- Payment table shows Cash, UPI, Card and Bank Transfer collections, refunds and net amounts.
- Uses all bills in the selected period, independent of the Bills screen's latest-50 display limit.
- Excludes voided receipts; splits are counted by allocation, without including cash change. Refunds are recorded against their refund date and method.
- Verified 80 unit tests, lint, build, and desktop/mobile live browser rendering. Live totals matched Firestore: 3 active bills, ₹390.00 sales, no refunds at verification time.
- Main finance data and dashboard remain separate from POS.

## Stock restoration

- Interrupted reset had deleted all products and 600 cost documents, and had stopped at collection index 1 with 6,669 deleted documents.
- Archived its stale active marker under `posSandboxes/test/resetRuns/interrupted-*`, with cancellation reason and timestamp. Remaining bill and audit records were preserved.
- Archived the previous completed import record under `posSandboxes/test/importRuns/<checksum>-before-restore-*`, then restarted the approved CSV import through the live owner's Admin screen.
- Approved checksum: `e234dae109bc90988879e5af6789d90e0b4be59bb90f93d0cffb0dbaa521a65b`.
- Initial restore paused at 3,675 products after Firebase reported `resource-exhausted: Quota exceeded` on the free plan.
- After the owner upgraded to Blaze, confirmed project billing enabled and resumed the same import without resetting any data. Final verified counts: **6,069 products and 6,069 cost documents**, import status `completed`. Opening quantities include 379 negative and 3,294 zero-stock items, matching the approved CSV.

## Resume

Restoration is complete. Do not reset the sandbox or reimport the completed CSV.

Live barcode verification passed using barcode `4005292651707` and receipt `TEST-2026-27-000006`: scanning, automatic payment selection, cash change, held-cart resume, split payment, receipt creation, stock decrement, void approval and stock restoration. Main finance collection counts were unchanged and no browser errors occurred. The verification bill was voided.

POS (Test) is ready for sandbox barcode billing at https://alphahub-f137b.web.app. It remains test-only and does not issue production tax invoices or write production sales/finance records.
