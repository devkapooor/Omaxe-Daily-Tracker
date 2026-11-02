# Historical Cashout expense reconciliation

Implementation approved by the owner in the conversation. Work began 31 October and continued 1 November 2026. **Deployed after separate explicit authorization on 1 November (IST).** Both finance Functions and all 11 Hosting files were verified against the frozen tested release. No production financial adjustment, Git commit or push was performed. Existing unrelated changes, production history and staged data exclusions are preserved.

## Operator workflow

1. As owner, open Cashout and select a past date.
2. Expand **Review historical cash expenses**. Review ordinary cash expenses, the previous dated adjustment, vendor cash payments and cash refunds separately.
3. Enter the **complete ordinary cash expense total**, not just the missing amount, and a reason. Do not include vendor payments or refunds in this input; Cash Paid Out adds them separately.
4. Confirm. If a Cashout already exists, explicitly check the audited correction confirmation first. A saved Cashout is shown as an informational state; another Cashout cannot be created for that date.

For the synthetic acceptance example, 400000 paise already recorded and a 465600 paise confirmed total produce a 65600 paise dated adjustment. Original records stay intact. Expense reconciliation never removes or credits physical cash, changes sales, or changes staff-held cash. A separate **physical Cashout** still removes only the cash actually counted now, using the existing drawer-debit workflow.

This is a historical reporting reconciliation, not an invented itemised payment: no fake recipient/category or duplicate `cashouts` expense is created. Existing category/recipient expense reports continue to describe itemised source records. The unitemised difference is explicit in Cashout's historical review and source snapshot.

## Authority and compatibility

- Current-day/future dates are rejected. The server uses the IST date; there is no arbitrary seven-day cutoff for this owner operation.
- Legacy ordinary expenses are recognised only in the five existing supported categories and without conflicting vendor/loan/refund links. Sources without `createdAt` are included by a date-only bounded query. Unknown cash classifications or inconsistent rupee/paise amount fields block confirmation rather than guess.
- Owner authentication and active-account checks happen server-side. Billing and manager accounts cannot review or post reconciliations. The new dated collection is server-only under the existing default-deny Rules; no new Rules/index deployment is needed.
- `cashoutExpenseReconciliations/{YYYY-MM-DD}` is the authoritative **current dated declaration and adjustment**: recorded ordinary expense paise, confirmed expense paise, signed adjustment paise, source fingerprint, revision, reason, actor, timestamps and zero drawer impact.
- Existing `financeOperations/{operationId}` stores the immutable result with the previous dated declaration. An identical retry returns the original result. The persistent client recovery journal is reused.
- The expected fingerprint includes the dated declaration revision and saved Cashout revisions/totals. Two requests based on one review cannot both apply. Changed dated sources require a fresh review and confirmation, so later itemisation cannot silently duplicate an earlier adjustment.
- An active Cashout count blocks reconciliation. Historical quotes also bind the reconciliation revision and source fingerprint; changed sources invalidate a quote before any closing write.
- Completed Cashouts receive explicit owner-approved records in the existing `cashoutCorrectionRequests` collection. Only `cashExpense`, revision/update attribution and reconciliation references change. Sales, physical denominations, expected/count evidence, closure, original source snapshot, staff-held balances and live drawer stay intact. The original `sourceTotals` remains original closing evidence; the new reconciliation link explains the corrected reporting total.
- Multiple supported Cashouts on a date receive a delta allocation, newest first, without reducing any below its protected cash-refund amount. Pending corrections block the entire transaction; queued writes are not committed on rejection.
- Older completed Cashouts without an explicit payout total or separate vendor/refund evidence require their existing individual owner correction. The feature does not reinterpret these ambiguous combined totals. Changed vendor/refund evidence is likewise blocked from this expense-only correction.
- Reconciliation and Cashout payout details preserve fractional rupees in display. Existing whole-rupee formatting elsewhere keeps its default.

## Validation and evidence

Existing Node 22 runtime and existing drill infrastructure are reused. All mutations use synthetic records in dedicated `demo-*` emulator projects. Browser endpoints and service identity are checked by ENV-01 and the existing outbound guard. Production was not mutated.

Pre-change baseline: 33 finance posting tests passed. Recovery copies of the pre-existing working files and their hashes are in `output/historical-expenses-20261031/before/` and `baseline-manifest.json`; these copies include unrelated changes that were already present.

