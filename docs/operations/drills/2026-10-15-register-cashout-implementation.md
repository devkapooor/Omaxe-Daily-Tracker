# Combined Phase 4–5 implementation checkpoint

Status: implementation in progress; not committed, pushed or deployed.

## Authorisation and baseline

Owner approved the short combined plan with APPROVE IMPLEMENTATION on 15 October 2026 IST. The revised proposal in [plan](2026-10-15-cash-movement-expenses-cashout-plan.md) is the scope. Batch 1–3 accepted work and all existing unrelated changes are preserved. Production business data is read-only. No loan mutations, dependency/runtime upgrades or billing changes. Helpers remain hidden.

Read-only metadata preflight on 15 October IST confirmed Blaze enabled, Firestore asia-south1 and deployed Functions nodejs20. Configured acceptance runtime is portable Node 20.20.2. Incremental server compute, source reads, linked writes and logging depend on transaction volume; no measured cost saving is claimed. Evidence: output/playwright/2026-10-15-register-cashout-phase45/preflight.json. Baseline main/be3654c, app 1.5.2; pre-existing tracked diff and working status saved under the same artifact directory.

## Scope and preservation constraints

Register expense/vendor payments, cheque issue/due presentation/debit, connected vendor financial writers, Cash Movement recovery, trusted Cashout/corrections, visible Logs actions with blank CONFIRM gate, consistent gross/net/drawer labels, protected Rules cutover. Historical 14 October vendor cash payments were manually deducted during Cashout; no repeat debit or historical repair is authorised. Bank activation requires owner-confirmed recorded baseline; no historical payment replay.

## Progress

- [x] Approval recorded, existing changes captured, billing/runtime checked read-only.
- [x] Writer/source inventory inspected: createFinanceActions, createCashoutCorrectionActions, vendorLedgerV2Repository, Functions, Rules, Register and Logs.
- [x] Implement trusted service boundaries and source effects.
- [x] Route legitimate UI writers and recovery.
- [x] Simplify Register/cheques and Logs actions.
- [ ] Cut over equivalent Rules with compatibility review.
- [ ] After implementation, add/run isolated regression and acceptance checks.
- [ ] Present local UI and remaining risks.

No validation results from earlier batches are counted as this implementation acceptance.

## First validation checkpoint

25 independent emulator server cases passed in demo-finance-posting (no skipped cases). Rules first attempt: 10 passed, 1 failed; it exposed the remaining specific owner vendorCatalog write branch, now corrected. Original failure log retained. Browser first attempt stopped on new-spec syntax before any workflows executed; corrected and rerunning. Source TypeScript check passed once; source lint corrections remain under verification. No production business writes, commit/push/deploy. Current local demo 237-record backup retained before task-owned old preview closure.

Evidence: output/playwright/2026-10-15-register-cashout-phase45/.

## Browser integration issue preserved

F45-01 third attempt: Register expense ₹50 and vendor payment ₹200 posted correctly (opening ₹1,000, expected drawer ₹750), then the shared-counter fixed status banner intercepted Save Cashout and Close Drawer. Own Cashout count now uses its inline status rather than that floating banner. Re-run pending. Original screenshot/trace retained in batches/finance-1792017035872 and subsequent attempt folders; use run result metadata for exact failed attempt IDs. Harness-only selector/syntax failures are distinguished from this UI failure.

Rules second attempt passed all 11 cutover cases. Source lint and TypeScript milestone passed; later source changes still require final checks.

## Regression checkpoint

134 domain checks passed. Complete Functions regression completed; see functions-regression-corrected.log for the exact count (includes the 25 new financial cases and retained checkout/stock/refund cases). Finance browser first full run: 7 passed, 1 failed (bank baseline acknowledgement race). The bank document listener updated before the callable response completed; forms now stay disabled through acknowledgement, and pending journals retain independent tab references. Targeted retest plus new payout/logout-count compatibility case running. Full historical Rules run: 90 passed, 23 failed, 4 excluded loan-mutation cases. These failures predominantly assert permission for the intentionally retired browser finance writers; they are not counted as passes and require current-contract test maintenance. Original test files/failures remain preserved.

