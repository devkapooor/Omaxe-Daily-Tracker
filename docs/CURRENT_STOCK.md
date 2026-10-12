# Current Stock in the Stock workspace

Current Stock is the first of four Stock tabs, alongside Receive Stock, Stock Audit and Stock History. All active owner, manager and billing accounts can view recorded quantities/prices/costs and use the direct row Edit action. MRP and selling price edits require a reason, update current stock through the existing authenticated server function, record the last editor and create an owner Action Centre review record. Selling price must not exceed MRP. Quantity is read-only here; physical changes use Stock Audit.

The workspace was implemented after `APPROVE IMPLEMENTATION`, visually accepted by the user, and deployed in v1.5.0 on 2026-10-12 after separate explicit authorization. See [scope, role matrix, queries, history, indexes and validation](operations/STOCK_WORKSPACE_2026-10-12.md). Earlier v1.1–v1.4 releases remain historical entries in [Version Log](operations/VERSION_LOG.md).

## Loading and filtering

- Opening Current Stock without a filter sends no product/cost catalogue request. Choose an exact barcode, name prefix, exact recorded vendor or stock status.
- Matching products use Firestore cursor pages of 50 with explicit order and document-ID tie-breaker. Latest costs are fetched for only the returned IDs, in groups of at most 30. No complete catalogue download or local slice simulates server pagination.
- Barcode preserves leading zeros. Name prefix uses existing normalized `searchName`; unrestricted substring search is not supported. Vendor matching is exact and case sensitive; aliases are not grouped by downloading the catalogue.
- Product name, barcode, quantity and selling price orders use supported server queries. Name-prefix and nonzero quantity-range filters constrain the effective server order, which is displayed. MRP, cost and margin sorts explicitly apply only to the loaded page.
- All active/inactive products remain eligible, as in the existing Current Stock view. Status in details still controls existing billing/receipt behavior.
- Filters reset pagination. Pending inputs hide stale rows. Loading, empty, error and Retry states are explicit. Refresh resets to the first page and reads from the server; returning to the tab also fetches afresh. Snapshot time explains freshness between refreshes.

## Product details and history

Selecting a row or its direct Edit button loads fresh product and cost document listeners. They stop when the popup closes. The editor preserves the before-state/revision for conflict checking. Other-terminal changes remain visible in the open details; an interrupted save can retry its existing operation ID.

Recorded Movement History is collapsed initially. Expanding mounts the same bounded history pager as Stock History; collapsing or closing unmounts it. Dated history excludes missing timestamps. The explicitly labelled undated legacy view requires an exact product ID and scans bounded product-specific pages. Source records are fetched only when opened. Missing historical actor, reason, price or barcode values are displayed honestly. Nothing is backfilled.

## Field interpretation

- Current MRP comes from current `Printed MRP` sourceValues evidence, not an old workbook fallback.
- Opening quantity and subcategory use existing imported fields when recorded. Later-created products can have no opening quantity.
- Cost is the latest recorded unit cost, not a weighted average. Existing GRN reversal can clear its own latest cost; a missing cost is shown as Not Recorded.
- Margin is `(Selling Price - Cost Price) / Selling Price * 100`, before discounts and expenses. Missing cost is Not Recorded; zero selling price is Not Applicable. It is derived for display and not a stock-wide total.
- Last Updated includes the later cost update when recorded. Dedicated last-price-edit attribution survives subsequent stock movements. Zero remains zero and negative quantities are highlighted.
- Presentation title case does not rewrite source values. Details retain all available fields. The table scrolls inside its container; row Edit remains reachable at the right edge.

## Operational boundaries

The live catalogue remains under `posSandboxes/test`; that legacy name does not make its production records disposable. Page views do not post stock/financial writes. Price edits/review retain server authority; existing GRN/audit/checkout/return browser transactions and their Rules remain, with the retired GRN correction path denied. A financial posting migration requires separate scope and approval.
