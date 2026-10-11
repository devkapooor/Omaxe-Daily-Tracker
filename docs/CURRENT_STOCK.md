# Current Stock

The Current Stock menu is available to owner, manager and billing accounts. All roles can view every field, including the latest recorded cost price. This page has no write actions; GRN and Stock Audit continue to own their correction workflows.

## Data and reads

- Products and latest unit costs come from the existing `posSandboxes/test/products` and `productCosts` collections used by POS.
- Full collection listeners are mounted only while Current Stock is open and removed on exit. Opening the page initially reads the complete catalogue and cost collection. Pagination is a presentation limit of 50 products, not a Firestore read limit.
- This complete dataset supports combined filters, case and whitespace grouping and table sorting beyond the existing 200-product POS search limit. The page does not display stock metrics or quantity totals.
- Selecting a product mounts a listener for that product's recorded stock movements, sorted newest first and displayed 50 at a time. Closing details removes it. Existing movement records without a timestamp remain visible.
- Existing staff read rules cover all three collections. No new index, service or rules change is required.

## Field interpretation

- MRP is the current `Printed MRP` value in `sourceValues`. Original workbook evidence is never used to resurrect a cleared current MRP.
- Opening Quantity and Subcategory are read from the imported source fields when available. Products created later may have no opening quantity.
- Cost Price comes from `productCosts`, not the old imported cost, and is the latest recorded unit cost rather than a weighted average.
- Margin (%) is derived from `(Selling Price - Cost Price) / Selling Price * 100` using the current selling price and latest recorded cost. It updates with those values and is not persisted as a separate source field. This is the current gross margin before bill discounts and operating expenses, not historical realised profit. Missing cost shows Not Recorded; zero selling price shows Not Applicable. Recorded zero cost gives 100% margin when selling price is positive; negative margins are highlighted in the table.
- Last Updated includes a later cost-record update when applicable.
- Missing values show Not Recorded; zero remains zero. Negative current quantity is highlighted.

## Display, search and filters

- Title Case and whitespace cleanup apply to presentation only. Barcode and Product ID remain exact. Acronyms, deliberate mixed case names and measurement units are retained.
- Vendor options merge case and whitespace variants without changing source records. Vendor and stock status combine. Product Status, Category, Subcategory, Brand and quantity-range filters are not shown.
- Search accepts typed, pasted or scanned barcodes and matches the complete barcode after trimming surrounding whitespace. Leading zeros are retained; product names and IDs are not searched.
- All products are shown regardless of active/inactive status; zero and negative stock remain included. Clear Filters restores that default. Product Status remains visible in product details and continues to control existing POS workflows.
- The page header and second filter bar remain fixed within the app workspace. Only the data area scrolls; desktop table headings stay visible and pagination stays beneath the data area.
- The table shows Barcode first, followed by Product Name, Current Quantity, MRP, Selling Price, Cost Price and Margin (%). Each column heading controls sorting. Narrow screens scroll horizontally within the table; all recorded fields remain available in details.

Current Stock was introduced in v1.1.0. The display, filter and margin upgrades described here were committed as `6618e27` and deployed in v1.2.0 on 2026-10-11. See [release scope and validation](operations/VERSION_LOG.md).