## Local review requested

Owner requested a local review window. Sequential finance browser regression passed 9/9; stock passed 14/14; checkout passed 14/15, with missing-profile authentication setup failure preserved. Refund regression was deliberately interrupted after its first four cases passed so automated fixture resets cannot interfere with review; remaining cases are NOT RUN on this attempt. Original logs and traces retained. Task-owned regression controller 23068 and descendants were stopped after command-line ownership verification; emulators and Vite preserved. One guarded finance preview uses synthetic records only and retains the exclusive fixture lock. Full validation and acceptance remain pending.

## Owner UI feedback revision

Owner requested removal of redundant Vendor Workspace Payments/Cheques tabs, owner-only Register bank visibility, one vendor dropdown, and restoration of the familiar Cashout layout. Removed both placeholder tabs and the workspace cheque listener. Register reuses the existing lazy, cursor-paged StockVendorPicker, including its embedded prefix search/load-more; no standalone search box or button remains. Bank status/control subscription and its direct Rules read are owner-only; staff payment posting still uses trusted server validation.

Cashout restored the compact three-column date/sales/machine, credit/payout/expected, audit/actor/refund arrangement and separate denomination popup. Detailed source reconciliation is collapsed; labels distinguish gross receipts, refunds, vendor-inclusive payouts and expected drawer including opening. Posting, idempotency, count leases, validation and history are unchanged. Popup traps focus, restores focus and cancels its server count on Escape; live posting regression after this UI revision remains pending while owner review owns fixtures.

Known pre-existing confidentiality limitation: appMetadata/appSettings still contains the legacy currentBankBalance mirror and is readable by staff because other operational settings are shared. Hiding Register and restricting bankBalanceControl does not prove bank data confidentiality through every legacy source. A redacted shared-settings path requires a separately reviewed compatibility change; no historical rewrite or production mutation was made here.

Focused TypeScript passed; 11 financial Rules checks passed including owner-only bank-control reads. Focused source lint initially flagged ref assignment during popup render; moved assignments into an effect and the retry passed. Browser layout/role checks in progress without a fixture reset or money posting.

UI feedback final verification: manager and billing Register hide bank balance; separate synthetic owner sees it; all three roles have no Vendor Workspace Payments/Cheques tabs and use the single lazy dropdown (including a vendor outside the first page). Browser found an actual 11-pixel Cashout input alignment issue caused by inline helpers; helpers moved below the grid and aligned check passed. First harness attempt respected the existing staff Cashout time restriction; next harness attempt unnecessarily clicked navigation behind the correctly restored modal after refresh. Original failed attempts retained, harness corrected without bypassing permissions/backdrop. Final role/layout/focus/390px overflow checks passed, zero page errors. Popup probe used a context-local illustrative quote only: financial close/cancel/lease acceptance after this revision remains NOT RUN. Focused final lint passed; TypeScript milestone and 11 Rules checks passed; git diff --check passed. No review fixture reset or money posting occurred in these UI checks. Clarified total Cash Paid Out includes cash refunds, ordinary cash expenses and vendor payments; refunds shown separately are a breakdown, not another deduction.

## Owner dashboard bank move and remaining UI edge cases

Owner requested that bank balance/options move from Register to the owner Dashboard. Moved the existing server-backed reconciliation/blank-CONFIRM flow into OwnerBankBalance, mounted only on owner Dashboard. It retains finance-operation recovery and owner-only bank-control Rules; Register now has only RegisterDrawerStatus and never subscribes to bank control. Existing shared-settings mirror confidentiality limitation remains separate; relocating UI is not a server-access remedy. No production setting or historical balance was changed.

