# Drill findings and proposed fixes — 30 October 2026

Status: the shared financial banner presentation changes in Batch 2 are implemented locally. The user explicitly approved the detailed drill repair plan with APPROVE IMPLEMENTATION on 30 October 2026; batches D1-D4 are complete. All 22 repair targets passed. Full browser acceptance remains failed due to the separately recorded intermittent B3-07 focus issue. Application source fixes, deployment and cloud changes still require separate approval.

## Evidence and current interpretation

Run `maintenance-full-20261030` finished with 128 passed, 21 failed and 2 skipped checks, including the four smoke/preflight checks. Eighteen failures have evidence-backed stale drill assumptions and were excluded from the screenshot gallery only. Their original results, tests, screenshots and traces remain intact. They have not become passes; their intended scenarios need repaired tests and reruns.

Evidence is in `output/playwright/maintenance-full-20261030/`: `results.jsonl`, `failure-triage.json`, `TRIAGE.md`, `FAILURES.md`, screenshots and per-case traces. Local emulators were stopped after this run. Physical devices, native installation, printers and scanners remain unaccepted.

1. **F45-02 — bank expense:** `tests/drill/finance.spec.cjs:195` reads the expense collection immediately after clicking the submit button. The helper waits for the click, not the asynchronous financial operation. The captured page has a cleared amount field, which is consistent with a successful response after the premature read. This is evidence of an unreliable assertion, not yet proof that every expense posting is correct. The following missing-document assertions also expect `undefined`, whereas `safe-admin.cjs:54` returns `null`.
2. **F45-03 — cheque payable:** the test waits for the bank balance to equal its unchanged starting value before reading payable. That condition is already true before the debit finishes, so it cannot establish completion. The saved UI shows Debited while the earlier read returned the original payable. Suspected timing defect; financial correctness still requires a new independent persisted-state check.
3. **STK-04/UX-03 — product listeners:** the saved product queries are `barcode IN` the six Quick Add barcodes. They match `subscribePosQuickProducts` in `src/features/pos/data/posRepository.ts`. The test inspects all traffic from login onward and rejects any product query, including earlier POS activity. Current Stock's unfiltered query is disabled through `useCurrentStock` and `stockQueryEnabled`. The observed traffic does not demonstrate an unrestricted catalogue listener or a Current Stock leak.
4. **Financial recording banner — confirmed presentation defect:** `FinanceOperationBoundary.tsx` renders the same warning panel whenever a saved operation exists, including a normal request in flight. It shows recovery instructions and an unusable recovery button during routine saves. Its recording/recovering strings contain broken character encoding, as also shown in the user's screenshot. The recovery journal is deliberate: `financeRepository.ts` saves the intent before sending it and clears it after a confirmed response or an explicitly unposted rejection. The screenshot alone does not prove a failed payment or duplicate posting.

## Approved banner implementation and verification

Changed `src/features/register/components/FinanceOperationBoundary.tsx`: normal requests show compact neutral Saving... text; recovery warning/action appears when the result is pending without an active request; references are collapsed under Details; the recovered notice can be dismissed and is cleared when a new operation begins. The recovery journal, operation IDs, server posting and financial calculations were not edited. The shared component applies this presentation to each existing consumer.

Added F45-16 to the existing `tests/drill/finance.spec.cjs` suite specifically for this approved change. It holds a real successful response to inspect Saving, delivers it, commits a second real operation but drops its response, recovers the same request, checks independent amounts/drawer and dismisses the recovered notice through a reload. No existing drill failure assertion was repaired or deleted.

Evidence: `output/playwright/banner-20261030-approved/`.

| Check | Result | Evidence/meaning |
| --- | --- | --- |
| Component ESLint, application TypeScript, drill syntax | Pass | Source checks completed without errors. |
| Production build to this run's ignored build folder | Pass | Existing bundle-size warning remains. |
| ENV-01 actual endpoint isolation and outbound denial | Pass | Exact local demo project and emulators. |
| F45-16 approved banner and recovery behavior | Pass | `saving-neutral.png`, `recovery-required.png`, `result-recovered.png`; two expenses 5000 and 2500 paise; drawer delta -7500; no duplicate after recovery/dismissal. |
| R04/FT-03 logout blocked until recovery; mandatory count retained | Pass | Existing safety regression, unchanged. |
| F45-04 existing recovery/navigation regression | Fail | Recovery completed; then the test looked for Register's Amount field while the saved page snapshot showed POS after reload. Teardown independently found one 5000-paise expense and drawer delta -5000. This case passed in the earlier full run. |

