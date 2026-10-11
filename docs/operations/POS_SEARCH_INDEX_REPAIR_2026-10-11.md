# POS Search Index Repair — 11 October 2026

## Approval and scope

The user explicitly approved: `Repair All 2,744 Products Once` after reviewing the read/write trade-off. This approval applies to a one-time search-metadata correction in Firebase project `alphahub-f137b`, collection `posSandboxes/test/products`.

The read-only audit examined 6,094 products and found 2,744 with missing or empty search tokens. The exact repair plan SHA-256 is `41c8bd067a4e65622de8a307a8a5479f254e29ddd3d8e3af08043d6f480cb23d`.

## Changes and safeguards

- Updated only `searchTokens`, generated using the application's existing `posProductSearchTokens` function.
- Applied a Firestore field mask containing only `searchTokens`; product names, barcodes, stock quantities, prices, costs, revisions and application audit timestamps were preserved. Firestore's document update time advances automatically.
- Used document update-time preconditions and checkpointed successful commits. A changed Plastic Glass record stopped its 100-product batch; refreshed that batch's name/token metadata and resumed with updated preconditions.
- Completed 2,744 unique product updates in 28 successful commits, with no repeated successful writes.
- Reused the prepared audit rather than scanning the complete catalogue again. Recovery read only the affected 100-product batch; final verification used the targeted `glass` token query.
- The repair plan, original search-token fields, refreshed batch and commit receipts are stored locally under ignored `output/pos-search-index/`. Credentials are excluded from those artifacts.

## Result

A read-only database query for `searchTokens` containing `glass` returned nine products, including active Plastic Glass, barcode `19008`, MRP `20`. Commit receipts account for every approved product. Verification time: `2026-10-10T21:18:33.136Z` (11 October in IST).

This is a live data-metadata repair; Hosting deployment is not required. Clear and retype an existing POS search to rerun it. No browser interaction or billing transaction was used for verification.

New products created through POS, GRN and CSV import already receive search tokens as part of their original product write. No full-catalogue loading or additional per-product creation writes were added to POS. This operation does not deploy the pending Current Stock UI changes.