Completed invoice-choice compatibility: real bounded 26-document lookahead/25-item pages, stable openAmountPaise/document-ID cursor order, deduplication, stale-response guards, loading/error/retry, Pay-link target point loading beyond the first page, vendor/closed-invoice validation, and fresh payable/invoice choices after successful posting. Vendor changes reset selection and stale target responses cannot overwrite the selected vendor. Invalid linked targets do not discard other open invoice choices.

Disabled-ledger navigation now shows a setup-required message with no retired activation controls; no activation/migration path or historical data change was introduced. Original legacy planner source is preserved but no longer reachable from operational navigation.

Focused browser checks passed for manager, billing and separate synthetic owner: bank absent from Register, present on owner Dashboard; vendor dropdown, Cashout layout/popup/focus and phone overflow checked without resetting fixtures or posting money. Six real Firestore-emulator invoice-query checks passed in a separate demo-register-invoice-picker project: 25+7 ordered rows, no duplicates, beyond-page target, closed/wrong-vendor/missing target rejection and unauthenticated denial. First invoice-test attempt omitted enabled-ledger fixture config; original failure retained and fixed fixture with Rules/assertions unchanged. TypeScript first attempt identified missing shared-heading eyebrow; corrected and retry passed. Final minor refresh edits have focused lint/type checks running. Bank mutation browser scenario F45-02 updated to Dashboard entry, all financial assertions retained; rerun remains pending while owner review owns demo fixtures.

Final focused lint, TypeScript build check and git diff --check passed after the refresh/selection edits. Full financial mutation/regression execution is still pending; local review window and fixture lock remain open. No commit, push or deployment.

## Additive cheque UI review examples

Owner reported no cheques in the local review window. Added three synthetic cheques through authenticated local trusted callables, without reset or application changes: 1120 Issued for 16 October 2026, INR100; 1121 Presented for 15 October 2026, INR150; 1122 Cancelled for 15 October 2026, INR50. They belong to UI Review Cheque Vendor, newly created through the trusted owner vendor/opening command with INR1,000 synthetic payable. Issuance/due presentation/cancellation did not debit bank or drawer; before/after values checked. Existing vendor/payment/stock/history records preserved. Actor uses a separate synthetic owner so the live review login is unaffected. Stable operation intents/journal allow original-result recovery and do not recreate or reset previously reviewed cheques. Evidence: cheque-review-fixtures.json and cheque-review-fixtures.log under the current run directory. This prepares UI examples, not a substitute for full financial acceptance. No production writes or deployment.

## Final cheque-control policy clarification

Owner explicitly rejected re-click/undo after debit. Removed Not yet from current UI; one Mark as debited action remains for due pending cheques. Pending status displays Issued before date and In progress on/after date; historical/server presented status is retained unchanged. Future debit action is disabled consistently with existing server date/transition policy. Debited state is terminal and shows no debit action. Existing blank CONFIRM plus OK remains; no debit reversal feature was added. Original legacy Not yet command/records remain backward-compatible, with no bank/payable change and no current UI entry. No history rewritten.

Focused lint and TypeScript passed. Headless browser against the existing review samples passed: Issued future action disabled, In progress due action available, no Not yet, cancelled action absent, blank debit confirmation/disabled OK/cancel leaves revision unchanged, desktop/390px layout no overflow and zero page errors. No debit was posted and no review data reset. Added explicit server denial checks for every attempt to leave a debited state; unchanged bank/payable/invoice/outflow assertions remain. Server regression is running in separate demo-finance-posting; full browser money-posting rerun remains pending owner review.

Cheque finality server regression passed all 25 cases, zero skipped/failed, including rejection of all post-debit transitions with bank/payable/invoice/outflow values unchanged. git diff --check passed. Existing local review remains open; no production writes, commit, push or deployment.

## Shared cheque table UI

Owner requested the existing table component for a simpler cheque view. RegisterCheques now reuses shared Table/TableHeader/TableRow/TableCell with cheque number, date, payment/reference, amount, status and action columns. Existing live bounded 30-row/31-lookahead Firestore cursor pagination and listener lifecycle remain unchanged; no whole-collection/client pagination was added. Date-based Issued/In progress labels, owner exception safeguards, blank CONFIRM final debit and terminal no-action state remain intact. Small screens scroll only the table horizontally, with a visible swipe hint.