F45-04 adds a proposed drill repair: await the actual recovery-triggered navigation/load before navigating to Register and reading the form. Its current `waitForLoadState('domcontentloaded')` can resolve on the old document before the reload begins. Keep financial invariants and record the timing as a hypothesis until rerun with deterministic navigation coordination. The existing test remains unmodified; its failed screenshot and trace are preserved.

Emulators were stopped after verification; loopback ports 8080, 9099, 5001, 4400, 4500 and 5178 were checked for remaining listeners. This evidence is automated browser acceptance of the banner, not physical-device or production verification.

## Approved drill repair plan

Implementation outcome: all 22 targets passed in focused reruns and again in the complete browser run. The full run had 148 passes, one unrelated focus failure and three skips, including its four successful smoke checks. Domain checks passed 160, Functions passed 119, and Rules/support checks passed 136 with the existing four loan exclusions. See [final repair results](drills/2026-10-30-drill-repairs-results.md) for the manifest, matrix, exact evidence paths, exclusions and reproduction results. No application behavior was changed by the drill repair batch.

Scope: repair the 21 failed checks from the original full run and the additional F45-04 navigation failure observed during banner verification. These are 22 distinct checks across two runs, not 22 failures from one run. Repair the existing cases in place. Exclusion from the gallery is not test retirement or a passing result.

### Batch D1 — financial completion and recovery navigation

| Case and exact file | Proposed change | Acceptance assertions retained or strengthened |
| --- | --- | --- |
| F45-02, `tests/drill/finance.spec.cjs` | Coordinate with the intended expense request and its successful response; wait for its persisted source before inspecting it. Replace missing-document `undefined` expectations with the Admin helper's `null` contract. | Exactly one 10000-paise bank-transfer expense, correct actor/method, zero drawer delta, no bank balance mirrors created. |
| F45-03, `tests/drill/finance.spec.cjs` | Replace the already-true bank-balance wait with completion of the captured debit operation and persisted Debited status. | Initial payable 100000 minus payment 20000 equals 80000 paise; invoice open amount 80000; reservation zero; one settlement/allocation/expense as applicable to the actual contract; no drawer effect; obsolete bank mirror unchanged. Retry the same captured request and require no duplicate effect. |
| F45-04, `tests/drill/finance.spec.cjs` | Register a wait for the actual recovery-triggered load/navigation before clicking Recover. Navigate to Register only after the new document is ready. | Recovery survives refresh, pending state clears, original expense remains exactly one at 5000 paise, drawer delta stays -5000, form resets. |
| F45-11, `tests/drill/financeFollowup.spec.cjs` | Use the missing-document null contract; inspect the downstream amount selector/text for the same stale encoding assumption before rerunning. | One recovered 30000-paise deposit; no mirror or drawer debit; independently verified held-cash remainder 70000 paise. |

Install request/response waits before the triggering action and match the intended operation. Use bounded condition polling for persisted state, not arbitrary sleeps. Do not globally change the existing expense helper to require a response: intentional lost-response tests need to reach recovery without a response. Capture persisted financial/stock state independently of the UI and application calculation helpers.

Run the affected finance cases after ENV-01. Repeat the repaired timing-sensitive cases in fresh fixtures to check that their result does not depend on request speed. Preserve any failure instead of extending timeouts until it passes.

### Batch D2 — valid GRN fixtures and calculated payable

All changes are in `tests/drill/stock.spec.cjs`.

- Make the standard complete-receipt fixture consistent: three units at 6000 paise each equals 18000 paise; stock rises from 20 to 23. Derive the fixture total from the final fixture lines after overrides using simple test-owned integer arithmetic.
- Keep the deliberate invalid mismatch fixture explicit in the currently passing B2-03/B2-04 scenario: invoice 100000 versus received 18000 without a credit note must still reject without writes. Its explicit confirmed credit-note counterpart must retain original invoice 100000, credit 82000, net payable 18000, and one stock/ledger effect after retry. Do not accidentally turn this negative case into a valid default fixture.
- Give the partial-payment reversal scenario its own complete receipt: 20 units at 5000 paise equals 100000 paise. Keep its payment 40000, remaining payable 60000, and vendor credit 40000 after reversal. Verify stock returns to its pre-receipt level and original source/payment history remains intact.
- UI cases must assert the read-only Calculated payable instead of filling the retired Full invoice payable input. For the stale-confirmation race, coordinate the owner's edit after the first confirmation is open; nine units at 6000 gives 54000 paise in the newer draft. The older confirmation must reject without stock or payable writes.

