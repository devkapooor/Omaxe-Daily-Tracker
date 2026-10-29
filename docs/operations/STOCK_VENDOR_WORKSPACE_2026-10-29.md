# Stock, Vendor Workspace and Party Directory revision

Status: implemented after the user's explicit **approve implementation**, then
deployed after the user's explicit **deploy**. Existing Telegram, compact POS
shortcuts and Receive Stock margin work in the shared checkout are preserved.

## Approved behaviour

| Area | Implementation |
| --- | --- |
| Vendor search | Read the complete active catalogue in bounded server pages before filtering, with case-insensitive name/alias matching. Only 25 matches are displayed initially; searching includes every fetched page. A 10,000-record guard fails explicitly rather than silently truncating. Reads are shared only while in flight and are scoped to the signed-in user. |
| GRN History | Vendor-name picker replaces raw vendor ID. Inactive vendors remain searchable for historical receipts; clear resets to all vendors. |
| Drafts | A visible Saved drafts section reads all dates, supports pagination, refresh and Resume, and refreshes after posting. Creator/owner editing restrictions remain. Incomplete zero-value drafts are saved without stock or payable posting. |
| Normal receiving | Payable is calculated from received quantity times unit cost on the server. The browser's declared total cannot override it. Older clients with a different declared total must reload and review the receipt instead of silently posting a different liability. |
| Shortages | Complete deliveries only. Explicit original invoice plus pending/received credit-note state; no pending delivery. Awaited notes retain the original payable. Received notes produce the received-stock net payable once. |
| Credit-note confirmation | Owner-only server transaction links the note, adjusts the invoice/account once, records audit evidence and preserves stock and payment records. A vendor/normalised-note reservation prevents reuse, including concurrent submissions. Excess payment becomes vendor credit. Both invoice-level and account-level pending cheque commitments are protected. |
| Invoice uniqueness | New second receipts against an existing vendor/invoice are rejected. Historical partial receipts retain their existing view/reversal support; no historical data is migrated or deleted. Older drafts must be reopened, reviewed and saved before submission. |
| Unified directory | Vendor Workspace contains one Add Party / Vendor form and the searchable compact directory. Other parties create directory identities only, without supplier accounts or opening payables. The old navigation entry is removed, but its stored page key still opens the combined workspace. |
| Party protection | Saved, loan, payment and user identities take precedence over expense descriptions. Confirmed description-only Airtel Recharge/Farhan Porter entries and generated refund captions are hidden only when not protected by a real identity. Unknown payees remain visible as references for review. They are not silently promoted into real parties/new-loan choices. A saved person and a supplier with the same label stay separate. No name-based financial merge is performed. |
| Ledger disabled | Other parties and their creation remain available even when the supplier ledger is disabled; financial supplier creation stays disabled. |
| Vendors | Compact name rows; details on selection. Owner-only opening correction records old/new values and reason, posts only the difference and preserves original evidence. A reduction beyond outstanding becomes vendor credit; pending cheque commitments block over-reduction. |
| Invoices | Compact rows, separators, search, explicit Make Payment/View GRN. Clicking a row opens read-only details. All linked GRNs are queried independently of loaded pages; missing GRNs are explained without inventing receipts. Authoritative invoice states drive due/reserved values, and original allocations drive paid amounts. |
| Balances | Searchable payable and unapplied-credit summaries, compact desktop table and phone rows that keep the vendor name and action visible. View invoices filters that vendor. |
| Scrolling | The payment recovery boundary can fill its parent; Vendors, Invoices and Balances use the workspace scroll container. Recovery behaviour is retained. |
| Corrections | Renamed Payment Corrections; existing owner approval and audit behaviour remains. |

## Financial and data safeguards

- No production records have been created, updated, deleted, reset or seeded.
  `posSandboxes/test` remains the live official catalogue despite its name.
- No historical expenses, real parties, supplier identities, invoices, payments,
  allocations, cashouts or opening evidence are rewritten by directory cleanup.
- New receipt metadata is optional for historical reads. New stock posting uses
  independently calculated totals, authoritative actors and transactional source
  revisions. Stable operation journals recover the original result.
- Credit-note confirmation is included in the stock recovery method allowlist;
  its recovered result refreshes the GRN display. Opening corrections use the
  existing financial journal and current server role checks.
- Existing Rules already deny direct client writes to supplier balances,
  receipts and financial history. New note reservations remain server-only.
- Backend SDK dependencies and runtime have not been changed by this work.

## Verification

| Check | Result |
| --- | --- |
| App/domain tests | PASS, 163 tests across 33 files |
| New isolated stock/vendor transactions | PASS, 15 cases: computed totals, incomplete drafts, pending/received credit, note reuse/concurrency, prior payments/vendor credit, cheque reservations, duplicate invoices, legacy draft review, owner role/revision/idempotency/concurrency and malformed inputs |
| Existing finance/stock integration | PASS, 54 checks. Historical partial reversal uses a clearly seeded historical source; it does not create a new partial receipt under the new business rule. |
| Focused Rules/query tests | PASS, 4 cases, including a 275-vendor multi-page catalogue, inactive vendors, old draft discovery and twelve denied owner/staff direct-write attacks |
| TypeScript, focused ESLint, whitespace and production build | PASS; the existing large-chunk warning remains |
| Private-value scan | PASS: 11 public build files contain no known local-login or Telegram secret values |
| Integrated local browser | PASS: actual components, Firestore emulator reads, and actual server handlers behind a loopback-only demo bridge; see coverage below |
| Production deployment | PASS after explicit release approval; backend ACTIVE, Hosting manifest and live file hashes verified. Live sign-in screen loaded with zero browser console errors. Authenticated posting acceptance remains a user workflow, not a release mutation test. |

