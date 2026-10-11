# Current Stock price edits — 2026-10-12

Status: implemented and validated locally; not deployed. This checkpoint covers the user's stock editing, attribution, owner review, direct row Edit, lazy movement history, and selling-price ceiling requests.

## Behavior

- Every Current Stock row has an Edit button that opens the product popup directly in editing mode. The product name still opens details. The action remains visible while the table scrolls horizontally.
- All active staff, including billing, can edit MRP and selling price. Other product details remain visible. A change reason is required.
- MRP is required when saving. Both prices use nonnegative integer paise; selling price must be at or below MRP, including when MRP is reduced. Equality and zero prices are allowed. Validation runs in the editor and in the authenticated server function.
- Saving changes the current product immediately and records before/after prices, actor, time, reason, and revisions. A dedicated `lastPriceEdit` field preserves manual price attribution across later sales and stock updates.
- The owner receives an Action Centre entry labeled Applied / Awaiting Review. Mark Reviewed acknowledges the already applied change and moves it into paginated history. Reviewing does not reapply prices or undo a subsequent correction.
- Recorded Movement History is initially collapsed. Its component and Firestore listener start only when opened and stop when collapsed or when the popup closes.

## Posting and history safeguards

`changeStockPrices` checks the authenticated user's current profile inside the server transaction, checks the product revision, and atomically updates the product and creates one price-change record plus a zero-quantity movement. It ignores client-supplied actor identity. Stable operation IDs support retries after interrupted saves without restoring prices over a newer edit. Stale edits and no-op saves fail without writing evidence.

`reviewStockPriceChange` is owner-only and idempotent. The new `stockPriceChanges` collection permits owner reads and denies all direct client writes. Generic product metadata writes can no longer change selling price or forge last-price-editor attribution. Existing movement-validated GRN and stock audit write paths remain available.

No migration or automated production correction was performed. Quantity, cost records, past bills, GRNs, vendor payables, and financial history are unchanged by a stock price edit. Historical price values can remain absent or incorrect until an authorized staff member makes a deliberate correction.

## Read and write usage

Collapsed movement history performs no movement query. Opening it still reads the selected product's recorded movements using the existing repository query; its displayed page size of 50 is not server pagination. Reopening creates a new listener and may cause further reads.

The owner price feed queries only pending price-change records, while reviewed records use the existing cursor-based Action Centre history pager. Each successful edit adds three writes (product, change evidence, movement). An acknowledgement adds one review write. These audit writes are deliberate, not page-view writes.

The proposed filter-first catalogue loading and server-side stock pagination are still outstanding. Current Stock continues to subscribe to the complete products and productCosts collections. Hiding rows until a filter is chosen would not reduce those reads.

## Validation

- Production build and focused source ESLint passed; `git diff --check` passed.
- 11 server transaction tests passed in `demo-stock-prices`: all three roles, authentication and disabled accounts, validation, stale and concurrent edits, idempotent retries, protected historical records, owner review, missing MRP rejection, selling above MRP rejection, equality and zero prices.
- 4 Firestore Rules tests passed in the isolated Rules project: owner reads, staff/disabled/anonymous audit denial, direct evidence writes denied, generic price/attribution bypass denied.
- 9 focused source tests passed across price input/review mapping and existing Action Centre domains.
- 8 existing POS repository regression tests passed for GRN, physical stock audit, and unknown-barcode workflows; 16 unrelated cases were intentionally skipped.
- Desktop and phone-width UI checks used synthetic repository data: direct row Edit, invalid-price error, valid save with current values and last editor, owner before/after review, and movement listener start/stop on expand/collapse. All price-save/review test writes were synthetic or emulator-only. No production records were changed.
- Follow-up visual fix: the price fieldset aligns children at the top so the MRP helper text cannot stretch and vertically displace the selling price input. Focused ESLint and a desktop browser check passed after this layout-only change.

## Release requirements

Deployment requires the new `functions:changeStockPrices` and `functions:reviewStockPriceChange` in `asia-south1`, followed by Firestore Rules and Hosting. Deploy the server functions before exposing the editor and the tighter Rules before the dependent Hosting build. No new composite index or Firebase service is required. The project already uses Cloud Functions on Blaze.

The local app can display the editor before release, but real saves depend on deploying the new callable functions. Production callable integration and owner/staff acceptance remain due after release; local handler tests do not assert production deployment. Installed-app caching repair remains deferred at the user's request.