| Original failed case | Intent that must complete after fixture/UI repair |
| --- | --- |
| B2-02 authentication/malformed intent/cross-actor replay | Authorized draft can be saved; anonymous/forged actor/replayed cross-actor operations reject; no unintended ledger/stock writes. |
| B2-05 partial payment and owner reversal | Preserve the independent payment/balance/credit expectations above and immutable source records. |
| B2-07 stale catalogue and forged SDK writes | Save a valid draft first; then prove a newer catalogue revision and forged cost writes are rejected without partial effects. |
| B2-08/B2-09 owner review and price history | Valid receipt changes price; later correction survives owner review; price history has the expected distinct source entries. |
| B2-15/B2-18 actual Receive Stock UI | Scan, receive three units, assert calculated payable, confirm once, and open the persisted GRN. |
| B2-06/B2-18 lost submit acknowledgement | Commit a valid receipt, lose the real response, refresh and recover the original ID; one purchase/movement and stock +3. |
| B2-06 lost draft acknowledgement/account interruption | Valid draft commits before response loss; disabled account cannot recover; restored original account recovers the same draft with no stock/payable effect. |
| B2-15 stale GRN confirmation | Preserve the deliberate two-session revision race and require the stale confirmation to reject with no stock/payable effect. |
| B2-05/B2-18 reversal UI | Show independently expected reversal effects on a phone viewport; restore stock/prices correctly; retain source history and one reversal audit entry. |

Run the whole stock suite after this batch, including previously passing cases affected by the shared fixture. Downstream stale selectors discovered after setup is repaired may be corrected to match the current UI only when the original business assertions remain intact. Record newly exposed application failures separately.

### Batch D3 — current UI, dates and listener evidence

| Case and exact file | Proposed repair | Coverage retained |
| --- | --- | --- |
| DIR-01, `tests/drill/advanced.spec.cjs` | Expect the saved rename dialog to close, update the search term, then verify the renamed directory record and persisted name entry. | Create/search/rename real party; financial history and Loans unchanged. |
| VEN-01/VEN-02/VEN-03, `tests/drill/financial.spec.cjs` | Use Add Party / Vendor and Save vendor with current field labels. | Owner opening balance 100000 paise; staff nonzero opening denied without a record; permitted zero-opening vendor creation. |
| STK-01/STK-02/STK-03/STK-04/AUD-04, `tests/drill/remaining.spec.cjs` | Locate the exact barcode element inside its row instead of requiring the entire cell text to equal the barcode plus no business reference. | Exact barcode, zero/negative status, 50/14 paging, sort reset and lazy details. |
| GRN-03/GRN-06/GRN-07, `tests/drill/remaining.spec.cjs` | Use Show more matches in the searchable vendor picker; search for a vendor outside the initial 25 results. | Full directory search/paging, actual new-product receipt, received stock and payable 6000 paise, retired write path denied. |
| LOG-01/LOG-02/SET-01, `tests/drill/remaining.spec.cjs` | Enumerate current Vendor Workspace tabs including Vendors & Parties and Payment Corrections; exercise Returns under Stock > Stock Return; include current Business Identity settings tab. | Each relocated/current section is exercised; empty-source assertions remain. Relocation must not silently remove return coverage. |
| F45-14, `tests/drill/financeFollowup.spec.cjs` | Use distinct dates relative to the fixture's IST business date and explicitly select a range containing all three. Independently assert both sorting directions. | Three real dated source records, ascending/descending chronology and stable row identity. |
| STK-09/ACT-03, `tests/drill/resilience.spec.cjs` | Identify synthetic rows by unique seeded reason/visible data rather than hidden raw UUIDs; validate business references and persisted source identity where needed. | Tied-date 25/3 cursor pages, exactly 28 unique rows, stable Previous/Next and Action Centre history continuation without duplicates. |
| UX-02, `tests/drill/resilience.spec.cjs` | Construct the next calendar date from the fixture's IST date using explicit calendar arithmetic; do not use tomorrow's UTC date as tomorrow in IST. | Future cheque remains Issued after cancelling its confirmation dialog; accessible fields, keyboard behavior and no debit/payment effects. |
| STK-04/UX-03 listeners, `tests/drill/resilience.spec.cjs` | Record navigation/detail phase boundaries and track target additions/removals by target ID and query. Separate the six-barcode Quick Add query from unrestricted catalogue reads. | Quick Add targets detach on leaving POS; empty Current Stock makes no unbounded product query; required product/cost detail targets attach then detach; stock movement reads stay lazy. Unexpected subscriptions remain failures. |

Do not replace the listener assertion with a blanket allowance for product queries. Report the query constraints and lifecycle actually observed; do not claim production read savings from this local measurement.

### Batch D4 — coverage, complete rerun and evidence

