# Financial acceptance - 16 October 2026

Status: **Execution completed with unresolved findings. Not ready for deployment.** Core financial posting passed the exercised acceptance checks; this is not blanket financial or production acceptance. No application bug fixes, production mutations, commits, pushes or deployments were made during this run.

## Results

| Layer | Result from this run |
|---|---|
| Browser | **133 passed, 7 failed, 3 skipped** across143 distinct scenarios;165 total executions including preserved retries |
| Failed browser classifications |4 failures cover3 application issues (bank visibility, logout, and2 reproductions of Logs receipt disappearance);3 are obsolete removed-feature contracts |
| Domain |140 passed;2 additional independent payout-consumer checks passed |
| Cloud Functions |93 passed,0 failed/skipped, configured Node20 runtime |
| Current financial/query Rules |21 passed on sequential retry:11 finance fences,6 invoice queries,4 vendor Logs queries |
| Other refund Rules |15 passed,4 obsolete client-posting expectations failed |
| Historical Rules |64 passed,19 failed;4 loan-mutation cases deliberately excluded |
| Source/drill lint |Passed, including final added metric-test lint |
| Build |TypeScript and Vite production build passed (same tooling as npm run build, invoked directly because the local CMD launcher failed) |
| Scope protection |256 baseline application/Functions/config files hashed;0 changed during this run. Existing approved uncommitted changes preserved |
| Whitespace |git diff --check passed |

Do not add retries to the distinct-scenario count or call an obsolete/blocked test a pass. The23 Rules failures remain visible; the trusted-client cutover requires contract maintenance, not reopening direct writes.

[Complete143-scenario matrix](2026-10-16-financial-coverage.md). Artifacts: [summary](../../../output/playwright/2026-10-16-full-financial/run-summary.json), [all attempts](../../../output/playwright/2026-10-16-full-financial/results.jsonl), [latest scenarios](../../../output/playwright/2026-10-16-full-financial/latest-scenarios.json), [Rules failures](../../../output/playwright/2026-10-16-full-financial/rules-failure-inventory.txt).

## Baseline and isolation

- main at be3654c58400b3cb7c88bbfb285c0bc9ea199ee6, app1.5.2, approved Batches1–5 uncommitted. No applicable AGENTS.md found in repository/ancestor lookup.
- Node20.20.2 (Functions engines20), Java21.0.12.1, Firebase CLI15.25.1, Playwright1.63.0, Vitest5.0.3, ESLint9.39.4, Vite7.3.2. Installed versions inspected; no upgrade/install or billing change. Functions supporting tests exercise real production handlers and emulated Firestore with synthetic request/clock fixtures; the browser acceptance separately uses actual authenticated HTTP callables.
- Exact demo-alphahub-drill with Auth127.0.0.1:9099, Firestore127.0.0.1:8080, Functions127.0.0.1:5001 and Vite127.0.0.1:5178. Supporting handlers/Rules use separate demo project IDs.
- ENV-01 verified actual browser requests and SDK targets before business writes; actual nonlocal probe aborted. Browser service workers blocked for mutations; Node server guard rejects nonlocal connections. Real synthetic Authentication and profile gates were used.
- Browser batches sequential. Initial competing Rules compilation starved one browser login and two10-second setup hooks; original failures retained, browser smoke4/4 and Rules21/21 passed without that competition.
- Previous local services were already stopped at start; their latest in-memory review dataset could not be exported. Existing saved snapshot/inspection/screenshots retained. Fresh synthetic fixtures authorised for testing; final219-record read-only snapshot retained. No production posSandboxes/test access. No loan mutation, historical data repair, production settings or billing change.
- Initial local CMD discovery failed. Test-only windows-functions-launch.cjs directly invokes the installed firebase-functions JavaScript entry with Node20 and the same outbound guard. No dependency files changed. Helpers remained hidden.

## Financial workflows verified

