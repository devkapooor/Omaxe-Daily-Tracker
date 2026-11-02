# Counter date correction - 31 October 2026

Status: deployed and verified at `2026-10-31T17:29:43.689Z` after explicit deployment authorization. Production drawer values, session dates, counts and financial records were not edited by the implementation or deployment.

## Confirmed cause

The live read-only investigation found an open session originally opened on 30 October with a latest accepted cash-count checkpoint on 31 October. POS and Rules accepted the checkpoint for today's readiness. Finance and customer-return handlers additionally required the historical session-opening date to equal today. Cashout also classified the current drawer using that original opening date. This mismatch blocked otherwise valid cash operations.

The new regressions first reproduced two failures on the pre-fix handlers: cash expense and customer refund. The baseline contains 3 passing and 2 failing cases, retained as reproduction evidence rather than release results.

## Correction

- `functions/cashBalance.js` owns the server readiness predicate: initialized, session open, checkpoint date matches the operation's business date.
- Billing, finance cash operations and customer refunds call that predicate. Current-day Cashout uses the accepted checkpoint date to classify the active drawer. The refund-aware compatibility proof uses the same predicate.
- Original session opening date/ID and reconciliation records remain historical evidence. Date advancement is established by a real accepted cash count; no automatic midnight cash reset or database date rewrite was added.
- Cashier membership, authorization, live count reservations, revision/quote checks, sufficient-cash checks and idempotency remain separately enforced. Existing historical Cashout source selection/debit rules retain their own tests.
- Existing frontend and Rules already implement the checkpoint-date contract, so no frontend behaviour or Rules change is needed for this repair. The production build remains identical to the last deployed build.

## Checks

| Check | Result |
| --- | --- |
| Expense/payment/Cashout, customer returns and checkout handler suites against dedicated demo emulator projects | 64 passed; 0 failed/skipped |
| Shared-counter frontend domain tests, including IST date conversion/readiness | 17 passed |
| Browser isolation gate | Passed |
| F45-17: two live Auth sessions, older opening/current count, sale, expense, customer return and Cashout | Passed |
| F45-10: normal Cashout and staff transfer preserve held cash | Passed |
| F45-05: count lease pauses payouts/checkout and cancel/refresh recovery remains safe | Passed |
| F45-06: independent sessions cannot overspend the drawer | Passed |
| Source lint, focused drill lint and production build | Passed; existing fast-refresh/bundle warnings retained |

F45-17 independently reconciled synthetic paise: 100000 current count + 18000 sale - 5000 expense - 9000 return = 104000 removed in Cashout, then zero remaining drawer. Stock went 20 -> 18 -> 19. Original opening/count records and bill remained unchanged. Open Counter was absent while the current count made the session ready, and appeared after Cashout closed it. A screenshot is retained with the case evidence.

These are automated browser sessions, not actual separate physical devices. Browser service workers were blocked. Clock-injected handler cases and deterministic IST conversion checks do not establish real full-stack midnight/request.time acceptance. Physical-device, printer/scanner and real midnight checks remain separately manual/timed.

## Evidence and deployment

- Baseline failure and final handler results: ignored `output/counter-date-fix-20261031/baseline.log` and `handler-regression.log`.
- Runtime delta against the last deployed snapshot and candidate hashes: `runtime.patch` and `candidate-manifest.json` in the same folder.
- Browser results, persisted-state evidence and screenshot: ignored `output/playwright/counter-date-fix-20261031/`; `browser-summary.json` provides the five passing case links.
- Permanent coverage: F45-17 in the existing `tests/drill/financeFollowup.spec.cjs`, included by the existing full browser runner; corresponding handler and domain cases live in their existing suites.
- Deployed five Node 22 endpoints: `finalizePosCheckout`, `postPosReturn`, `prepareRefundCashout`, `postFinanceOperation`, `getFinanceCashoutSummary`. All are ACTIVE; deployment limits, service identity and environment fingerprints match the pre-deployment snapshot. The other 32 Functions, including Telegram, and the Hosting/Rules versions were unchanged.
- Live source archive hashes match all 25 staged runtime/package files. Five signed-out probes returned expected application rejections. These checks did not post production financial operations. Deployment evidence is `deployment-manifest.json`, `deployment-before.json`, `deploy-functions.log`, `deployment-verification.json` and the downloaded source proof under the same ignored evidence folder.
- Refresh the app once and retry the intended operation. A valid current-day accepted count is sufficient even when the original session opened on an earlier date. A genuinely stale count or closed counter still needs the normal POS opening/count flow.
- The prior verified application snapshot at `output/release-2026-10-31-vendors-settings/release/` remains intact for source comparison and recovery. No Git commit, tag or push was performed.
