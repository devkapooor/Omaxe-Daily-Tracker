# Architecture

Verified against the local working tree based on `ccc0eb4`, 31 October 2026. This describes source responsibilities, not deployed parity. Dated audits and release checkpoints remain historical evidence. Update this document when navigation, auth, storage, posting authority, summaries or PWA behavior changes.

## Runtime and entry points

- React 19/TypeScript/Vite; `index.html` -> `src/main.tsx` -> `src/app/App.tsx` -> `AppWorkspace.tsx`.
- Separate owner Telegram settings entry: `telegram-settings.html` -> `src/features/settings/TelegramAlertsEntry.tsx`. Both entries are included by `vite.config.ts`; `vite.telegram.config.ts` is a specialized historical build path, retained for its documented tooling consumers.
- Firebase web SDK configuration: `src/shared/lib/firebase.ts`. Auth, profile verification and role checks precede workspace access. Local URLs are not proof of isolation.
- Node 22 backend: `functions/index.js`, `functions/package.json`; `firebase.json` uses `nodejs22`. `telegramFunctions.js` is the isolated Telegram codebase through `firebase.telegram.json`/its preparation tool. No runtime upgrade or cloud change is part of maintenance.
- `firestore.rules` and `firestore.indexes.json` govern client access/query shapes. Callable handlers must independently validate identity, authority, revision, intent and transaction invariants; Admin SDK bypasses client Rules.
- `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html` provide PWA packaging/offline shell. Business operations are online. Automated drill contexts block service workers and do not accept installed-app behavior.

## Current navigation and presentation

Owner: Dashboard, Action Centre, POS, Stock, Vendor Workspace, Register, Loans, Cashout, Cash Movement, Logs, Settings. Logout is a separate menu action. Manager/billing: POS, Stock, Vendor Workspace, Register, Cashout, Cash Movement, Settings. Cashout visibility/access also depends on the IST window. These lists describe page families, not a fixed count of visible buttons.

| Page | Tabs / primary controls and dialogs |
|---|---|
| Dashboard | Month/date range, sales mix, trend, projections and source summaries |
| Action Centre | Pending / History; price, payout, cashout, handover and financial correction details; acknowledge/approve/reject as permitted |
| POS | Billing / Dashboard / Bills; product search/scanning, cart, hold/resume, checkout, bill receipt, immediate return and recovery |
| Stock | Current Stock / Receive Stock / GRN History / Stock Return / Stock Audit / Stock History; price editor, receipt/draft/source, count/reversal, debit note |
| Vendor Workspace | Vendors & Parties / Invoices / Payment Corrections / Balances; combined add/edit directory, GST, opening correction, invoice/GRN details, payment navigation |
| Register | New Payment / Payment History; owner Cheques; expense/vendor payment, cheque issue/presentation, confirmation and operation recovery |
| Loans | Owner workflow; navigation/read only during this maintenance, no mutation acceptance |
| Cashout | Denominations, expected/actual reconciliation, source details, correction, count and typed confirmation |
| Cash Movement | Real staff account/bank destination, amount, confirmation and recoverable posting |
| Logs | Sales / Expenses / Purchases / Payments / Daily Cashouts / Cash Transfers / Settings Audit / Stock Audits; range/name filters, table controls, details/receipt/corrections |
| Settings | Owner Staff / Operations / POS / Staff Notifications / Business Identity / Update Password; staff-permitted views and own password |

`pos-test`, `vendor-preview`, `expense` and `directory` are legacy page IDs. They are not instructions to create demo records or activate retired previews. `directory` routes to the combined Vendor Workspace; there is no separate Party Directory menu. Audit history is in Logs. Display references such as GRN/AUDIT coexist with immutable internal document/actor IDs. Technical identity remains available in collapsed details where needed; hiding a UID never removes audit data.

## Source ownership