Focused ESLint, TypeScript and git diff --check passed. Existing synthetic review browser check passed with six table headers, expected statuses/actions, blank confirmation/cancel without revision change, desktop screenshot, and 390px internal table scrolling with no page overflow/JavaScript errors. No money posting or fixture reset. Evidence: cheque-table-desktop.png, cheque-table-phone.png, cheque-table-browser.log and current cheque-single-action-ui.json/trace under the run directory. Full financial browser regression remains pending. Existing live review window and user-added synthetic rows preserved. No commit/push/deploy.

## Direct cheque action icons

Owner requested removal of row dropdowns in favour of the existing icon-button pattern. Cheque rows now show Eye (read-only source details), Check (final debit when due), Ban (cancel pending cheque) and Warning (record bounce when due), each with accessible row-specific labels and tooltips. No details/summary dropdown remains, including the legacy draft path (now an issue icon with explicit confirmation). Debited/cancelled/bounced and legacy tracking rows expose View only; no debit undo is available. Owner permissions, server transitions, count/bank effects and cursor queries are unchanged. Debit keeps blank CONFIRM/OK; cancellation/bounce keep mandatory reason plus blank CONFIRM/OK.

Added ChequeViewDialog using shared Card/Button layout: point-loads current cheque and allowed payee/actor records only when Eye is opened; fields are read-only, missing historical fields remain honest, errors have retry, and keyboard focus/Escape/close are handled. No new standing listener or full collection fetch.

Focused lint, TypeScript and git diff --check passed. Existing local browser verification passed for table headers/statuses, no row dropdowns, per-row Eye details and focus restoration, read-only fields, blank debit confirmation/cancel preserving revision, cancellation confirmation with reason and disabled OK, 390px internal table scroll, phone details/Escape, zero page errors. No debit/cancel/bounce was posted by these UI checks; no fixture reset. Screenshots: cheque-icons-desktop.png, cheque-icons-phone.png, cheque-icon-details-phone.png; evidence/trace under the current run directory. Existing user review data and window preserved. Full financial browser regression still pending. No commit, push or deployment.

## Owner cheque UI acceptance

Owner confirmed the cheque UI with “confirm ui for cheques”. Acceptance covers the shared table, direct Eye/Check/cancel/bounce icons, read-only details popup and final-debit presentation reviewed locally. This is UI acceptance; it is not full financial/regression acceptance or authorization to commit, push, deploy, or repair historical data. Other latest screens have not received a new blanket acceptance. Local preview remains available; fixture-resetting mutation suites remain paused during review.

## Logs review: canonical source wiring and popup verification

Owner reported empty Logs. Confirmed F45-LOG-01: Purchases/Payments consumed only legacy collections while approved vendor workflows post canonical V2 sources. Sales/Daily Cashouts initially had no completed local Cashout; the owner subsequently completed one during review. No legacy fixtures were fabricated to hide the source gap, and no review fixture reset occurred.

Added read-only vendor log adapters, active-tab/date-range queries and real 25-row cursor pages (26-document lookahead, stable date/document-ID ordering), current invoice-state/source/vendor point reads, explicit refresh and stale-response guards. Payment queries use effective settlement-state dates; linked cashout projections deduplicate by canonical source identity, with current settlement state taking precedence. Legacy records remain visible. Invoice paid amount is not inferred from total minus open, which could include credits; unavailable allocation totals are labelled honestly. Search/sort apply to loaded rows. Existing global legacy subscriptions are preserved; no measured read-savings claim. No new ledger, historical rewrite, posting change or new Rules grant.

