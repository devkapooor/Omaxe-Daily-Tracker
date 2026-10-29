# Receive Stock product margin

Implemented 2026-10-27 in `PosGoodsReceipt.tsx` at the user's request.

Each received-product row shows Margin beside Selling price: percentage on the
first line and the rupee difference per unit below it. Values update as draft
cost or selling price changes, including automatic selling-price updates from
MRP edits. The formula matches Current Stock:

`Margin % = (selling price − unit cost) ÷ selling price × 100`

For example, cost 80 and selling price 100 gives 20% and 20 per unit. This is the
gross difference between the entered prices, not markup on cost or a tax/overhead
calculation. Quantity does not change the unit margin. Negative margins show in
red. Missing/invalid inputs, nonpositive cost, or zero selling price show a dash.

The table retains its previous 1080px minimum width and scrolls within the table
on phones. No extra catalog reads, stored margin field, posting calculation,
price validation, posting operation, permission or history record is introduced.

Verification passed:

- TypeScript and focused ESLint; isolated production build (existing chunk-size
  warning remains).
- Actual Receive Stock component with isolated repositories: 11 assertions for
  the 80/100 example, per-unit difference, cost/selling/MRP edits, quantity
  independence, negative/break-even margin, and blank/invalid/zero inputs.
- Mobile viewport 390px: page fits; margin remains available within the existing
  horizontally scrolling table.
- Production candidate sign-in smoke check: expected main bundle and zero page
  runtime errors before release.

Preview: `output/playwright/receive-margin-desktop.png`. Test product and costs
were synthetic; production receipt creation/submission was not exercised.

The release source extends the previous isolated source with only
`PosGoodsReceipt.tsx` changed in this revision, retaining the compact POS shortcuts.
Hosting files other than `/index.html` keep their existing hashes, with new
main JS/CSS added. Existing Telegram owner controls are preserved. Release and
verification receipts are saved under ignored `output/receive-margin/`.

Published version: `sites/alphahub-f137b/versions/4da45204a8891e65`,
`2026-10-27T09:42:32.538Z`. The live HTML, JS and CSS returned HTTP 200 with
matching SHA-256 hashes; the new main bundle is `/assets/index-QxkPIC2P.js`.
The published sign-in screen rendered with zero page runtime errors and the
Telegram controls still returned HTTP 200. Production verification was read-only;
the authenticated receipt workflow still needs ordinary user acceptance.
