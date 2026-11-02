# Approved drill repair results — 30 October 2026

Status: approved D1-D4 drill repairs and verification are complete. All 22 repair targets passed in the full run. Overall full browser acceptance remains **Fail** because one intermittent keyboard-focus case failed; subsequent successful reruns do not erase that result. No application source fix or deployment is included.

## Scope and environment

- Approved plan: [drill remediation plan](../DRILL_REMEDIATION_PLAN_2026-10-30.md), batches D1-D4.
- Branch `main`, HEAD `ccc0eb458d73999aa2877427b3bea0df2d875004`, with pre-existing uncommitted changes preserved. This is working-tree verification, not verification of the deployed version.
- Real application Auth, Rules and Functions against local `demo-alphahub-drill`: Auth 9099, Firestore 8080, Functions 5001, hub 4400, Vite 5178, all loopback. ENV-01 passed before business scenarios. Outbound guards remain active. No production mutation or loan mutation is included.
- Tests use independent synthetic users and records. This batch edits drill tests/fixtures and documentation, not application posting code, Rules or financial formulas.

## Evidence and recovery locations

| Location relative to repository | Purpose |
| --- | --- |
| `output/playwright/maintenance-full-20261030/` | Original 128 passed, 21 failed, 2 skipped browser baseline, preserved intact. |
| `output/playwright/banner-20261030-approved/` | Prior banner verification and additional F45-04 recovery/navigation failure, preserved intact. |
| `output/playwright/drill-repairs-20261030/before/` | SHA-256-verified copies of ten affected files before this repair batch, pre-existing diff and Git status. |
| `output/playwright/drill-repairs-20261030/` | Focused repair runs, screenshots/traces, original intermediate failure and `targeted-latest.json`. |
| `output/playwright/drill-repairs-full-20261030/` | Fresh static, Functions/Rules and full browser acceptance results. |

To recover a repair, inspect `before/manifest.json` and the saved file against the current working file, then reverse only this batch's own hunks. Do not restore whole files over later or unrelated changes. Evidence is retained locally in ignored output; do not delete original runs or use a historical run ID for a new execution.

## Repair manifest

| File | Change |
| --- | --- |
| `tests/drill/finance.spec.cjs` | F45-02/03 await their actual response and persisted source; null helper contract; cheque retry checks ledger/allocation effects once; F45-04 waits for the recovery-triggered load. Existing F45-16 banner coverage retained. |
| `tests/drill/financeFollowup.spec.cjs` | F45-11 uses null contract and proper reload coordination; independently reconciles held cash using immutable count and transfer. F45-14 uses dates relative to IST fixture date, explicit custom range and both date-sort directions. |
| `tests/drill/stock.spec.cjs` | Consistent complete-receipt fixtures; explicit invalid mismatch and confirmed credit note; independent 100000/40000/60000 partial-payment reversal fixture; read-only calculated payable; retained stale-revision, recovery, role, forged-write and reversal assertions. |
| `tests/drill/advanced.spec.cjs` | DIR-01 checks closed rename dialog, current search result and persisted directory entry. |
| `tests/drill/financial.spec.cjs` | Current unified vendor entry button and case-sensitive field/save labels; opening-balance permission assertions unchanged. |
| `tests/drill/remaining.spec.cjs` | Barcode subelement selectors, complete vendor picker search, current workspace/settings tabs and relocated Stock Return coverage. |
| `tests/drill/resilience.spec.cjs` | History identity via unique visible fixture reason and short business reference; date arithmetic from IST date key; phase-scoped listener targets with explicit Quick Add bounds and cleanup assertions. |
| `tests/drill/scenarios.json`, `drill.md`, `docs/operations/QA_CHECKLIST.md` | Current directory, return/settings navigation, picker and listener contracts. |

No scenario was removed or newly skipped. A stale failure disappearing from the screenshot gallery was never counted as a pass. Intermediate selector failures remain in the raw results.

## Targeted results

The latest attempt of each of 28 focused checks passed, including all 22 targeted failures and unaffected stock checks sharing the repaired fixture. The initial F45-14 repair attempt failed because the picker did not expose the expected Date range accessible name. Its selector was corrected to the actual Last 7 days input and the explicit Custom range option; the new attempt passed. The failure and screenshot/trace remain in the same run.

Important independent expectations verified include:

- Bank expense: exactly 10000 paise; no bank mirror creation or drawer effect.
- Cheque debit/replay: payable and invoice open amount 80000; reservation zero; one 20000-paise debit/allocation; no duplicate after the original request is replayed.
- Expense recovery: one 5000-paise source and drawer delta -5000 after refresh/recovery.
- Deposit recovery: one 30000-paise transfer; counted cash 100000 minus transfer 30000 leaves held cash 70000; original count and drawer unchanged.
- Receipt: three at 6000 equals 18000; stock 20 to 23. Invalid invoice mismatch rejects without writes. Confirmed shortage credit 82000 is applied once against original 100000.
- Partial payment/reversal: complete receipt 100000; payment 40000; payable 60000; reversal returns stock to its original level and preserves payment as vendor credit 40000.
- Listener measurement: exact six-barcode POS Quick Add queries detach on leaving POS; empty Stock has no unrelated product queries; product/cost detail targets attach and detach; no eager movement-history query.

