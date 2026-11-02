# Release register - 31 October 2026

**Latest follow-up deployed and corrected (1 November IST):** the historical Cashout safety repair adds an explicit already-removed/removing-now choice and an owner-audited correction for duplicate drawer deductions. `postFinanceOperation`, `getFinanceCashoutSummary`, and Hosting were deployed and hash-verified. The approved 17 October duplicate drawer debit was reversed once for ₹14,300, with original financial records preserved. [Workflow, safeguards and evidence](HISTORICAL_CASHOUT_SAFETY_2026-11-01.md).

**Historical expense follow-up deployed (1 November IST):** `postFinanceOperation`, `getFinanceCashoutSummary` and Hosting are deployed and verified against the tested release. Supports past-date owner confirmation and audited corrections to supported completed Cashouts without another live drawer debit. All 26 source files in both changed Functions and all 11 live Hosting files match; 35 other Functions and Rules are unchanged. No production expense adjustment was applied; the owner confirms actual dated totals through the app. See [operator steps, evidence and limitations](HISTORICAL_EXPENSE_RECONCILIATION_2026-11-01.md).

**Latest UI deployment completed:** [completed reset card and compact invoices](VENDOR_INVOICE_UI_2026-10-31.md). All 11 Hosting files match the tested bundle; existing backend/counter fixes remain deployed.

**Counter-date follow-up deployed:** the approved correction was deployed to five Functions and verified. See [counter date fix and deployment](COUNTER_DATE_FIX_2026-10-31.md). The original broader production deployment described below predates this follow-up.

Application code, Rules and Hosting were deployed and verified on 31 October 2026. See [deployment results and recovery](DEPLOYMENT_2026-10-31.md). The owner subsequently reported completing the vendor balance reset. Legacy profile migration has not been confirmed in the conversation. No Git commit or push was made.

| Change | Local implementation | Production action still required |
| --- | --- | --- |
| Vendor payable fresh start | Owner-only dated reset, preservation of financial history, and opening balance capture on the first new vendor transaction | Owner reported reset completed; verified openings are entered once with each vendor's first new transaction |
| One active vendor master | V2-only vendor identity/payable reads, removal of legacy fallbacks, owner-reviewed profile/name migration with archives, and restrictive Rules | Code/Rules/UI deployed; review every source-to-vendor mapping before applying migration |
| Retire Announcements | Settings tab, popup, state/actions and backend publish/clear paths removed; Staff Notifications remains | Deployed |
| Extend Business Identity | Optional FSSAI licence and bank name/account holder/account number/IFSC/branch; server validation and owner-only bank storage | Deployed; owner enters actual optional details in Settings |

## Read-only Hosting check

At `2026-10-31T05:10:51.154Z`, the public Hosting page at `https://alphahub-f137b.web.app` referenced `/assets/main-CVvN1AFb.js`. Its bundle still contained the App Upgrade Announcement interface and did not contain the new FSSAI/bank fields, vendor migration callable names, or vendor balance-cutover operation marker. It did contain the GRN SKU and short/cancelled-item labels from earlier work. This is bundle-level evidence of the pending UI changes, not a test of production records or deployed Functions.

The current deployment includes the whole approved application, default Functions and Rules source from the working tree. All 30 application Functions are ACTIVE, the released Rules match the staged source and all 11 Hosting files match their hashes. Older maintenance documentation, tests and staged data exclusions remain local Git changes; no commit or push was included. The Hosting check above is the preserved pre-deployment observation.

## Validation and limits

- Settings backend: 12/12 tests passed against the local Firestore emulator using the fixed `demo-shared-views` project. Tests cover staff-notification publication, idempotent retry, rejected writes without partial changes, business-detail validation, preservation of account-number leading zeros, bank-field exclusion from staff projections, omission compatibility for older clients, and rejection of retired announcement commands.
- Build passed; lint passed with the existing Telegram fast-refresh warning. Existing bundle-size warning remains.
- Earlier vendor migration and balance-cutover focused checks passed 6/6. The release checks subsequently used the retained Node 22 runtime and passed the current/historical Rules suites.
- The full isolated browser phase subsequently passed 154 scenarios, including the new Business Identity workflow, with 3 explicit exclusions. Physical-device acceptance remains manual. The existing scheduled-notification browser test remains in `tests/drill/closure.spec.cjs` under SET-02. The owner explicitly retired the separate announcement workflow, so its obsolete dedicated scenario was removed. Historical results remain retained.
- Bank details are descriptive identity data, not a bank-balance adjustment or transfer. Historical announcement fields/audit entries are preserved; the current app no longer reads or writes announcement messages.

## Release order

Deploy reviewed backend changes before serving the new identity form. Coordinate the vendor Rules and UI release and have older sessions reload. Deployment does not automatically reset payables or move vendor identities. Review current production data and execute those owner actions separately after the compatible code is live.