- Register cash expenses/vendor payments: trusted actor, real payable/invoice allocation, outflow, drawer and Cashout/Logs linkage. Staff post immediately; owner review does not post again. Negative/fractional/forged authority, stale/mismatched bank, insufficient cash and count-lock requests rejected.
- Bank opening typed CONFIRM, bank-funded expense, cheque final debit, future-cheque cancellation, source retention, invoice commitment release and no post-debit undo. Vendor cheque debit reduced a5000 bank to4700 and1000 payable to700 once; repeat debit left ledger unchanged.
- Cashout count lease, cancel/refresh recovery, matched counts,105 excess (stored auditDifference=-105 under existing expected-minus-counted convention), required reason/owner notification, drawer zeroing and holder assignment.
- Cashout→staff transfer:1000 held becomes700 owner+300 staff, zero drawer, unchanged bank. Interrupted300 bank deposit recovered once: bank5000→5300, held1000→700, no second drawer debit.
- Checkout:15 current cases passed including independently calculated paise totals/change/discount caps, trusted prices/identity, sequence/stock/cash atomicity, concurrent terminals, changed-intent/actor rejection, lost response/refresh, held carts, phone UI and200-line success/201-line unchanged rejection. Old client direct writers fail closed.
- Stock14/14 plus residual forgery probe passed: partial/new receipts, one payable, payment/reversal credit preservation, audit group recovery/concurrency, price review not overwriting current price, stale revisions, product identity and source details.
- Refunds:21 of22 original Batch3 cases now pass; B3-19 remains blocked at the receipt viewer, with its financial correction independently passed by B3-20. Cash refund caps, original discounted paise allocation,200-line restoration, UPI/card original preservation, damaged/unmapped legacy lines, prior-month history, account-switch/storage failure recovery, continued billing before review and mandatory counts checked.
- Six shared-counter concurrency cases passed. Real after-midnight IST audit date matched its movement. Dashboard/net sales, Logs dates/filters/columns, bounded query pages, direct roles, lazy details/listener detachment and offline/reconnect checks ran.
- Independent consumer fixture:9000 paise net sales,7500 operating costs,1500 operating balance;98000 vendor payouts and9000 refund excluded from operating costs, while historical unlinked values retained. Opening/counter/cashflow results are separate from operating profit recognition.

## Confirmed findings - proposed fixes only

### FT-01 - P1 - Owner bank balance remains staff-readable

Roles/workflow: manager and billing; shared settings and owner-bank confidentiality. Business impact: any authenticated staff client can retrieve the owner-only recorded bank balance despite hidden UI. No unauthorised financial write was observed.

Reproduction:
1. In the isolated fixture, store synthetic12345.67 as appMetadata/appSettings.currentBankBalance.
2. Authenticate through the real manager profile, then independently through billingA.
3. Read appMetadata/appSettings with the actual client SDK.

Expected: staff receives shared operational fields without an owner bank figure, or the private source is denied. Actual: both read12345.67. Reproduced in F45-12; manager also failed the initial probe. Evidence: [isolated-evidence](../../../output/playwright/2026-10-16-full-financial/batches/finance-followup-1792105907118/financeFollowup-F45-12-sta-54971-ough-shared-settings-mirror/evidence.json), [trace](../../../output/playwright/2026-10-16-full-financial/batches/finance-followup-1792105907118/financeFollowup-F45-12-sta-54971-ough-shared-settings-mirror/trace.zip).

Root cause: firestore.rules:884–887 allows staff to read the whole settings document. storeSubscriptions.ts:201–233 still ingests its bank mirror. Firestore Rules cannot redact one field. Restricting bankBalanceControl and moving the panel did not address this read path.

Proposed fix/files: separately review staff-safe settings versus owner-private bank data; update firestore.rules, storeSubscriptions.ts, bank readers/writers in finance modules and OwnerBankBalance. Inventory old clients/functions before changing the mirror contract. Do not remove shared notifications/operating settings or silently change production configuration.

History/compatibility: no replay, opening-balance rewrite or historical financial migration. Bank baseline/revision checks and existing owner reads must survive cutover; a production shared-settings change needs explicit review.

Acceptance: direct manager/billing SDK and every allowed cached/query path disclose no bank amount; owner Dashboard/baseline and bank/cheque/deposit posting remain correct; billing configuration, notifications and general settings still load. Keep F45-12 failing until this is achieved, alongside the21 current Rules tests.

### FT-02 - P2 - Logs refund receipt disappears while being read

Role/workflow: owner Logs→Expenses→View refund receipt. Business impact: source evidence cannot reliably be inspected; the connected correction test is interrupted. No source amount, stock or balance changed from viewing.

Reproduction:
1. Post a synthetic bill and its valid cash refund.
2. Open Logs→Expenses and View refund receipt.
3. Leave the popup open through normal workspace refresh.

Expected: readable original receipt remains open until dismissed. Actual: B3-19 found no popup; independent F45-13 first opened it successfully, then observed it disappear within the18-second persistence check. Evidence: [isolated-evidence](../../../output/playwright/2026-10-16-full-financial/batches/finance-followup-1792105641479/financeFollowup-F45-13-Log-058b4-ugh-workspace-clock-refresh/evidence.json), [trace](../../../output/playwright/2026-10-16-full-financial/batches/finance-followup-1792105641479/financeFollowup-F45-13-Log-058b4-ugh-workspace-clock-refresh/trace.zip).

Root cause supported by source: AppWorkspace.tsx:192 refreshes every15 seconds, and CashierHandoverBoundary.tsx:42 ticks each second; ExpenseLogTable supplies an inline searchText callback at LogDataTables.tsx:93; ResponsiveLogTable.tsx:107–130 rebuilds cell renderers when it changes. RefundReceiptLink owns the dialog state inside a cell, which is replaced. Instrument/unmount regression when implementing.

