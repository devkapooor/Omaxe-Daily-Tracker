# POS (Test)

This module is an isolated barcode-billing sandbox. Every Firestore path starts at `posSandboxes/test`; it does not use production sales, cashout, cash movement, purchasing, vendor, loan, payroll, dashboard, or financial collections.

## Import

The browser accepts only the approved normalized CSV. It does not load XLSX files or add an XLSX runtime dependency. Owner import validates exactly 6,069 unique product IDs and barcodes, including 379 negative and 3,294 zero opening quantities. It writes deterministic product and protected-cost documents in 175-row chunks (350 writes), records source values and checksums, and resumes from the last completed row when the same CSV is selected again.

The approved source files are:

- `data/pos/omaxe-opening-stock-2026-10-02.approved.csv`
- `data/pos/omaxe-opening-stock-2026-10-02.evidence.json`

## Firestore collections

`products`, `productCosts`, `stockMovements`, `bills`, `billStates`, `heldCarts`, `approvals`, `events`, `sequences`, `configuration`, `importRuns`, and `resetRuns` are subcollections of `posSandboxes/test`.

Bills, stock movements, and events are append-only except for the explicit owner-only sandbox reset. Bill status and returned quantities live in separate revisioned `billStates` documents, so finalized receipt evidence is never edited. Costs are stored separately and are unreadable by billing users.

## Reset

Reset requires the exact text `RESET POS TEST SANDBOX`. It deletes only known sandbox subcollections in 200-document batches and stores progress in `resetRuns/active` until the final batch, allowing an interrupted reset to resume without touching any non-POS path.