## Comprehensive results

| Layer | Current result | Evidence |
| --- | --- | --- |
| Domain | 160 passed | `static-domain.log`; existing loan-test file exclusion retained. |
| App lint, drill lint, TypeScript, build | Pass | `static-results.json` and step logs; bundle warning measured below. |
| Functions | 119 passed, 0 skipped | `support-functions.log`. |
| Current financial/refund/query Rules | 40 passed | `support-rules-current.log`. |
| Shared-view/stock-vendor/metrics group | 9 passed, 4 opt-in checks initially skipped | `support-rules-current-inventory.log`. |
| Historical Rules | 83 passed, 4 historical loan cases excluded | `support-rules-historical.log`; existing exclusion pattern retained. |
| Explicit stock/vendor opt-in rerun | 4 passed | `supplemental-stock-vendor.log` and result JSON; `RUN_STOCK_VENDOR_TESTS=true`, separate `demo-stock-vendor-rules` project, loopback-only guard. |
| Complete browser suite | **148 passed, 1 failed, 3 skipped** | `browser-browser-all.log`, `results.jsonl`, `browser-results.json`; includes four successful smoke/preflight checks. |
| Approved repair targets within full suite | **22 passed, 0 failed** | `approved-target-results.json`, mapping each original failure to its new result. |
| Fresh B3-07 focus reproduction runs | 3 passed; intermittent failure still open | `focus-reproduction-summary.json`; separate `drill-focus-20261030-a`, `-b`, `-c` runs. |

Rules/support checks therefore have 136 passes with four remaining historical loan exclusions. The original mode log still truthfully reports its eight skips; the four opt-in checks were executed separately rather than rewriting that log. Focused Rules checks use Rules test authentication contexts and an injected emulator SDK database; real application authentication/Functions acceptance comes from the browser suite. The opt-in run resets only its own demo namespace and does not reset the concurrent browser fixture.

See the [complete 152-row browser matrix](2026-10-30-drill-repairs-matrix.md) for each scenario, status, role, duration, test source and evidence link. The 148 regression cases had 144 passes, one failure and three skips; the separate four-case smoke gate passed. All runs used the recorded working tree; `environment.json` records tool versions and endpoints.

The three browser skips are unchanged cases: native PWA/scanner/printer acceptance; real full-stack midnight acceptance after domain boundary assertions; and the actual IST/UTC-disagreement stock audit case, which did not run because execution was outside 00:00-05:29 IST. Passing automated viewport checks do not close these gaps.

## Additional finding outside the approved repair targets

**B3-07 bill-dialog focus restoration — unresolved; medium usability/accessibility severity.** During the new full run, closing a saved bill dialog with Escape left its View Bill opener unfocused. The existing test and receipt components were not edited by this repair batch. The earlier full baseline passed this case, so whether it is an intermittent application issue or a timing problem in the test is not yet confirmed.

Reproduction: seed the normal isolated billing fixture; as billing A create a two-unit bill and return one unit; open POS > Bills; click that bill's View Bill button; wait for its read-only dialog and returned quantity; press Escape. Expected: the opener regains keyboard focus. Observed: the locator remained present but inactive through the existing 15-second assertion window. Keyboard users may lose their place in the bill list. No financial mutation is intended by the read-only dialog action.

Source under investigation: `src/features/pos/components/useReceiptDialog.ts` records the opener, closes the native dialog during cleanup, and schedules focus restoration using requestAnimationFrame; `PosBillView.tsx` uses this hook. A focus/render ordering race is a hypothesis, not a confirmed cause. Preserve the assertion; do not weaken it to get a pass.

Evidence: `output/playwright/drill-repairs-full-20261030/batches/all-1793320808574/refund-B3-07-bill-eye-and--1f0cc-missal-and-original-receipt/`, including failed PNG, trace, error context and persisted fixture state. Three fresh, unchanged test executions subsequently passed in `output/playwright/drill-focus-20261030-a/`, `-b/`, and `-c/`. The failure remains open as intermittent; these reruns are not a fix. Any application fix requires a separate proposal and approval.

Available persisted financial evidence for that failed UI case matches independent expectations: one bill 18000 paise, one refund expense 9000 paise, net drawer delta 9000 paise and stock movement net -1. See `finding-B3-07-financial-summary.json`. A product document was not included in the failure teardown, so current product quantity 19 is an expected value, not independently verified from that artifact. Do not infer an unrecorded stock balance from the screenshot.

