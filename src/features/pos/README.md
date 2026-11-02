# POS

Current navigation/authority: [Architecture](../../../docs/architecture/ARCHITECTURE.md). The approved stock files below are retained historical operational sources, locally excluded from the public index. Permanent parser/retired-import coverage uses `tests/fixtures/pos-products.synthetic.csv`. The exact original workbook-provenance test remains opt-in via `RUN_APPROVED_CATALOGUE_EVIDENCE=true`, not part of routine/full synthetic regression. Do not restore or import historical stock to run tests.

The POS product catalog is the official live inventory used by billing, goods receipts, and stock audits. Its current Firestore path is `posSandboxes/test`, a legacy compatibility path name that does not mean these are test records. It also contains real counter sales. Do not reset, move, or reclassify these records as part of a UI-label change.

Products created from an unknown barcode in billing are added to this same live catalog at zero quantity, then added to the cart as normal catalog products. This does not create a stock-in movement; stock changes only through the existing receipt, audit, sale, return, and adjustment flows.

## Historical import (retired)

Current browser/repository import rejects new CSV import attempts. The original approved import and its provenance are retained as history, not a current seed/reset/recovery command. Earlier implementation validated the 2 October workbook, used deterministic chunked writes and retained checksums; those historical facts do not authorize another import or stock rewrite. The permanent retired-import denial test uses synthetic CSV and verifies existing stock remains unchanged.

The approved source files are:

- `data/pos/omaxe-opening-stock-2026-10-02.approved.csv`
- `data/pos/omaxe-opening-stock-2026-10-02.evidence.json`

## Firestore collections

`products`, `productCosts`, `stockMovements`, `bills`, `billStates`, `heldCarts`, `approvals`, `events`, `sequences`, `configuration`, and `importRuns` are subcollections of `posSandboxes/test`.

Bills, stock movements, and events are append-only. Bill status and returned quantities live in separate revisioned `billStates` documents, so finalized receipt evidence is never edited. Costs are stored separately and remain readable by active staff under the existing Stock permissions. No sandbox-reset operation is available in the POS Admin UI or repository API.

## Stock workspace (deployed in v1.5.0)

POS now contains Billing, Dashboard and Bills. Receive Stock and Stock Audit reuse the existing workflows in the separate six-tab Stock workspace. Collection paths remain compatible; current checkout/refund/stock operations use trusted Functions, as documented in the current Architecture. Checkout-only listeners stop outside Billing; dashboard bills/refunds use complete date ranges through bounded realtime pages, and state queries use only selected bill IDs. The active billing draft survives navigation to Stock in memory and is discarded on logout/user change.

See [Stock workspace checkpoint](../../../docs/operations/STOCK_WORKSPACE_2026-10-12.md) for query limits, index requirements, historical-field limitations and remaining server-authority gaps.