Latest local observed rows: Sales 1 (gross cash INR180, returns INR90); Expenses 4 (utility50, vendor cash200, refund90, vendor cheque780); Purchases 1 (REVIEW-1000, total1000, current open20); Payments 2 (cash200 and cheque780, each once); Daily Cashouts 1. Owner-created Cashout has expected INR840, counted INR500 and shortage INR340. Cash Paid Out INR340 includes refund90 plus utility50 plus vendor cash200; bank cheque780 is not a drawer deduction. These observations are not automated financial-posting acceptance. Cash Transfers, Settings Audit and Stock Audits remain legitimately empty in these local fixtures.

Cashout details now has explicit accessible dialog semantics, trapped keyboard focus/Escape/return focus and source-aware gross-cash/payout labels. Browser caught focus returning to a disconnected Eye after table column recreation. Stabilized search callback and removed unused delete callback dependency; preserved both original failed attempts. Correction dialog now has an accessible name; no correction/posting logic changed.

Validation: 6 domain mapping/dedup/legacy tests passed; 4 real Firestore-emulator bounded-query/permissions tests passed in separate demo-vendor-logs project. Initial emulator-test setup timed out (not a pass); retained failure and increased setup timeout without changing Rules/assertions. Focused ESLint, TypeScript and git diff --check passed. Read-only isolated browser inspection passed all eight tab visits, no page errors, Eye read-only, Escape/focus restoration, protected source totals, blank CONFIRM with disabled OK, cancel without revision change, and disabled deletion. Tests block nonlocal traffic and financial callables; no financial writes or fixture resets. Evidence: output/playwright/2026-10-15-register-cashout-phase45/logs-review-inspection.json, logs-review-before-wiring-fix.json, logs-inspect-*.png, logs-focus-final.log, logs-cashout-focus-failure.json, logs-action-browser-retry.log, logs-complete-lint.log, logsQuery-related logs.

Full financial/regression acceptance remains pending while owner review retains the fixture lock. Earlier checkout missing-profile setup failure, incomplete refund regression, historical Rules contract failures, shared-settings bank confidentiality limitation and historical reconciliation remain open as recorded above. No commit, push, deployment or production business mutation.

## Full financial acceptance - 16 October 2026

Execution complete; see [dated full report](2026-10-16-full-financial-testing.md) and [143-scenario matrix](2026-10-16-financial-coverage.md). Fresh results:133 browser passed,7 failed,3 skipped;165 total attempts with original failures preserved. Three browser failures are obsolete void/expense-overlay contracts; four cover3 confirmed application issues (staff bank-settings mirror disclosure, logout ignored after refresh, Logs receipt disappearance twice). Due-cheque presentation/confirmation revision race is separately recorded as safe-rejected usability/concurrency finding; future cancellation passed without bank/drawer change and source retained.

All9 current Register finance cases,15 current checkout cases,14 stock cases+residual attack,6 counter concurrency cases passed. Original refund21/22 current cases passed; blocked receipt-connected B3-19 financial correction independently passed as B3-20. Lost bank deposit acknowledgement/refresh recovery, transfer double-click, staff payout→continued billing→owner informational review, actual paise reconciliation, previous-month/historical preservation, typed corrections and vendor payment allocations verified. Domain140+2 new metrics and Functions93 passed. Current finance/query Rules21 passed on sequential retry; other/historical Rules79 passed with23 stale direct-client/custom-context expectations failed and4 loan-mutation cases excluded. These23 are not accepted/passed; contract maintenance remains. Source/drill lint, added metric-test lint, TypeScript, Vite production build and git diff --check passed.

256 application/Functions/config baseline hashes unchanged throughout this test-only round. No production business/settings/billing writes, financial repairs, app bug fixes, upgrades, commit/push/deploy. Original initial CMD/hook/capture/fixture failures and redacted traces retained. Test helpers remained hidden. Original in-memory review services were already stopped at start; prior saved review snapshot/evidence preserved, fresh authorised synthetic data used. Final219-record read-only export retained. Fixtures unlocked; emulators/Vite remain running. Release is NOT READY pending report findings, test-contract reconciliation and the listed manual/timed release checks. Existing cheque UI acceptance remains a UI acceptance, not full financial/deployment approval.