Integrated browser coverage:

- All genuine saved/loan/payment/user identities remain available; same-label
  person/supplier rows remain distinct. Known descriptions are absent and an
  uncertain payee remains visible for review.
- Complete mixed-case alias search finds a supplier outside the displayed first
  25 results; scrolling reaches the last directory and balance rows.
- Add Other Party persists only its directory name; supplier/account counts stay
  unchanged. Owner opening correction posts a delta while original opening
  evidence remains intact. Billing users do not get the correction action.
- Receive 2 units at 80: calculated value 160. Original invoice 200 with note
  awaited: payable stays 200. Save, navigate away, Resume, submit, find by vendor
  name in GRN History, then confirm note 40: payable is 160, not 120.
- Submitted drafts disappear from Saved drafts. Invoice row/View GRN open the
  linked receipt; only Make Payment invokes the payment navigation callback.
- Desktop and 390px phone checks include names, amounts, actions and scrolling.
- Other parties remain visible and addable when the vendor ledger is disabled.

All mutable browser data is in **demo-stock-vendor-ui**, and handler tests use
**demo-stock-vendor-revision**, **demo-stock-batch2**, **demo-finance-posting** or
**demo-stock-vendor-rules**, at exact loopback emulator addresses. The demo bridge
supplies synthetic identities to the real role-checking handlers; this is not a
production Firebase sign-in acceptance claim.

The fixture alias/height setup and a native-select-in-modal issue were corrected
during browser review before the passing checks. An obsolete legacy-draft fixture
was corrected after the default pricing contract changed. Initial failed attempts
are not counted as passes. No tests used production mutation data.

## Review and release

Local review URL: `http://127.0.0.1:5298/output/stock-vendor-revision/index.html`.
It is an isolated synthetic owner demo; append `?role=billing` for the staff view.
The emulator and preview are intentionally left running for review.

Screenshots under ignored `output/playwright/`:

- `vendor-parties-local.png`
- `receive-stock-draft-local.png`
- `vendor-invoices-local.png`
- `vendor-invoice-grn-local.png`
- `vendor-balances-local.png`
- `vendor-balances-mobile-local.png`
- `receive-stock-mobile-local.png`

Independent fixture reconciliation is in
`output/stock-vendor-revision/ui-reconciliation.json`. It confirms supplier and
account counts remain 82, protected saved parties remain, original opening
evidence remains 10000 paise, only the actual received quantity was added, and no
cash/bank outflow or settlement was created by a view/navigation button.

Release method: obtain UI/deployment approval; isolate the reviewed source
from unrelated working changes; verify a supported Functions runtime; release the
stock/finance backend with the new handlers and modules before the new frontend;
retain existing Telegram codebase, owner control page and settings. An old client
with an unreconciled manual total is told to reload instead of being silently
accepted. Runtime migration, if required, is a separate reviewed change.

Production verification remains read-only. Never create fake receipts, parties,
supplier payments, credit notes or financial adjustments on production for release
testing. Rollback must preserve new financial evidence and use compatible code;
do not restore or reset financial history.

## Approved production release: 29 October 2026

- Explicit user authorization: `deploy`.
- Release source was copied into ignored
  `output/stock-vendor-release-2026-10-29/`, with a SHA-256 source manifest.
  No commit or push was performed; unrelated shared working changes remain.
- Installed Functions lockfile dependencies in the isolated release directory;
  production frontend build and an 11-file private-value scan passed.
- Released only `saveStockReceiptDraft`, `submitStockReceipt`,
  `confirmStockReceiptCreditNote` and `postFinanceOperation`, then confirmed all
  four ACTIVE with their new source hash. Empty invalid requests were rejected
  with HTTP 400/INVALID_ARGUMENT. These probes created no business records.
- Compared the other 30 Functions with the pre-release inventory: source,
  runtime and ACTIVE state were retained, including all seven Telegram Functions.
- Hosting release `sites/alphahub-f137b/versions/f3ef00a679cf94a1` was published
  at 2026-10-29 05:27:39 IST. Main asset: `/assets/main-DJcYqx4K.js`.
  Only the existing `/index.html` path was replaced; all prior assets and
  `/telegram-settings.html` were retained, and new assets were added. Server
  manifest verification and five live SHA-256 file checks passed. Telegram
  owner controls returned HTTP 200. A fresh browser loaded the live sign-in
  screen with no console errors or warnings.
- No Rules/index release, data migration, business-record rewrite or fake
  financial posting was performed. Production verification remained read-only.
- Runtime remains Node 20 as previously deployed. Firebase and Google's runtime
  schedule confirm decommission on **30 October 2026**. A separate runtime
  upgrade is urgent; this release did not silently include that migration or
  upgrade SDK dependencies.
- Detailed local receipts: `hosting-plan.json`, `hosting-receipt.json`,
  `backend-receipt.json`, `live-file-verification.json` in the isolated release
  folder; pre-release inventory under `output/stock-vendor-revision/`.

Subsequent runtime follow-up: the separately authorized Node 22 migration was
completed on 29 October 2026. All 34 deployed functions are now ACTIVE on Node 22;
see [the runtime upgrade record](NODE22_UPGRADE_2026-10-29.md). The Node 20 warning
above records the state at this feature release, before that migration.