| Location | Responsibility |
|---|---|
| `src/app/` | Auth/workspace composition, role/page resolution, notices, display helpers |
| `src/config/`, `src/domain/` | Configuration, domain types and pure policies/summary calculations |
| `src/features/auth/`, `navigation/` | Sign-in/remembered accounts/offline gates; desktop/mobile navigation |
| `src/features/pos/` | Billing, checkout/refund clients, recovery intents, receipts, handovers, POS dashboard; historical GRN/domain compatibility |
| `src/features/stock/` | Current stock queries, receive/drafts, audits, returns, history and stock operation recovery |
| `src/features/vendor-workspace/`, `directory/` | Vendor ledger UI/repositories, combined directory, GST and opening correction; retained cutover/preview modules are not reachable from the current entry graph |
| `src/features/register/`, `cashout/`, `cash-movement/` | Finance UI, cheque operations, counts, correction and durable operation recovery |
| `src/features/dashboard/`, `logs/`, `action-center/` | Read models, bounded source history, role-scoped reviews and source links |
| `src/features/settings/` | Staff/settings/business identity and separate Telegram controls |
| `src/features/loans/`, `payroll/` | Existing loan workflow and retained payroll compatibility/test modules; no reactivation/removal under maintenance |
| `src/store/` | App state, subscriptions, auth/settings/legacy compatibility, vendor client API and shared-view publication |
| `src/shared/lib/`, `ui/` | Firebase/time/theme/format infrastructure and reusable controls; shared name normalization lives in `nameUtils.ts`, re-exported by old public helper modules |
| `functions/` | Trusted financial and stock posting, intent idempotency, server time and safe read-model publication |
| `scripts/` | Explicit developer/operational tools; policy generator writes tracked copies, publisher can write cloud state and is not a drill command |

`DirectoryPage.tsx` and `ExpenseForm.tsx` were retired during maintenance after entry/import/config/script/test review. Replacements are `VendorDirectoryV2` and `RegisterPaymentForm`; DIR-01 and F45 retain current workflow coverage. Other unreachable modules remain retained for tests, compatibility or unresolved cutover history. See the exact [cleanup and retention register](../operations/MAINTENANCE_FOLDER_REGISTER_2026-10-31.md).

## Posting authority and transaction boundaries

1. Auth state resolves `users/{uid}` and workspace permissions. Disabled/missing profiles fail closed; active-session changes must be tested separately from sign-in.
2. Feature clients persist an operation intent before posting, with stable operation identity for retry/recovery. Pending or ambiguous outcomes must be recovered before a second financial intent.
3. Checkout/refunds, stock receipts/audits/prices/returns and current finance operations call their trusted handlers. `postFinanceOperation` dispatches Register, cashout, correction, vendor opening/GST and return operations; named stock/checkout/refund exports remain separate.
4. Handlers derive trusted totals, actor and relevant revisions, validate policy, then transact related source/state/ledger/movement records together. An operation replay must return its original result without duplicating effects. Client quotes are not financial authority.
5. Firestore subscriptions refresh screens and read models. Owner `appStore` derives workspace metrics from loaded sources, then calls `publishWorkspaceMetrics`; `functions/sharedViews.js` validates publication and produces staff-safe projections. Staff never read the private owner settings/metrics mirror. This is not a fully server-derived metrics architecture.
6. Legacy V1 records, old voids, slot identity and planner fields remain read-compatible. Their presence does not authorize new historical writes, loan mutation or migrations.

Pure financial policies are intentionally not merged by superficial similarity. `scripts/syncFinancePolicies.cjs` generates `functions/vendorLedgerPolicy.js` and `cashoutPolicy.js` from their existing domain contracts; review parity/diffs and test both sides after generation. Do not run the generator casually in a read-only review.

## Data and listener ownership

Production Firestore is the active shared database. **Production `posSandboxes/test` contains real business data.** Local SQLite, stock CSV and JSON backups are retained sources/evidence, not the running app's canonical database. The same collection spelling in `demo-alphahub-drill` contains synthetic fixtures only after endpoint proof.

Vendor/purchase/settlement/allocation/account state and append-only audit sources are separate records; legacy history must not be rewritten to simplify UI. Cash ownership uses real user IDs. Business identity is Settings master data and vendor GST belongs to vendor profiles; receipt printing consumes saved values rather than separate constants.

Workspace/vendor subscriptions are shared where already implemented. Current Stock starts no catalogue query for blank barcode/all-status, uses bounded query pages, and opens product/cost and movement readers lazily. A filter/sort UI does not imply all-database sorting; verify each query's scope. The drill observes actual Listen add/remove targets but does not estimate production billable reads. Large modules remain intact where transaction boundaries or compatibility are not yet proven separable.

## Operational truth and verification

- [Operations index](../operations/README.md), [test/coverage map](../operations/TEST_COVERAGE.md), [drill runbook](../../drill.md), [device/timed gaps](../operations/DEVICE_ACCEPTANCE.md).
- Local build/unit success does not establish workflow acceptance or deployed parity. Current maintenance performs no deployment, push, cloud configuration change or live-data mutation.
- Secrets stay ignored/in place. Public Git history may still contain previously tracked records despite current index exclusions. Retention, recovery verification and any history handling require their own decisions.