Proposed fix/files: keep selected receipt/dialog state in a stable parent outside disposable table cells, and stabilise relevant callbacks/column identities. Touch LogDataTables.tsx, RefundReceiptLink.tsx and/or ResponsiveLogTable.tsx narrowly; preserve current lazy point reads and receipt format. No extra standing source listener.

Acceptance: F45-13 stays open through clock/data refresh on desktop and phone; B3-19 completes end to end; Escape/Close/focus restoration work; opening details produces no financial writes or duplicate reads. No history migration.

### FT-03 - P2 - Logout after refresh can silently do nothing

Role/workflow observed: owner, closed synthetic counter, remembered-account/logout flow. Impact: a shared terminal remains authenticated after the user clicks Log out; remembered-card/focus/account-switch steps cannot proceed.

Reproduction:
1. Seed closed counter; log in normally as owner.
2. Refresh, synchronise the actual server clock, and click visible Log out.
3. Wait for account cards.

Expected: sign out, or show the required count/readiness/error action explicitly. Actual: owner Dashboard remains visible; no remembered account card appears. Reproduced twice in AUTH-04. Evidence: [isolated-evidence](../../../output/playwright/2026-10-16-full-financial/batches/remaining-1792105598335/remaining-AUTH-04-remember-957aa-focus-switching-and-refresh/evidence.json), [trace](../../../output/playwright/2026-10-16-full-financial/batches/remaining-1792105598335/remaining-AUTH-04-remember-957aa-focus-switching-and-refresh/trace.zip).

Root investigation: CashierHandoverBoundary.tsx:93–100 returns silently when not ready/busy/error/joinError; the visible logout control remains clickable. The exact guard branch needs instrumentation before fixing. Do not assume that synchronising time guarantees all counter/profile listeners are ready.

Proposed fix/files: CashierHandoverBoundary and the App/layout logout control. Queue a logout intent until verified state is available, or disable with visible readiness/error/retry feedback; preserve mandatory counts and pending financial recovery.

Acceptance: repeated fresh/refresh owner and staff sessions either sign out or visibly enter the required count; actual Auth UID becomes null on completion. Pending payouts/checkout/refunds and count reservations cannot be bypassed. Retest remembered cards/password focus/refresh/manager switch after the guard is corrected. No financial history changes.

### FT-04 - P2 usability/concurrency - Due-stage update races cheque confirmation

Observed owner action: issue an expense cheque dated today, immediately open Cheques, confirm Cancel with reason and blank CONFIRM. Automatic presentation advances the revision while confirmation is open. Actual: “The source revision is stale”; cheque remains presented. Server safely rejected it; no bank/drawer debit. Evidence: [isolated-evidence](../../../output/playwright/2026-10-16-full-financial/batches/closure-1792105826704/closure-FIN-02-expense-che-7af5d-ellation-creates-no-expense/evidence.json), [trace](../../../output/playwright/2026-10-16-full-financial/batches/closure-1792105826704/closure-FIN-02-expense-che-7af5d-ellation-creates-no-expense/trace.zip). Future-dated cancellation passed separately, retaining the same source as cancelled with zero operating-cost contribution and unchanged bank/drawer. This does not certify the due-stage first-click path.

Root cause: RegisterCheques.tsx:43 auto-materialises due status while decide at51–83 captures an earlier revision before asynchronous confirmation. Proposed treatment: settle/show due processing before enabling an action, refresh the evidence and require a fresh confirmation on real changes. Never weaken server stale checks or replay changed payload under the original operation ID.

Acceptance: exercise real due materialisation versus cancel/debit/bounce in independent contexts; show an actionable refreshed confirmation, post once with the current approved evidence, preserve all terminal transitions/history and unchanged-bank failure assertions. This is a UI readiness issue, not an observed financial double debit.

### FT-05 - P3 usability improvement - Deposit method lacks its own accessible name

Cash Movement nests destination and deposit method under To. Actual browser snapshot names the second field only “Select an option”; the destination name includes other controls. A first test selected the destination again and never submitted; corrected locator then passed the real deposit/recovery workflow. Proposed separate Bank deposit method label in CashMovementForm/field wrapper, preserving values and posting. Accept when keyboard/screen-reader locators identify each field unambiguously.

## Failed obsolete contracts and environment findings

