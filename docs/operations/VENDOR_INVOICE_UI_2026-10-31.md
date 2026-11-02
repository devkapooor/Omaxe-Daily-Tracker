# Vendor reset card and invoice presentation - 31 October 2026

Status: deployed and verified at `2026-10-31T18:07:27.035Z` after explicit Hosting deployment authorization. Hosting version: `sites/alphahub-f137b/versions/33e0b5f3e6475e95`.

## Changes

- Completed vendor balance cutover controls return no card once the saved `balanceCutoverId` exists. The pre-reset owner confirmation workflow and the saved reset record remain intact.
- Invoices use a compact native table with right-aligned amounts and one filter toolbar. Current period is the default; Before reset and All invoices retain historical access. Existing vendor/invoice search, date bounds and sorting remain available.
- Historical classification uses recorded cutover flags, not invoice dates or a zero balance. An old and new invoice can have the same invoice date. Historical payment actions stay disabled. Unknown historical payments are not inferred from a reset-to-zero current balance.
- Before reset shows the recorded balance at reset; All invoices uses a Historical badge and no current due for those rows. The history explanation appears once. Current payment and invoice/GRN details actions retain their separate routes.
- The invoice details label now says Invoice total, accurately describing the immutable invoice amount rather than implying current payable.
- Phone filters stay within the viewport; the table has its own horizontal scrolling. Light/dark desktop and phone previews are retained.

## Validation

- 10 invoice filter/sort domain tests passed, including same-date current/history separation and source-array preservation.
- Source lint and focused drill lint passed. Production build passed. Existing fast-refresh and bundle-size warnings remain.
- Browser ENV-01 passed. Final VEN-11 passed with real emulator Auth/Rules and read-only UI actions over synthetic fixtures: reset notice removal persists after reload, historical payment is disabled, current payment opens Register, details/GRN links work, desktop light/dark and phone controls are visible, and config/purchase/invoice/account snapshots remain unchanged.
- Earlier failed attempts remain retained. Two initial assertions used the wrong display format or accessible button name; another attempted unnecessary navigation after reload and selected an off-screen background navigation element. The test now uses actual formatting/accessibility and the already visible workspace. These were harness failures rather than financial defects.
- Visual inspection also found a genuine phone-width clipping issue caused by the invoice tab's implicit minimum width. Explicit width constraints corrected it, and the permanent browser case checks every filter's viewport bounds rather than relying only on document scroll width.
- The focused checks do not establish physical phone/PWA/hardware acceptance or rerun full financial posting acceptance. This change has no backend/Rules/query or financial calculation change; the deployed counter-date backend source hashes remain identical.

## Evidence and deployment

Current source: `OpenInvoicesV2.tsx`, `invoiceView.ts`, `VendorBalanceCutoverControl.tsx`, the invoice tab width in `VendorLedgerWorkspacePage.tsx`, and the invoice-total label in `VendorInvoiceDetails.tsx`. Permanent coverage is in the existing invoiceView unit suite and VEN-11 in remaining.spec.cjs, included by the existing full drill entry point.

Raw browser evidence, failed attempts and accepted screenshots are retained under ignored `output/playwright/vendor-invoice-ui-20261031/`. The accepted case is recorded in `output/vendor-invoice-ui-20261031/candidate-manifest.json`, alongside the frozen Hosting-only release bundle and file hashes. Implementation and deployment did not write production financial records or change vendor/cash configuration. No Git commit or push was made.

Hosting deployment completed. All 11 live files match the tested candidate hashes. All 37 Functions and the Rules release were unchanged. Evidence is retained in `deployment-before.json`, `deploy-hosting.log` and `deployment-verification.json` in the same ignored release folder. Refresh the app to load the new invoice presentation and hide the completed reset card; the reset must not be executed again to clear that notice.
