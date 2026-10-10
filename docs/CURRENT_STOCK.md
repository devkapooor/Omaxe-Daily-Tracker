# Current Stock

The Current Stock menu is available to owner, manager and billing accounts. All roles can view every field, including the latest recorded cost price. This page has no write actions; GRN and Stock Audit continue to own their correction workflows.

## Data and reads

- Products and latest unit costs come from the existing `posSandboxes/test/products` and `productCosts` collections used by POS.
- Full collection listeners are mounted only while Current Stock is open and removed on exit. Opening the page initially reads the complete catalogue and cost collection. Pagination is a presentation limit of 50 products, not a Firestore read limit.
- This complete dataset makes arbitrary combined filters, case and whitespace grouping, price sorting, counts and quantity totals accurate beyond the existing 200-product POS search limit.
- Selecting a product mounts a listener for that product's recorded stock movements, sorted newest first and displayed 50 at a time. Closing details removes it. Existing movement records without a timestamp remain visible.
- Existing staff read rules cover all three collections. No new index, service or rules change is required.

## Field interpretation

- MRP is the current `Printed MRP` value in `sourceValues`. Original workbook evidence is never used to resurrect a cleared current MRP.
- Opening Quantity and Subcategory are read from the imported source fields when available. Products created later may have no opening quantity.
- Cost Price comes from `productCosts`, not the old imported cost, and is the latest recorded unit cost rather than a weighted average.
- Last Updated includes a later cost-record update when applicable.
- Missing values show Not Recorded; zero remains zero. Negative current quantity is highlighted.

## Display, search and filters

- Title Case and whitespace cleanup apply to presentation only. Barcode and Product ID remain exact. Acronyms, deliberate mixed case names and measurement units are retained.
- Facet options merge case and whitespace variants without changing source records. Category, Subcategory, Brand, Vendor, stock status, quantity range and product status combine.
- Search accepts product text and identifiers. An exact barcode or ID takes priority; numeric barcode input has no partial matching and retains leading zeros.
- Active products are the default; zero and negative stock remain included. Clear Filters restores that default.
- Mobile shows product summaries with all fields available in details; desktop shows the full table with horizontal scrolling.

This feature is included in the approved v1.1.0 release. See [release scope and validation](operations/VERSION_LOG.md).