- B1-14 and advanced POS-10/POS-11 expect new owner voids. Explicitly retired by approved Batch3. Do not restore void or count those tests as passes; retain historical void reading. Current void-rejection tests passed.
- UX-02 expects the old expense-cheque overlay/Payment Mode control. Replaced by approved Register issued-cheque fields and icon confirmation. Its original failure remains; present/future cheque safeguards tested in current cases.
-23 Rules failures expect retired direct expense, Cashout/sales, vendor ledger/opening/settlement/cheque/correction writers or invoke retired custom client-database adapters / close without a fresh trusted count quote. They are test-contract/fixture maintenance, not permission failures to fix by allowing client posting. Keep underlying financial assertions through authenticated callable/invariant tests and preserve permitted count/read branches. [Exact titles and failures](../../../output/playwright/2026-10-16-full-financial/rules-failure-inventory.txt). No assertion was changed merely to accept an arbitrary error.
- Initial CMD discovery, setup timeout, competition-related login and screenshot-capture failures are preserved. Explicit typed CONFIRM steps, current labels/navigation, canonical fixture sales ID and consistent bank baseline were corrected in tests only. Mismatched bank was correctly rejected before money posting.
- Some forged Rules probes reach the1000-expression evaluation ceiling and deny. Legitimate exercised count/join paths passed. Consider narrow Rules-complexity review; do not call every unauthorised denial evidence of an optimally simple rule graph.

## Blocked, excluded and untested

| Workflow | Status / limit |
|---|---|
| AUTH-06 secondary staff-account creation |Blocked. Secondary Auth targets nonlocal service; guard aborted before account mutation. Needs emulator-aware secondary Auth handling before full local acceptance; production behaviour was not tested |
| Native Android installed PWA, physical scanner/printer |Manual; desktop headless/static manifest/HTML inspection is not hardware acceptance |
| Full shared-counter transition across real midnight |Not Run. Explicit boundary calculations ran but scenario remains skipped as full-stack acceptance; real after-midnight audit date passed |
| Five actual elapsed minutes reservation expiry |Not Run timed variant; aged synthetic timestamp, stale count and cancellation variants passed |
| B3-19 receipt-viewer-connected correction |Blocked at FT-02. Its paise close/correction/source invariants passed independently as B3-20 |
| AUTH-04 remembered-card focus and UI account switching remainder |Blocked by FT-03; password reset/change and separate account-switch recovery checks do not replace these UI steps |
| Due-date first-click cancellation/debit/bounce versus presentation |FT-04 issue remains; future cancellation and normal due debit passed, all server post-debit transition rejections passed |
|14 October production payments/manual Cashout deduction |Not verified/repaired here. Synthetic compatibility tests preserve already-counted legacy cash; do not debit those historical payments again |
| Production indexes, deployed callable availability, old installed-client delivery and measured cloud read/cost changes |Not accepted by emulators. Required release checks and separate deployment authorisation remain |
| Loans |Read-only visibility/permission checks only.4 historical mutation cases excluded; no loan fixtures/postings/behaviour changes |

## Proposed next fix order - no implementation in this run

1. FT-01 bank read confidentiality with a reviewed shared-settings/old-client compatibility cutover.
2. FT-03 explicit logout readiness/count/recovery handling.
3. FT-02 stable Logs source viewer.
4. FT-04 cheque due-stage action readiness and FT-05 deposit label.
5. Reconcile the23 stale Rules contracts and3 obsolete browser contracts without weakening server authority; retain the original failures. Rerun focused regressions, then the financial milestone before release.

No bank-source migration, production correction or deployment is authorised by this report.

## Test-only changes and resumption

Added full-financial-acceptance.cjs, windows-functions-launch.cjs, financeFollowup.spec.cjs and tests/financeMetrics.test.ts. Updated run.cjs and focused finance/refund/financial/closure/resilience/remaining specs for current approved controls, explicit confirmation and fixture contracts; original attempts/sources retained in artifacts. Updated drill.md, this report/coverage matrix and implementation checkpoint. Application/Functions/Rules/indexes/env/dependencies matched all256 baseline hashes.

Use installed Node20 with JAVA_HOME for Java21 and the guarded local startup. This dated controller requires DRILL_RUN_ID=2026-10-16-full-financial. Modes: static, support, browser, followup, final, completion. Browser batches reset shared synthetic data and must run sequentially. Resume individual cases with tests/drill/run.cjs <batch> --grep <ID>. Final unresolved browser selectors: finance-followup/F45-12 and F45-13; remaining/AUTH-04; refund/B3-19. Original removed-feature tests stay explicitly unaccepted.

Artifacts include baseline Git status/hash comparison, exact command results, real source/actor/revision/balance evidence, screenshots/traces for failures, final demo snapshot and redaction manifest under output/playwright/2026-10-16-full-financial/. Services remain local; no review window was opened and no visible terminal helpers were started.

Completion:16 October2026,04:50 IST. Evidence redaction completed (9 text files,26 traces,269 trace resources); financial values and original failure assertions retained. Final added metric-test lint passed. Test runners exited and fixture lock released. Read-only final demo export contains219 records. Emulators/Vite remain local and no headed review browser is open.
