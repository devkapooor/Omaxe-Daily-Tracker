# Current test and drill coverage

Reviewed 31 October 2026 against the local tree based on `ccc0eb4`. Results are separate from coverage: [current matrix/report](README.md). A listed scenario is not a pass until its actual result/evidence exists. The original `tests/drill/inventory.json` and `findings.json` preserve the October12 investigation; they contain stale paths/retired contracts and are not current inventories or unresolved-bug counts.

## Commands and environment

Use Node22, existing locked dependencies, Java21, Firebase CLI, installed Chrome and cached Playwright1.63.0. No dependency download/upgrade is performed by the current runner. Follow [drill.md](../../drill.md#current-maintenance-execution--31-october-2026) for exact PowerShell startup, run IDs, host proof, lock ownership, stopping and recovery. Never run suites/reset tools concurrently against their shared fixture.

| Command | Includes | Requirements / exclusions |
|---|---|---|
| `npm run test:unit` (`npm test`) | Vitest `src/**/*.test.ts` | Pure/mocked focused coverage, not Rules/Functions/browser acceptance; default includes existing loan domain tests without mutation. `.test.tsx` is not included by the current Vitest config. |
| `npm run lint` | ESLint `src` | Functions and drill have distinct module environments; this deliberately avoids ignored output/dependencies. |
| `node node_modules/eslint/bin/eslint.js --config tests/drill/eslint.config.mjs tests/drill` | Drill source lint | Explicit Node/browser globals for CJS tools. |
| `npm run build` | TypeScript project build + Vite production browser entries | Regenerates `dist/`; no deployment. Size warnings are not workflow results. |
| `npm run test:functions` | `functions/` Node test discovery | Without exact emulator env, integrations skip. Not a full acceptance command on its own. |
| `npm run test:rules` | Guarded standalone Firestore-emulator Rules/support Vitest suite | Starts `demo-alphahub`, free port8080; Java/Firebase CLI/Node22 required; four historical loan-mutation cases excluded. Do not start over the full stack. |
| `npm run drill:start` / `drill:stop` | Existing `run.cjs start/stop` | Keep original stack run ID for stop. Stop validates ownership before terminating its PID tree. |
| `npm run test:smoke` | Four smoke cases including ENV-01 | Full demo stack already running, new run ID. |
| `npm run test:full` | `full-financial-acceptance.cjs full`: static -> support -> dedicated Telegram -> browser | Node22; full stack required. Static omits loan-domain files; support enables `RUN_STOCK_VENDOR_TESTS=true` and `RUN_OPERATIONS_REVISION_TESTS=true`, preserves historical loan exclusions. Browser `all` does smoke first, then all13 non-smoke suites serially. |
| `npm run test:concurrency` | ENV-01, shared-counter races, checkout concurrent/replay/last-unit, drawer overspend, settlement caps, refund races, barcode identity and stale GRN | Stack required. Deterministic coordination is scenario-specific; no global fixture parallelism. Includes real five-minute expiry in full remediation, not a shortened mocked lease. |
| `node tests/drill/run.cjs <batch> --grep <pattern>` | Focused current batch, one `.spec.cjs` | Use fresh evidence ID and run ENV-01 first. Names: smoke, checkout, financial, finance, finance-followup, refund, stock, stock-residual, concurrency, remaining, advanced, closure, resilience, remediation. |

The full support inventory is every11 current `tests/*.test.ts` file plus Functions tests. `trustedFinanceSupport.ts` is shared test setup, not a separate suite. `financeMetrics.test.ts` uses emulator-backed records with focused clock/callable support; label its evidence by layer rather than calling it physical UI acceptance. The full runner uses real backend paths for acceptance. Focused unit mocks are appropriate but cannot substitute for those calls.

Layer distinction: Rules-unit tests supply authenticated test contexts rather than performing a Firebase Auth sign-in. Node handler integrations use explicit synthetic `request.auth` objects and real emulator transactions; they do not prove the callable JWT transport. The browser drill performs actual emulator Auth sign-in and real SDK/HTTP calls through deployed emulator handlers. Those layers complement each other and must not be described as equivalent end-to-end acceptance. Telegram replaces only external delivery with its labeled collector.

## Permanent source / backend suites

| Exact suite group | Purpose and assertions | Inclusion / overlap |
|---|---|---|
| `src/domain/{cashoutCorrections,cashoutSales,partyDirectory,purchasingCapabilities,receiptCreditBalance,refundAccounting,vendorIdentityV2,vendorLedgerCutover,vendorLedgerV2}.test.ts` | Independent policy boundaries, identity, money allocation/caps and legacy compatibility | Unit/static; complement server and Rules invariants, not duplicates to delete. |
| `src/domain/loanMoney.test.ts` | Existing loan arithmetic | Default unit only; full maintenance static excludes loan-specific tests. No loan write/drill. |
| `src/app/uiHelpers.test.ts`, `src/shared/lib/{nameUtils,theme}.test.ts` | Role/page/display contracts, normalization/export compatibility, theme | Unit/static. New helper coverage preserves first spelling/Unicode behavior and old exported APIs. |
| `src/features/action-center/domain/{approvalItems,scheduledNotifications}.test.ts`, `dashboard/domain/deriveMonthlyPerformance.test.ts` | Review grouping/notifications and independent report arithmetic | Unit/static; complemented by ACT/DASH/SET browser cases. |
| `src/features/cashout/domain/cashoutWindow.test.ts` | Explicit IST boundary calculation | Unit/static; not real server request-time midnight acceptance. |
| `src/features/logs/domain/{logTableSearch,vendorLogRows}.test.ts`, `vendor-workspace/domain/invoiceView.test.ts` | Search/sort/display/source transformation | Unit/static + LOG/F45 UI coverage. |
| `src/features/payroll/domain/payroll.test.ts` | Retained historical payroll pure contracts | Unit/static; no active payroll page assumed. |
| `src/features/pos/domain/{cashierHandover,checkoutPayments,drawerClosure,posDashboard,posDomain,trustedCheckoutCompatibility}.test.ts`, `pos/hooks/posDraft.test.ts` | Drawer, payments, draft/recovery, reporting and server-compatibility policy | Unit/static; retained drawerClosure modules are test-used. |
| `src/features/stock/domain/{internalBarcode,mergeHistory,stockPriceChange,stockQueryPlan,trustedStockCompatibility}.test.ts` | Barcode identity, bounded queries/history and authoritative stock compatibility | Unit/static + stock Rules/Functions/browser coverage. |
| `src/store/{partyDirectory,sharedViewsRepository}.test.ts` | Directory safety and staff-safe read-model API contracts | Unit/static; mocks explicitly scoped. |
| `functions/{cashBalance,posRefundPolicy,telegramSalesAlerts}.test.js` | Pure cash/refund rules and alert/command logic | Full support; Telegram transport replaced by test collector, not real-recipient delivery acceptance. |
| `functions/{posCheckout,posRefunds,stockPosting,stockPrices,stockVendorRevision,operationsRevision,financePosting,sharedViews,telegramSalesAlerts}.integration.test.js` | Real emulator transactions, auth/actor validation, idempotency, rejected writes, projections and reporting | Full support with exact loopback hosts/guards; gated operations revision explicitly enabled. Telegram integration is a dedicated full phase on8189 / `demo-telegram-alerts` using the cached official jar, with18 assertions and collector transport. Same invariant may intentionally be asserted at Functions and browser layers. No live Telegram delivery. |
| `tests/{finance,refund,registerInvoiceQueries,vendorLogQueries}.rules.test.ts` | Protected financial sources, refund forgery, role/query authorization | Full support current Rules phase. |
| `tests/{sharedViews,stockVendorRevision}.rules.test.ts`, `tests/financeMetrics.test.ts` | Staff privacy, stock/vendor direct-write fences, financial read model | Full support inventory phase. Stock/vendor opt-in explicitly enabled. |
| `tests/{firestore,pos.repository,stockPrice,stockWorkspace}.rules.test.ts` | Historical compatibility plus current repository/query/stock Rules contracts | Full support historical phase; four loan cases excluded, not silently retired. Complete-delivery/shortage-credit test replaces obsolete partial-delivery assumption. |

## Browser suites and workflows

Every following `.spec.cjs` is included in `run.cjs all`; no suite is omitted because its filename is outside an old batch wrapper. Each fixture records its exact project/date/accounts and each browser context authenticates normally. Rejected business calls are compared against independently read persisted records where asserted. API-level cases are explicitly not UI acceptance.

| Suite under `tests/drill/` | Current acceptance scope / identifiers | Unproven variants |
|---|---|---|
| `smoke.spec.cjs` | ENV-01 outbound/endpoint proof; AUTH-01/02/03 role entry, disabled/missing/wrong-password/anonymous gates | Real production/provider behavior |
| `checkout.spec.cjs` | B1 trusted totals/actors/change, two-terminal sequences, intent replays, profile permissions, count locks,200/201 boundaries, lost acknowledgement/refresh, phone controls; B1-15 coordinated same last unit | Physical scanners/payments/printer |
| `financial.spec.cjs` | POS cash/discount/refund caps, prices/review, draft/post/reverse GRN, physical count, openings/allocations, expense source, forged refund/stock rejection | All business-data shapes and live latency |
| `finance.spec.cjs` | F45-01–09/16 Register/cheques, cash drawer/payable/log reconciliation, lost result, count lease, overspend/forgeries, phone logs/correction, neutral notice/dismissal | Real bank/cheque clearing |
| `financeFollowup.spec.cjs` | F45-10–15 staff transfer/deposit recovery, private bank mirror, receipt continuity/date sorting, informational payout review | Actual mobile/device notifications |
| `refund.spec.cjs` | B3 caps and integer paise, receipt/read-only view, acknowledgement-only owner review, concurrency/replay/lost response/account switching, discounted/legacy200-line sources, cross-month original, Cashout; UX-04 visible opener on layout change and collapsed technical ID | Physical receipt output and every browser focus implementation |
| `stock.spec.cjs` | B2 shortage credit, trusted receiving/drafts, mixed forgery, new barcode identity race, audit/reversal and recovery, revision-stale confirmation | Real imported catalogue exhaustiveness |
| `stockResidual.spec.cjs` | B2-final owner restitution forgery fence | Not broad stock UI coverage |
| `concurrency.spec.cjs` | COUNTER opening/join/reservation cancellation/expiry/refresh/logout; sale versus audit revision; forged checkout | Actual separate-device acceptance |
| `remaining.spec.cjs` | AUTH switching/password/staff creation/permissions and AUTH-08 three live sessions through active disablement/demotion, read-only Loans; Current Stock paging/lazy details, receive vendor picker/new products, hold/resume, payment methods, vendor returns, cheque lifecycle, Cashout closure, tabs/phone/offline; PWA static inspection | PWA-02 intentionally manual; static SW inspection does not run a worker |
| `advanced.spec.cjs` | Security callables/Rules, live count, stale count/sale, historical sources, immediate returns/retired void, stale price/double click, bill pagination, report mix, concurrent invoice settlement, DIR-01 combined directory, second-session announcement | Not physical owner phone or real notification channel |
| `closure.spec.cjs` | Correction withdraw/reject/approve/stale retry, limited cash transfer race, GRN draft/delete/submit/reverse race, independent monthly report, price reviews and cheque cancellation | All network-fault positions |
| `resilience.spec.cjs` | IST calculations and actual IST/UTC audit date when time permits, disabled direct calls, historical invoice activation, search/negative stock/override, cursor ties, actual Listen attach/detach, keyboard semantics, cash discrepancy sign, Logs sorting, real transfer/double click, negative expense; UX-05 navigation timing/request observations | Cross-midnight server checks remain scheduled; observations are not billable Firestore read counts |
| `remediation.spec.cjs` | R01–08 staff privacy/projection recovery, active logout disconnect/reconnect/pending payout, due cheque stale race, receipt across refresh, correction lost response, actual five-minute lease expiry | Old/new installed-app version coexistence |

Current pages/tabs/dialog families are catalogued in [Architecture](../architecture/ARCHITECTURE.md#current-navigation-and-presentation). Source-derived controls map above to AUTH/COUNTER/POS/B1/B3, STK/GRN/AUD/B2, VEN/DIR, FIN/F45/ACT, DASH/LOG/SET/UX. Settings includes Business Identity/vendor GST and Stock Return/debit note; existing `operationsRevision.integration.test.js` / `stockVendorRevision.integration.test.js` cover trusted writes, but printed GST layout on a real printer remains manual. A generic tab-opening case does not accept every form validation variant.

## Supporting script inventory

These are retained in their current paths. They are not additional recommended execution entry points. Reuse `run.cjs` / full modes; no new runner framework was created.

| Exact files under `tests/drill/` | Role / assertions and current command | Status / replacement coverage |
|---|---|---|
| `run.cjs`, `full-financial-acceptance.cjs` | Current browser/stack runner and comprehensive orchestration | Routine commands above; all14 browser suites verified against filenames. |
| `helpers.cjs`, `safe-admin.cjs`, `client.ts`, `payloads.cjs`, `empty-metrics.json` | Shared real-auth contexts, guarded synthetic seed/reset/independent Admin snapshots, explicit SDK negative probes and fixtures | Reused by suites; reset is destructive ONLY to the proved demo environment. No useful fixtures retired. Exact local ABORTED lock-conflict reset attempts are bounded/logged before scenario setup; all other reset failures abort. |
| `server-guard.cjs`, `windows-functions-launch.cjs`, `vite.config.ts`, `sdk-only.html` | Nonlocal socket block, existing Windows Functions launcher workaround, demo env with envDir disabled, direct-callable page without auto-join listeners | Current stack/suites; machine dependencies explicit. SDK page is layer-labeled, not UI acceptance. |
| `playwright.config.cjs`, `eslint.config.mjs`, `reporter.cjs` | Serial execution, screenshot/trace retention, correct CJS globals, append-only run records including F45 IDs | Routine; serviceWorkers blocked explicitly. |
| `scenarios.json` | Scenario cards, initially Not Run; source-linked expected contracts | Coverage metadata, not execution results. New focused contracts also have executable test titles. |
| `inventory.json`, `findings.json` | October12 generated tab/modal inventory and findings | Historical evidence; superseded for current status by this map, Architecture and dated current results. Keep original IDs/failures. |
| `batch1-regression.cjs`, `batch1-regression.json` | Historical45-case checkout contract, Node20 and old title selection | Historical, not run now; current checkout/all covers retained contracts. Two old positive-void expectations replaced by B3-06/B3-01/02/03 and updated B1-14 per explicit policy. |
| `batch1-checks.cjs`, `batch1-preflight.cjs` | Historical targeted build/Rules checks and read-only cloud metadata prerequisite probes | Not routine; full static/support replaces local checks. Do not execute cloud probe as maintenance precondition. |
| `batch3-acceptance.cjs`, `batch3-regression.cjs`, `batch3-resume.cjs` | Node20/exact dated-run refund release checklists and resumable logs | Historical; full/refund/stock/concurrency retain meaningful cases, original evidence not overwritten. |
| `remediation-run.cjs`, `remediation-checks.cjs`, `remediation-browser.cjs` | October16 fixed machine path/Node20/dated release wrappers | Historical; full static/support/browser is current. `remediation.spec.cjs` remains permanent regression. |
| `run-finance-regression.cjs`, `checks.cjs` | Older focused finance/stock/refund and build/test subsets | Optional investigation only; not full. Current full includes B1-14 and finance-followup/remediation omitted by old subsets. |
| `report.cjs`, `document.cjs`, `triage.cjs`, `finalize.cjs` | Historical generation/classification of October12 scenario docs/results | Not routine. Some mutate scenario/docs and use fixed dates; do not regenerate current documentation or classify old bugs as current with them. Current reporter writes per-run results without calling historical report except exact old run ID. |
| `checkout-preview.cjs`, `finance-preview.cjs`, `refund-preview.cjs`, `stock-preview.cjs` | Visible local review tools with synthetic fixtures | Optional preview via existing `run.cjs` commands, excluded from full acceptance. Review fixture ownership first; never run alongside tests. |
| `finance-ui-feedback.cjs`, `cheque-ui-review.cjs`, `inspect-logs-review.cjs` | Focused current-demo UI inspection without confirming financial writes | Optional `run.cjs finance-ui-feedback/cheque-ui-review/logs-review-inspect`; not permanent acceptance substitute. |
| `add-cheque-review-fixtures.cjs` | Adds synthetic cheque review records | Optional `run.cjs cheque-review-fixtures`; not routine, no reset during other scenarios. |
| `export-current-demo.cjs`, `clock-proof.cjs` | Guarded local demo export and real local clock observation | Investigation-only, exact env required; no production exports accepted. |
| `redact.py` | Historical text-evidence redaction | Not routine; does not prove image/trace sanitization or safe public release. Preserve financial assertions and original evidence. |

Other tools: `scripts/syncFinancePolicies.cjs` generates two authoritative policy copies (writes source); `scripts/formatFinanceChanges.cjs` is a one-time formatter including paths that may now be stale (do not run automatically); `scripts/publish-staff-views.mjs` is a guarded **cloud-writing operational command**, not a test. `functions/scripts/prepareTelegramSecret.js`, `prepareTelegramFunctions.js`, `deployTelegramControl.js` prepare secrets/build/release Telegram and may write artifacts/cloud; none is part of this drill. The full test discovery does not invoke these scripts. Historical scripts under `output/`/`logs/` stay evidence/H pending ownership; they must not be promoted into routine commands without review.

## Explicit exclusions and acceptance gaps

No production mutation, no loan mutations, no real Telegram/external recipients, no new void creation (retired requirement), no partial-delivery reinstatement. Four excluded historical Rules titles match: `activates an empty clean start`, `activates the reviewed clean start`, `preserving owner loan payments`, `without touching loans`. Excluded tests remain on disk; no failing test was deleted to pass.

Automated contexts represent independent authenticated sessions on one computer. All interruption positions, physical2 till devices + owner phone, scanner/printer, native install/update coexistence and true midnight crossing are not implied by refresh/offline/domain tests. See [manual steps and gap IDs](DEVICE_ACCEPTANCE.md). Production read cost/listener duplication and field performance need deployed telemetry/read-only measurement; local protocol observations are insufficient.

The loan-specific reference fixture in `functions/operationsRevision.integration.test.js` is explicitly `it.skip`, separate from retained product-reference assertions. It requires separate loan-mutation authorization before enabling. New guards refuse resets containing loan data in operations/stock-vendor/Telegram suites; original four Rules exclusions remain. The earlier enabled synthetic marker is disclosed in the completion report, not hidden as compliant evidence.

Historical opening-stock provenance is explicitly opt-in via `RUN_APPROVED_CATALOGUE_EVIDENCE=true` in `src/features/pos/domain/posDomain.test.ts`. It is preserved one-time evidence, not synthetic acceptance. Full forces it off; routine parser and retired-import denial use `tests/fixtures/pos-products.synthetic.csv`. The optional historical skip is expected and reported. Live permission revocation is proved through a fresh independent authenticated REST read (403). Both SDK `getDoc` and `getDocFromServer` can reuse previously authorized active data in the observed session; that availability is recorded separately and is not treated as a new server disclosure.