Acceptance results and final artifact hashes are recorded in that evidence folder's `acceptance.json`. Raw browser screenshots/traces/persisted-state evidence are under `output/playwright/historical-expenses-20261031/batches/`.

The first browser attempt correctly observed a denied direct client write but failed because the test expected lowercase/hyphenated `permission-denied` while the emulator returned `PERMISSION_DENIED`. That harness expectation was corrected to accept both spellings. A later Logs verification initially left its default seven-day filter while looking for a fourteen-day-old Cashout; the test now selects Last 30 days. Failed attempts, screenshots and traces are retained; these were harness failures, not financial application failures.

Current scenarios in the existing `financeFollowup.spec.cjs`:

| ID | Scope |
| --- | --- |
| ENV-01 | Real Auth/Firestore/Functions endpoint isolation and outbound denial |
| F45-18 | Owner UI, staff denial, retained legacy expense, dated delta, real physical Cashout, explicit completed correction, direct-write denial, precise display in Logs, desktop light/dark and phone viewport |
| F45-19 | Successful real callable commit followed by an intentionally lost response; original operation recovery, one adjustment, unchanged drawer |
| F45-17 | Existing overnight counter/expense/refund/Cashout regression |

Focused handler coverage includes independent expected arithmetic, refunds/vendor separation, original-record preservation, identical retry and changed-intent rejection, concurrent confirmations, source changes/later itemisation, arbitrary older dates, missing timestamps, permissions, invalid amounts/dates, IST midnight, unclassified/inconsistent sources, count reservations, completed corrections, negative adjustments, protected refunds, pending corrections and rejection without partial writes.

Reproduce with the retained Node 22 directory first on PATH:

```powershell
$env:DRILL_RUN_ID = 'historical-expenses-fresh-run'
node tests/drill/run.cjs start
node tests/drill/run.cjs smoke --grep ENV-01
node tests/drill/run.cjs finance-followup --grep 'F45-18|F45-19|F45-17'
node tests/drill/run.cjs stop
```

Focused backend checks, when the guarded local emulator is running (dedicated handler databases differ from the browser fixture):

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:GCLOUD_PROJECT = 'demo-historical-expenses'
node --require ./tests/drill/server-guard.cjs --test functions/financePosting.integration.test.js functions/posRefunds.integration.test.js functions/posCheckout.integration.test.js
```

Build, lint and source unit commands remain `npm run build`, `npm run lint`, `npm run test:unit`. Existing lint fast-refresh and bundle-size warnings are recorded separately from failures. Loans are not mutated. No Telegram recipients are contacted. This does not claim full application regression, real physical-device acceptance, printer/scanner testing or PWA/service-worker acceptance (browser contexts block service workers).

## Deployment and recovery

The user separately instructed deployment. Released `postFinanceOperation` and `getFinanceCashoutSummary` first, verified both as ACTIVE on Node 22 with exact deployed source hashes, and then released Hosting. All 26 runtime files in both deployed source archives and all 11 live Hosting files match the frozen release. Configuration/environment, 35 other Functions (including Telegram) and database Rules are unchanged. Unauthenticated probes to both changed endpoints return 401/UNAUTHENTICATED; this is access-boundary evidence, not authenticated production workflow acceptance.

Frozen release, live before/after metadata, deployment logs and source proof: `output/historical-expenses-release-20261101/`. See `deployment-verification.json`, `deployed-source-proof.json`, `candidate-manifest.json`, and `deployment-before.json`. Prior UI/backend frozen releases remain preserved in `output/vendor-invoice-ui-20261031/` and `output/counter-date-fix-20261031/`.

No schema reset, backfill, migration, Rules change or index change was performed. Old in-progress historical quotes that lack the new binding must be cancelled and freshly counted. Keep the new reconciliation handler available if rolling back the UI so pending client operation journals remain recoverable.

No actual dated reconciliation has been applied to production. Refresh the app, sign in as owner, select the intended past date and confirm the total through the historical expense review. The synthetic example was not seeded and no live adjustment was automatically applied by deployment. Original `output/historical-expenses-20261031/acceptance.json` remains the retained pre-deployment acceptance snapshot.

For local recovery, use the task-only `task-delta.patch`, baseline manifest and before copies. Review later changes before restoring any file; do not reset the repository or overwrite unrelated work. New source files are listed in `acceptance.json`. If reconciliation records have subsequently been posted, do not delete them or blindly revert the backend: make a reviewed compensating dated confirmation and retain operation/correction history.