## Outstanding acceptance gaps and improvements

- Automated independent browser contexts are used. Actual billing devices, owner phone, physical scanner/printer and installed-PWA behavior remain Not Run. Browser sessions block service workers, so they do not establish service-worker update behavior.
- Real full-stack IST midnight acceptance requires a timed run. Conditional skips must retain their reason in the final result matrix.
- The existing checkout concurrency case uses two different products, and the negative-stock case runs separately. They do not establish simultaneous purchase of the same last available unit. That specific automated race remains Not Run and is a proposed coverage addition beyond the 22 approved repairs; its expected stock outcome must respect the current negative-stock policy rather than assuming a new rejection rule.
- The date-range picker exposes a generic textbox name rather than its Date range purpose in the captured accessibility snapshot. The repaired check uses the current visible value. Improving the component's accessible label is a separate application change proposal.
- Low-priority usability observation: `PosBillView.tsx` still displays `createdByUid` directly below the recorder's name. The full run's `bill-view-desktop.png` shows this field with a synthetic UID. A separate presentation fix could put the technical UID under Details while retaining the recorder name and underlying audit identity.
- Build bundle warnings are measured separately in the static build log; a successful build is not workflow acceptance.
- This batch includes no commit, push, deployment or cloud configuration change. Production history, local business files and pre-existing work remain preserved.

The owned emulator/Vite processes were stopped using their stored and verified process identities. Required loopback ports were checked after shutdown. This completes the approved drill repair batch; broader maintenance and deployment acceptance still have the gaps recorded here.

Measured build sizes: main JavaScript 912.74 kB minified / 266.56 kB gzip; settings chunk 594.88 kB / 185.03 kB gzip. These are bundle-size observations, not measured device startup latency. Profiling an actual billing device should precede a source optimization proposal.

`coverage-preservation.json` in the focused run confirms every existing test title in the seven edited suites is retained and their skip-call counts are unchanged. A whole-drill `git diff --check` also identifies a pre-existing trailing space in `full-financial-acceptance.cjs:16`; the pre-batch patch records it. That runner was not edited by this batch.

## Manual and device acceptance instructions

The current stack binds to loopback and its SDK configuration uses loopback hosts. Another physical device cannot use those addresses to reach this computer. Device access is **Blocked** until an explicitly isolated device-access profile is prepared with reachable private endpoints, an exact demo project allowlist, secure origin where required, outbound-effect guards and separate fixture ownership. Verify the actual Auth/Firestore/Functions endpoints on every device before any write. A production URL is not a fallback.

| Scenario | Status | Steps once the prerequisite is satisfied |
| --- | --- | --- |
| Two billing devices and owner phone | Not Run | Sign in as three independent synthetic accounts; prove demo service identities on each. Seed exactly one unit of a synthetic item while no other scenario owns the fixture. Have both billers prepare quantity one, release both submissions together, and verify the server's documented stock policy with one set of persisted effects per accepted operation. Observe changes on the owner's phone. Repeat owner role-disable/change and approval actions while both billers remain active; reconcile all accepted/rejected writes. |
| Physical scanner | Not Run | Use barcode 00001 from the recorded synthetic fixture. Scan once and then twice rapidly, including the scanner's Enter suffix; verify product identity, quantity, price and focus. Scan an unknown code and a supported UPC/EAN equivalent. Confirm no bill is posted by scanning alone. Complete one controlled bill and reconcile its source/stock/payment exactly once. |
| Physical printer and debit note | Not Run | Print one synthetic bill and one Stock Return debit note. Compare item names, quantity, unit cost/price, independently computed total, date, short business reference, party/firm/GST fields and paper boundaries against persisted sources. Confirm reprinting does not post another return/payment or stock change. |
| Installed PWA, reconnect and older version | Not Run | Use a separate isolated build profile with service workers enabled. Install on real devices; retain an older version open on device A while device B loads a newer isolated build. Exercise refresh/restart, offline interruption and recovery. Verify state preservation, visible update behavior, server rejection of stale/invalid requests and no duplicate effects after retries. Capture worker/cache/build identities; the automated blocked-worker suite is not replacement evidence. |
| Real IST midnight and count expiry | Not Run | Schedule the existing isolated stack around 23:55-00:21 IST. Record actual server time and business date; execute before/after-midnight operations and independently reconcile their dated records. Separately run `node tests/drill/run.cjs resilience --grep 'COUNTER-08 AUD-01'` during 00:00-05:29 IST to exercise its actual IST/UTC disagreement condition. Use fresh run IDs and real elapsed reservation expiry; do not alter clocks or request.time. |

Record device/browser, role, starting fixture, actual endpoints, steps, expected independent arithmetic, outcome and photographs/screenshots for each manual run. If access or hardware is still missing, leave that row Blocked/Not Run.
