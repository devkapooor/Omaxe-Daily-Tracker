# POS

The POS product catalog is the official live inventory used by billing, goods receipts, and stock audits. Its current Firestore path is `posSandboxes/test`, a legacy compatibility path name that does not mean these are test records. It also contains real counter sales. Do not reset, move, or reclassify these records as part of a UI-label change.

Products created from an unknown barcode in billing are added to this same live catalog at zero quantity, then added to the cart as normal catalog products. This does not create a stock-in movement; stock changes only through the existing receipt, audit, sale, return, and adjustment flows.

## Import

The browser accepts only the approved normalized CSV. It does not load XLSX files or add an XLSX runtime dependency. Owner import validates exactly 6,069 unique product IDs and barcodes, including 379 negative and 3,294 zero opening quantities. It writes deterministic product and protected-cost documents in 175-row chunks (350 writes), records source values and checksums, and resumes from the last completed row when the same CSV is selected again.

A completed import cannot be repeated: selecting the same CSV again preserves current stock and reports that it was already imported.

The approved source files are:

- `data/pos/omaxe-opening-stock-2026-10-02.approved.csv`
- `data/pos/omaxe-opening-stock-2026-10-02.evidence.json`

## Firestore collections

`products`, `productCosts`, `stockMovements`, `bills`, `billStates`, `heldCarts`, `approvals`, `events`, `sequences`, `configuration`, and `importRuns` are subcollections of `posSandboxes/test`.

Bills, stock movements, and events are append-only. Bill status and returned quantities live in separate revisioned `billStates` documents, so finalized receipt evidence is never edited. Costs are stored separately and are unreadable by billing users. No sandbox-reset operation is available in the POS Admin UI or repository API.