Planned test edits are limited to these seven existing files: `tests/drill/finance.spec.cjs`, `tests/drill/financeFollowup.spec.cjs`, `tests/drill/stock.spec.cjs`, `tests/drill/advanced.spec.cjs`, `tests/drill/financial.spec.cjs`, `tests/drill/remaining.spec.cjs`, and `tests/drill/resilience.spec.cjs`. Reuse the existing helpers, suite runner and isolation guards. No parallel runner or dependency installation is planned.

Update `tests/drill/scenarios.json`, `drill.md`, and `docs/operations/QA_CHECKLIST.md` only where needed to describe the repaired paths/contracts and exclusions. Update this plan and the maintenance report with actual results, case-to-repair mapping, and evidence paths. Keep passing F45-16 banner coverage.

Execution after approval:

1. Record the current working-tree diff and affected paths; preserve earlier changes and evidence. Run syntax and existing drill lint checks.
2. Start the existing Node 22 guarded local emulators under a fresh run ID; verify every service identity and pass ENV-01 before business scenarios. Guard outbound effects and retain loan mutation exclusions.
3. Run the affected cases after each batch, then each affected full suite. One runner owns the shared fixture; independent sessions inside each race are coordinated deterministically.
4. Run the existing `full-financial-acceptance.cjs` static/support/browser modes using fresh evidence locations. The browser mode reuses `run.cjs all`, including its smoke gate and concurrency suites. Do not reset shared fixtures while another scenario is active.
5. Record Pass/Fail/Blocked/Not Run, screenshots, traces, persisted before/after state and independently calculated financial totals. Preserve original raw failures and new failures. Shut down owned emulators and verify released ports.

Acceptance: all 22 targeted checks execute their intended business scenarios; failures are resolved in the drill or documented as independently reproduced application defects. No failing assertion is removed merely to get a pass, no synthetic value is changed to match a wrong application result, and no new skip or service-worker claim is introduced. Physical-device/PWA/scanner/printer acceptance remains explicitly separate.

Recovery: undo only the approved batch's own patch hunks, not the user's or prior implementation changes. Keep original and new evidence directories. New drill results cannot overwrite prior runs.

Approval boundary: this request covers drill tests, synthetic fixtures, validation, and related documentation only. Application financial behavior, Functions, Rules, cloud configuration, production data, dependencies, commits/pushes and deployment are excluded. If repaired drills reveal an application defect, preserve its evidence and present a separate source-fix proposal before changing the application.

## Batch 2 — make routine saves clear

- During a normal request, use compact neutral Saving... feedback and the existing busy/duplicate-submit blocking. Remove recovery instructions, warning styling and recovery action from this in-flight state.
- Show the recovery warning when an operation remains pending without a confirmed result. Explain that the outcome must be recovered before another payment. Reuse the saved operation ID and payload.
- Put diagnostic UUIDs under expandable details rather than in the primary message; retain them for support and recovery.
- Replace the specific malformed recording/recovering text with valid labels. Inspect equivalent operation-status labels for the same encoding defect; avoid blanket file conversion.
- Make the recovered-success notice dismissible or clear it after acknowledgement so it does not repeat across unrelated tasks. Do not clear the pending journal as a presentation action.
- Inspect equivalent checkout, stock and cash-movement states before applying the same presentation rule. Keep their operation-specific recovery mechanisms and transaction boundaries.

Validation: normal success; slow response; confirmed rejection with no writes; successful write with lost response; recovery after refresh; double clicks; repeated recovery; account switching; denied local storage; two independent sessions. Assert exactly one financial/stock effect and no partial writes. Capture new screenshots of Saving, Recovery required, and Recovered states.

## Batch 3 — address only reproduced application defects

If an expense or cheque mismatch remains after proper completion waits, reproduce it with persisted before/after evidence and inspect the server transaction and journal. Propose the smallest source fix and necessary regression coverage before changing business rules. If listener targets remain active after their owning view is removed, trace their cleanup and fix the responsible subscription. Measure queries/targets rather than estimating savings from screenshots.

## Batch 4 — regression and acceptance report

Run affected unit/Functions/Rules checks for any source changes, then the complete isolated browser suite. Reconcile receipts, invoices, payments, allocations, stock movements, drawer and audit records independently. Report all raw results, corrected drill failures, confirmed app defects, and remaining manual/device gaps. Update the current maintenance report with implemented batches and evidence; retain its historical discovery snapshot.

## Recovery and boundaries

Keep existing unrelated working-tree changes. Reverse only each batch's own diff if needed. Keep raw evidence and local business files. No production mutations, loan mutations, package upgrades, deployment, push, cloud changes, history rewrite, journal deletion or financial-record backfill are included. UI changes must not change operation IDs, posting permissions, amounts, atomicity or retry behavior.
