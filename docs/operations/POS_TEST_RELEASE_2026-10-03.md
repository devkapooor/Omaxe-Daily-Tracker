# POS test release — 3 October 2026

Status: available for staff trials at https://alphahub-f137b.web.app.

## Release

- Firebase project and Hosting site: `alphahub-f137b`.
- Application source deployed: `28c588b`.
- Build made from an isolated archive of that commit, with local automatic sign-in disabled and local email/password omitted. The built JavaScript was checked for both local credential values; neither was present.
- Uncommitted architecture cleanup in the main workspace was excluded from the deployment.
- Firestore rules and all three product search indexes deployed. All indexes reached `READY` before the application release.
- Hosted HTML matched the tested build after deployment.

## Opening stock

- Imported through the owner's POS Admin screen using `data/pos/omaxe-opening-stock-2026-10-02.approved.csv`.
- SHA-256: `e234dae109bc90988879e5af6789d90e0b4be59bb90f93d0cffb0dbaa521a65b`.
- Import status: `completed`, 6,069/6,069 rows.
- Verified 6,069 product documents and 6,069 protected cost documents.
- Preserved 379 negative and 3,294 zero opening stock quantities.
- All POS data lives under `posSandboxes/test`.
- Billing discount limit initialized to **0%**. The owner can choose a different limit under POS (Test) → Admin.

## Verification

- 67 unit tests passed, 37 Firestore/security and repository workflow tests passed, lint passed, production build passed.
- Repository tests exercised billing checkout, split settlement, stale-stock rejection, held carts, owner-only void approval, sellable and damaged returns, discount limits, and completed-import protection against deployed rule definitions in the emulator.
- Browser workflows passed against the isolated development release and again against the public Hosting URL using the existing owner account.
- Verified barcode entry, held cart/resume without stock reservation, cash/UPI split settlement, cash change, thermal receipt generation, void request, owner approval, and stock restoration.
- Finance collection counts (`sales`, `purchases`, `cashouts`, `payments`, `cashTransfers`, `dailyCashouts`) were unchanged across each browser workflow.
- No browser console errors or page errors were recorded in either workflow.
- Verification receipts `TEST-2026-27-000001` and `TEST-2026-27-000002` were voided through the approval flow. They remain as audit evidence; the associated stock was restored and held carts were consumed.
- Browser receipt output was visually inspected. Physical barcode scanner and printer hardware were not available to this verification session.

## Start using it

1. Open the live app, refresh, and sign in with an existing owner, manager, or billing account.
2. Select **POS (Test)**.
3. Scan a barcode followed by Enter, or search by product name prefix.
4. Enter payment allocations that exactly equal the total, then select **Finalize TEST Bill**.
5. Allow pop-ups for receipt printing. Existing bills can be reprinted in 80mm or A4 format from **Bills**.
6. Submit void/return requests from **Bills**. The owner reviews these in **Action Centre**.

Receipts are test receipts, without GST/HSN or tax invoicing. POS bills do not feed production finance totals. Internet access is required to finalize a bill. Zero and negative stock do not block test billing.

The completed stock CSV cannot be imported again over current stock. Do not use the sandbox reset during ordinary trials: it deletes the POS test stock, bills, approvals, and history.
