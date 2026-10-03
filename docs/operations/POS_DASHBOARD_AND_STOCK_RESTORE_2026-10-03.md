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
- Current committed import progress: **3,675 of 6,069 products**, status `running`. **2,394 products remain.**
- Firebase client reported `resource-exhausted: Quota exceeded` repeatedly on the next batch. Billing is disabled on the project. Further retries were stopped.

## Resume

After the daily quota resets, or after the owner enables Firebase billing, open POS (Test) → Admin and select `data/pos/omaxe-opening-stock-2026-10-02.approved.csv` again. The matching checksum resumes at row 3,675; do not reset the sandbox or delete the import record.

After completion, verify 6,069 products and costs and run a barcode checkout/void test. Full-stock restoration and that final billing verification are still pending; the dashboard release is complete.
