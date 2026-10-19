# AlphaHub isolated drill

Current next step: [16 October financial remediation and release plan](docs/operations/drills/2026-10-16-financial-remediation-plan.md) — proposed after the full financial run; awaiting implementation approval. No deployment authorised.

Remediation proposal: [13 October 2026 prioritized fix plan](docs/operations/drills/2026-10-13-remediation-plan.md). Documentation only; no application fixes or deployment authorized.

Subsequent authorization: Batch 1 trusted checkout implemented locally after explicit approval; user UI review accepted on 13 October 2026. See [implementation and evidence](docs/operations/drills/2026-10-13-checkout-batch1.md) and [acceptance checkpoint](docs/operations/drills/2026-10-13-checkpoint.md). The user approved [Batch 2-A stock authority](docs/operations/drills/2026-10-13-stock-batch2-plan.md) on14 October and subsequently accepted its local UI review; its [local implementation/evidence/UI acceptance checkpoint](docs/operations/drills/2026-10-14-stock-batch2.md) retains the owner restitution failure and refund-dependent final fence. No deployment, commit or push is authorized.

The baseline drill scope/results below describe the original pre-remediation run. Subsequently approved implementation batches have separate source changes and dated reports; their passes do not replace original drill failures.

Next proposal: [14 October Batch3 immediate staff cash returns, void retirement and final stock-write fence](docs/operations/drills/2026-10-14-refund-batch3-plan.md). Includes remaining-quantity caps, automatic cash-only refund/expense reconciliation, owner notification without approval, complete new void retirement and read-only bill popup/eye action. Implementation approved on14 October; local implementation and emulator validation are complete; user UI accepted on 2026-10-15 (IST). See the [Batch3 execution/resume checkpoint](docs/operations/drills/2026-10-14-refund-batch3.md). Local UI acceptance is recorded on 2026-10-15 (IST); no commit, push or deployment authorized. Historical voids and original regression evidence remain preserved; retired positive void contracts require explicitly mapped replacement tests.

Baseline: `main` at `be3654c` (v1.5.2); working tree clean when discovery began. No applicable AGENTS.md found in repository or ancestors. Node24.14.1 (Functions emulator uses host24; configured production runtime20 is unchanged), npm11.11.0, Firebase CLI15.25.1, Java21.0.12.1. Playwright uses existing cached1.63.0 without project dependency changes. This baseline is not a result of this drill.

## Scope and boundaries

Documentation, test-only infrastructure/fixtures and execution only. Do not fix application behavior, deploy, upgrade dependencies, edit production environment/configuration, or mutate loan records. Use real app, real authentication/profile gates, unmodified Rules and Functions. Production `posSandboxes/test` is live business data; the same path is used ONLY inside new demo project `demo-alphahub-drill`. Every writer must fail closed unless project/hosts match. Existing mock-auth Stock preview is excluded from acceptance evidence.

## Prerequisites and startup (PowerShell)

Node/npm, Java21, installed Firebase CLI, existing app/functions dependencies and a cached Playwright installation. Tests never install/upgrade repository dependencies. Ports8080(Firestore),9099(Auth),5001(Functions),4400(hub),4500(logging),5178(Vite) must be free; preserve existing5174/5175/18080 review servers.

```powershell
node tests/drill/run.cjs start
node tests/drill/run.cjs smoke
node tests/drill/run.cjs financial
node tests/drill/run.cjs concurrency
node tests/drill/run.cjs remaining
node tests/drill/run.cjs advanced
node tests/drill/run.cjs closure
node tests/drill/run.cjs resilience
node tests/drill/run.cjs checks
node tests/drill/run.cjs report
node tests/drill/run.cjs stop
```

Separate `firebase.drill.json` and `tests/drill/vite.config.ts` define the demo environment. No production `.env` is loaded. No login bypass, mocked authentication, mocked price handlers or mocked application data source is allowed. Browser guard blocks ALL nonlocal traffic. Server guard blocks nonlocal outbound sockets in CLI/Functions/seed processes. Before each business write, record actual local Auth/Firestore/Functions requests and SDK project identity. Check saved records through an independent emulator Admin reader. Retain source/value snapshots for rejected operations. If any endpoint is missing or nonlocal, mark dependent tests Blocked; never fallback.

Reset: close all drill contexts, then `node tests/drill/run.cjs reset`. Reset verifies exact demo ID, loopback hosts, running emulator hub/project and that no loan records exist; otherwise abort. Never reset another project. Reset deletes only demo Auth/Firestore data and reseeds explicit synthetic fixtures. Neither create nor update a loan fixture. Each independent browser test resets its own demo baseline and uses independent contexts for users/computers.

## Synthetic data and independent arithmetic

Accounts owner, manager, billingA, billingB, disabled, missing-profile under `@drill.invalid`; password `DrillSynthetic123!` is test-only. Missing has Auth only; disabled has disabled profile. Owner/manager/billing get actual app permissions; no custom admin capability impersonation in browser. Dates explicitly recorded in IST; baseline2026-10-12, with execution's server-date stamp recorded independently.

Products A00001: quantity20, MRP10000, selling9000, cost6000 paise; B00002: quantity10, MRP5000,selling4500,cost3000. Zero00003 and negative00004 plus61 paging/long-label products. At least61 active vendors plus two core vendors. Initial vendors have zero balances. Opening/payable sources are created only in their scenarios. Counter fixture has no business bills and an open checkpoint100000 paise unless opening scenario requests closed mode. Scenario-specific expenses/daily sales/report records are explicitly seeded with paise-derived rupee amounts and IST dates. No loans are seeded. Financial expectations below use arithmetic written independently of app helpers: A2+B1=22500,5%=1125,total21375; cash A2 tender20000/change2000; GRNA3cost6000=18000; countA20->17 impact-18000; opening100000-payment50000=50000; cheque debit must apply exactly once. See fixture and captured records for exact IDs.

## Inventory and reconciled requirements

Current source pages: owner Dashboard, Action Centre, POS, Stock, Vendor Workspace, Party Directory, Register, Loans(read-only), Cashout, Cash Movement, Logs, Settings. Staff omit owner Dashboard/Action Centre/Loans/Logs. POS Billing/Dashboard/Bills; Stock Current Stock/Receive Stock/GRN History/Stock Audit/Stock History; Vendor Vendors/Payments/Invoices/Returns/Corrections/Cheques(owner)/Balances; Register Expenses; Cashout New Cashout/Corrections; Action Centre Pending/History; Logs eight source tabs; Settings Staff/Operations/POS/Announcements/Staff Notifications/Update Password(owner), restricted staff views. Inventory exact modal/tab source locations: [inventory.json](tests/drill/inventory.json). Coverage matrix below includes source/detail/edit/confirm dialogs under their parent workflows, plus shared confirmation/count/auth gates.

QA_CHECKLIST is historical guidance: it omits Stock in menus, says all added vendors have zero opening, describes Action Centre latest20 instead of current cursor history, suggests loan mutations, and states browser automation is outside cleanup. This task supersedes cleanup constraints and excludes loan mutation. FIREBASE_SETUP's no-Functions/Spark wording is outdated: current source has time, price/review and cash-transfer Functions; ROADMAP records existing Blaze. GRN MRP correction is retired; legacy evidence/view/reversal remains. Vendor purchases have repository support; their active entry point must be verified instead of invented. Loan and retired payroll/planner controls are not silently reactivated.

Historical tests/deployments and previous vulnerability probes are leads, not current results. Browser-owned POS/GRN/audit/vendor/Cashout/summary writes are architecture concerns; real Rules/API probes will distinguish allowed fraud from missing hardening. No fixes are applied in this drill.

## Baseline references and workflow inventory

See [baseline and access/write inventory](docs/operations/drills/2026-10-12-baseline.md) and [tab/modal source inventory](tests/drill/inventory.json), including overlays without dialog roles. Current source and approved checkpoints take precedence over outdated historical QA.

## Baseline references and workflow inventory

See [baseline and access/write inventory](docs/operations/drills/2026-10-12-baseline.md) and [tab/modal source inventory](tests/drill/inventory.json), including overlays without dialog roles. Current source and approved checkpoints take precedence over outdated historical QA.

## Baseline references and workflow inventory

See [baseline and access/write inventory](docs/operations/drills/2026-10-12-baseline.md) and [tab/modal source inventory](tests/drill/inventory.json), including overlays without dialog roles. Current source and approved checkpoints take precedence over outdated historical QA.

## Coverage matrix and status

Initial statuses below preserve the pre-execution plan. The dated report contains current statuses and evidence layers. Pass applies to the explicit asserted scope; unrun variants remain separately listed and never become workflow passes through a build/screenshot or API-only check.

| ID | Feature | Roles | Priority | Initial status |
|---|---|---|---|---|
| ENV-01 | Isolation and outbound-denial proof | all | P0 | Not Run |
| AUTH-01 | Real sign-in and role navigation | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-02 | Disabled and missing-profile gates | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-03 | Wrong password and unauthenticated access | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-04 | Remembered accounts, switching, refresh and logout | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-05 | Password reset and own password change | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-06 | Owner creates staff without losing session | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| AUTH-07 | Restricted saved-page/direct access attempts | owner/manager/billing/disabled/missing/unauthenticated | P1 | Not Run |
| COUNTER-01 | One opening count, two staff join | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-02 | Concurrent reservations and checkout blocking | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-03 | Count cancellation and recovery | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-04 | Reservation expiry | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-05 | Refresh while counting | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-06 | Mandatory logout and discrepancy review | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-07 | Cashout closes counter | owner and two independent staff sessions | P0 | Not Run |
| COUNTER-08 | IST date boundaries | owner and two independent staff sessions | P0 | Not Run |
| POS-01 | Barcode scan, duplicate scan and name search | billing/manager/owner | P0 | Not Run |
| POS-02 | Unknown barcode resolution | billing/manager/owner | P0 | Not Run |
| POS-03 | Cart quantity/remove and stock warnings | billing/manager/owner | P0 | Not Run |
| POS-04 | Billing discount limit and owner override reason | billing/manager/owner | P0 | Not Run |
| POS-05 | Cash tender/change checkout | billing/manager/owner | P0 | Not Run |
| POS-06 | UPI/card/split allocations | billing/manager/owner | P0 | Not Run |
| POS-07 | Concurrent checkout and stale product revision | billing/manager/owner | P0 | Not Run |
| POS-08 | Hold/resume ownership and refresh | billing/manager/owner | P0 | Not Run |
| POS-09 | Partial sellable returns and refund caps | billing/manager/owner | P0 | Not Run |
| POS-10 | Damaged returns | billing/manager/owner | P0 | Not Run |
| POS-11 | Void and stale approval decision | billing/manager/owner | P0 | Not Run |
| POS-12 | Bill history pagination/source/printing | billing/manager/owner | P0 | Not Run |
| POS-13 | Price changed after scan/rescan | billing/manager/owner | P0 | Not Run |
| POS-14 | Double-click/interrupted checkout | billing/manager/owner | P0 | Not Run |
| STK-01 | Barcode-only filter and idle state | owner/manager/billing | P1 | Not Run |
| STK-02 | Statuses and cursor pagination | owner/manager/billing | P1 | Not Run |
| STK-03 | Sorting and totals honesty | owner/manager/billing | P1 | Not Run |
| STK-04 | Details, direct Edit and listener lifecycle | owner/manager/billing | P1 | Not Run |
| STK-05 | Price validation for every staff role | owner/manager/billing | P1 | Not Run |
| STK-06 | Zero/equal price and before/after attribution | owner/manager/billing | P1 | Not Run |
| STK-07 | Stale revision and operation retry | owner/manager/billing | P1 | Not Run |
| STK-08 | Owner review does not reapply old price | owner/manager/billing | P1 | Not Run |
| STK-09 | Unified history trace/filter/duplicates | owner/manager/billing | P1 | Not Run |
| GRN-01 | Draft save/continue/delete and top-bar form retention | billing/manager/owner | P0 | Not Run |
| GRN-02 | Existing-product partial receipt/invoice link | billing/manager/owner | P0 | Not Run |
| GRN-03 | New product receive and price/quantity validation | billing/manager/owner | P0 | Not Run |
| GRN-04 | Duplicate and concurrent submissions | billing/manager/owner | P0 | Not Run |
| GRN-05 | Owner reversal and concurrent downstream changes | billing/manager/owner | P0 | Not Run |
| GRN-06 | Historical correction view and retired MRP correction | billing/manager/owner | P0 | Not Run |
| GRN-07 | Vendor picker pages/search/new vendor | billing/manager/owner | P0 | Not Run |
| AUD-01 | Physical count and evidence | billing/manager/owner | P1 | Not Run |
| AUD-02 | Missing cost and invalid counts | billing/manager/owner | P1 | Not Run |
| AUD-03 | Concurrent count and sale | billing/manager/owner | P1 | Not Run |
| AUD-04 | Audit history role and paging | billing/manager/owner | P1 | Not Run |
| VEN-01 | Zero opening vendor | owner/manager/billing | P1 | Not Run |
| VEN-02 | Owner nonzero opening payable | owner/manager/billing | P1 | Not Run |
| VEN-03 | Staff opening restrictions | owner/manager/billing | P1 | Not Run |
| VEN-04 | Purchase uniqueness and dates | owner/manager/billing | P1 | Not Run |
| VEN-05 | Partial/full payments and balances | owner/manager/billing | P1 | Not Run |
| VEN-06 | Overpayment and concurrent settlement | owner/manager/billing | P1 | Not Run |
| VEN-07 | Corrections approve/reject/withdraw/stale | owner/manager/billing | P1 | Not Run |
| VEN-08 | Vendor return credit and unsupported outcomes | owner/manager/billing | P1 | Not Run |
| VEN-09 | Cheque lifecycle, duplicate number and retry | owner/manager/billing | P1 | Not Run |
| VEN-10 | Balances/source history and legacy/activation limits | owner/manager/billing | P1 | Not Run |
| FIN-01 | Expense entry and source/logs | owner/manager/billing | P0 | Not Run |
| FIN-02 | Expense cheque modal cancellation | owner/manager/billing | P0 | Not Run |
| FIN-03 | Cash transfer permissions and idempotency | owner/manager/billing | P0 | Not Run |
| FIN-04 | Overlimit/concurrent transfer | owner/manager/billing | P0 | Not Run |
| FIN-05 | Cashout denomination and discrepancy | owner/manager/billing | P0 | Not Run |
| FIN-06 | Cashout confirm cancellation/window enforcement | owner/manager/billing | P0 | Not Run |
| FIN-07 | Eligible correction/approve/reject/withdraw | owner/manager/billing | P0 | Not Run |
| FIN-08 | Loan read-only navigation | owner/manager/billing | P0 | Not Run |
| ACT-01 | Pending feeds/badges/source details | owner/staff own permitted sources | P1 | Not Run |
| ACT-02 | Stale decision and source restrictions | owner/staff own permitted sources | P1 | Not Run |
| ACT-03 | History filters/pagination | owner/staff own permitted sources | P1 | Not Run |
| DASH-01 | Month totals/date selectors | owner and POS staff | P1 | Not Run |
| DASH-02 | POS payment mix and stock attention | owner and POS staff | P1 | Not Run |
| LOG-01 | Every active Logs tab and source navigation | owner | P1 | Not Run |
| LOG-02 | Date/name filters, sorting, columns and pagination | owner | P1 | Not Run |
| SET-01 | Role settings, operations and audit | owner/staff | P1 | Not Run |
| SET-02 | Synthetic announcement and notifications | owner/staff | P1 | Not Run |
| UX-01 | Desktop/phone/long labels/overflow | all permitted roles | P1 | Not Run |
| UX-02 | Keyboard/focus/modal dismissal/loading/errors | all permitted roles | P1 | Not Run |
| UX-03 | Offline/reconnect/interruption and subscriptions | all permitted roles | P1 | Not Run |
| PWA-01 | Manifest/service worker inspection | all | P1 | Not Run |
| PWA-02 | Native install/scanner/printer manual checks | all | P1 | Not Run |
| SEC-01 | Forged checkout total/discount/no stock deduction | owner/manager/billing/disabled/unauthenticated | P0 | Not Run |
| SEC-02 | Orphan refund event | owner/manager/billing/disabled/unauthenticated | P0 | Not Run |
| SEC-03 | Fabricated stock movement/quantity | owner/manager/billing/disabled/unauthenticated | P0 | Not Run |
| SEC-04 | Callable authorization and count locks | owner/manager/billing/disabled/unauthenticated | P0 | Not Run |
| SEC-05 | Direct permission matrix | owner/manager/billing/disabled/unauthenticated | P0 | Not Run |
| DIR-01 | Party Directory add/search/rename and read-only references | owner/manager/billing | P1 | Not Run |

## Scenario cards

### ENV-01 - Isolation and outbound-denial proof

Role: all; priority: P0; initial status: Not Run.

Preconditions: No business writes attempted; exact demo project and local services available.

1. Start exact demo emulators and separate Vite config. Before login assert project/Auth/Firestore/Functions SDK identities.
2. Sign in using Open Workspace and observe actual local Auth, Firestore and getServerTime requests. Attempt a nonlocal probe; require an abort.
3. Assert guarded Admin hosts and empty Loans. Abort dependent mutations if any service or isolation proof is missing.

Independent expected result: Auth requests target 127.0.0.1:9099; Firestore targets 127.0.0.1:8080/projects/demo-alphahub-drill; Functions target 127.0.0.1:5001/demo-alphahub-drill/asia-south1. Nonlocal requests are blocked; no bypass/mock gates.

Automation: [smoke.spec.cjs](tests/drill/smoke.spec.cjs). Resume with `node tests/drill/run.cjs all --grep ENV-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-01 - Real sign-in and role navigation

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/missing/unauthenticated; open real sign-in/profile/remembered/password screens and capture its canonical baseline.
2. Exercise "Real sign-in and role navigation" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Owner sees twelve pages including Loans; staff see eight operational pages, or seven when Cashout is hidden outside its permitted IST window. Only permitted profiles enter workspace.

Automation: [smoke.spec.cjs](tests/drill/smoke.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-02 - Disabled and missing-profile gates

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/missing/unauthenticated; open real sign-in/profile/remembered/password screens and capture its canonical baseline.
2. Exercise "Disabled and missing-profile gates" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Neither profile can reach business UI or read/write business records.

Automation: [smoke.spec.cjs](tests/drill/smoke.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-03 - Wrong password and unauthenticated access

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/missing/unauthenticated; open real sign-in/profile/remembered/password screens and capture its canonical baseline.
2. Exercise "Wrong password and unauthenticated access" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: No workspace or financial write; actionable login error.

Automation: [smoke.spec.cjs](tests/drill/smoke.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-04 - Remembered accounts, switching, refresh and logout

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. With a closed counter, sign in owner, refresh and log out. Separately test mandatory count when an open counter requires it.
2. Select remembered owner; assert password focus and no password in localStorage. Go Back, Use another account, then sign in manager.
3. Refresh the manager session and verify UID/role restrictions and owner-only navigation.

Independent expected result: Only email/name are remembered; password is focused on choosing an account; session survives refresh; staff logout requires count.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-05 - Password reset and own password change

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/missing/unauthenticated; open real sign-in/profile/remembered/password screens and capture its canonical baseline.
2. Exercise "Password reset and own password change" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Reset stays in Auth emulator out-of-band codes; updated password works and old password fails.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-06 - Owner creates staff without losing session

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Owner fills a synthetic Staff creation form and clicks Create User.
2. Inspect secondary Auth traffic; abort immediately if it is nonlocal. Never monkeypatch the application to mask a missing emulator connection.
3. On a safe local path verify Auth/profile/role/audit and retained owner login; otherwise record Blocked with the aborted request.

Independent expected result: Secondary Auth also uses emulator; one Auth account, matching profile/audit; owner remains signed in.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUTH-07 - Restricted saved-page/direct access attempts

Role: owner/manager/billing/disabled/missing/unauthenticated; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/missing/unauthenticated; open real sign-in/profile/remembered/password screens and capture its canonical baseline.
2. Exercise "Restricted saved-page/direct access attempts" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Staff cannot render owner Dashboard, Action Centre, Loans or Logs even with forged local navigation; backend enforces ownership.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUTH-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-01 - One opening count, two staff join

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Start with closed initialized counter. BillingA clicks Open Counter > Start Opening Count.
2. Enter two Rs500 notes, zero coins and machine values; save. BillingB joins independently.
3. Assert one opening reconciliation and both cashier states joined to the same opening ID. A second opening must be rejected.

Independent expected result: One opening reconciliation; both staff join the same counter ID without second counts.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-02 - Concurrent reservations and checkout blocking

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Join two real independent staff contexts; request simultaneous logout reservations.
2. Require one winner. Send a direct valid-shaped bill batch during the live count, with a matching no-reservation control.
3. Require server Rules denial and unchanged bill/sequence/stock/cash; do not accept a malformed-payload error as lock proof.

Independent expected result: Only one live reservation; server rejects prohibited bill/refund/Cashout writes; rejected records unchanged.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-03 - Count cancellation and recovery

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner and two independent staff sessions; open POS/shared-counter count dialogs and capture its canonical baseline.
2. Exercise "Count cancellation and recovery" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Counting user/owner can cancel; unrelated staff cannot; counter resumes.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-04 - Reservation expiry

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Reserve logout count and save ID/revision.
2. Age only the isolated synthetic startedAt beyond300000ms; attempt stale submit, then reserve again.
3. Assert stale rejection and new identity. Label the aged-fixture test separately from a real five-minute timed expiry.

Independent expected result: Expired server-start reservation no longer blocks; stale submit fails; no count is posted twice.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-05 - Refresh while counting

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner and two independent staff sessions; open POS/shared-counter count dialogs and capture its canonical baseline.
2. Exercise "Refresh while counting" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Same reservation resumes or explicit restart; no duplicate join/count.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-06 - Mandatory logout and discrepancy review

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Joined billing staff click Log out; require Logout Count dialog.
2. Enter two Rs500 notes and Rs5 coins, zero UPI/card; Save Count.
3. Read actual100500, expected100000, delta500 paise/pending review; cashier closes and shared counter stays open.

Independent expected result: Logout records physical totals once; discrepancy reaches owner; open counter survives for other staff.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-07 - Cashout closes counter

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner and two independent staff sessions; open POS/shared-counter count dialogs and capture its canonical baseline.
2. Exercise "Cashout closes counter" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: One closure links daily cashout/sales, clears machine totals as designed and requires a new opening.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### COUNTER-08 - IST date boundaries

Role: owner and two independent staff sessions; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Evaluate explicit times23:54:59,23:55,00:00,00:20:59 and00:21 IST.
2. Compare app date/window functions with independent expectations. Schedule separate local acceptance across real midnight for request.time.
3. Do not mock trusted server time or count domain checks as full-stack server acceptance.

Independent expected result: 2026-10-11T18:29:59Z is Oct 11 IST; 18:30:00Z is Oct 12. Server rejects unsupported dates; actual midnight behavior requires manual observation if no controllable server clock.

Automation: [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep COUNTER-08`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-01 - Barcode scan, duplicate scan and name search

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Barcode scan, duplicate scan and name search" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Two A scans plus one B: quantities 2/1, subtotal 22500 paise, leading-zero barcode exact; name search still supported in POS.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-02 - Unknown barcode resolution

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Unknown barcode resolution" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Unresolved cart cannot finalize; creation starts at zero stock and records actor; duplicate creation does not duplicate barcode.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-03 - Cart quantity/remove and stock warnings

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Cart quantity/remove and stock warnings" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Removing B leaves A subtotal 18000; zero/negative stock warnings remain usable; explicit supported negative-stock policy recorded.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-04 - Billing discount limit and owner override reason

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Billing discount limit and owner override reason" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 5% of 22500 is 1125, total 21375; billing >5% fails; owner/manager require override reason above limit.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-05 - Cash tender/change checkout

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Cash tender/change checkout" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: A x2 totals 18000; tender 20000, change 2000; cash ledger adds only 18000; stock A 20 ->18; one bill/source/movement per line.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-06 - UPI/card/split allocations

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "UPI/card/split allocations" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Payments sum exactly to bill total; split 9000 cash+4500 UPI for A+B totals 13500; no over/under allocation.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-07 - Concurrent checkout and stale product revision

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Concurrent checkout and stale product revision" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Independent sessions serialize product revisions; stale cart requires refresh; no lost stock or duplicate sequence.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-08 - Hold/resume ownership and refresh

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Hold/resume ownership and refresh" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Held lines/cart totals persist; permitted resume deletes/consumes once; cross-user access behavior recorded.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-08`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-09 - Partial sellable returns and refund caps

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Finalize two A at9000 paise each; capture bill, state, stock18 and cashNet18000.
2. Request one sellable unit with18000 refund and current IST refund date; owner attempts approval.
3. Require cap9000, no oversized refund and unchanged rejected sources; capture any accepted full refund as a financial failure.

Independent expected result: Returning one A refunds at most that line net after recorded discount/prior returns, stock +1; never defaults to whole unrelated bill value.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-09`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-10 - Damaged returns

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Damaged returns" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: No stock increase; bounded refund/source approval; history honestly labels bill-level no stock change.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-10`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-11 - Void and stale approval decision

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Void and stale approval decision" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Owner-only decision exactly once; full reversal deltas correct; stale source does not post.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-11`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-12 - Bill history pagination/source/printing

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Create eight real bills, open Bills and assert the first seven.
2. Load more; verify eight distinct rows. Open Reprint and inspect generated HTML with only native print/close suppressed for content capture.
3. Check item/quantity/total/operator. Native print dialog and physical printer remain manual, not acceptance passes.

Independent expected result: Newest seven initial records; Load more has unique stable refs; details trace source; physical printer requires manual check.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-12`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-13 - Price changed after scan/rescan

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Scan A at9000/revision1. A second session changes selling to9500 through the real price callable.
2. Finalize stale cart; require updated-product warning and no bill. Review retained quantity and finalize again.
3. Read one9500 bill, stock19 and exactly one movement; older prices must not post silently.

Independent expected result: New current price/revision cannot be paired with stale cart price at checkout.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-13`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### POS-14 - Double-click/interrupted checkout

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open POS > Billing/Bills/Dashboard and capture its canonical baseline.
2. Exercise "Double-click/interrupted checkout" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: At most one finalized bill and stock decrement for one intended operation; interrupted retry reconciles saved result.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep POS-14`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-01 - Barcode-only filter and idle state

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Barcode-only filter and idle state" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Blank +All makes no catalogue reads; exact 00001 returns A, partial/name/vendor strings do not fallback.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-02 - Statuses and cursor pagination

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Statuses and cursor pagination" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Zero/negative shown honestly; products limited to 50 and costs to matching ID groups <=30; reset filters resets cursor.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-03 - Sorting and totals honesty

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Sorting and totals honesty" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Supported ordering stable; MRP/cost/margin labelled page-only; no catalogue total inferred from loaded page.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-04 - Details, direct Edit and listener lifecycle

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Open Stock with blank barcode/All; inspect actual Firestore Listen traffic and idle state.
2. Filter00001 and open direct Edit. Keep Recorded movement history collapsed; then close details or leave workspace.
3. Verify only scoped product/cost detail targets start and detach through removeTarget; distinguish truly shared global dependencies.

Independent expected result: Two detail listeners only while open; movement history loads only expanded; inactive Stock tabs release unnecessary reads.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-05 - Price validation for every staff role

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Price validation for every staff role" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: MRP required; selling<=MRP, integer paise, reason 5..1000; invalid requests leave stock and evidence unchanged.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-06 - Zero/equal price and before/after attribution

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Zero/equal price and before/after attribution" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: MRP=0/selling=0 and equal values follow validation; accepted change stores exact before/after, actor and last editor.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-07 - Stale revision and operation retry

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Stale revision and operation retry" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: One price operation id has one stock revision/evidence; stale new intent rejected.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-08 - Owner review does not reapply old price

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Stock > Current Stock/Stock History and capture its canonical baseline.
2. Exercise "Owner review does not reapply old price" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Review marks evidence reviewed; a later product price remains unchanged; staff cannot review.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-08`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### STK-09 - Unified history trace/filter/duplicates

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Create real sale, price change and damaged-return sources in independent signed-in sessions.
2. Open Stock History: assert order, distinct source events, lazy details, barcode/event/date filtering and damaged bill-level exclusion label.
3. Use explicit28 tied-date synthetic history pairs for25+3 cursor pages. Label synthetic history-query testing separately from source posting.

Independent expected result: Receipts/sales/returns/audits/reversals/prices ordered by time+ID, no dual-source duplicates; damaged product-filter limitation explicit.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep STK-09`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-01 - Draft save/continue/delete and top-bar form retention

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Draft save/continue/delete and top-bar form retention" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Draft changes no stock/payable; Receive/GRN History switch retains form; source reload gives same vendor outside first catalogue page.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-02 - Existing-product partial receipt/invoice link

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Existing-product partial receipt/invoice link" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Receive A x3 at cost6000, MRP10000,sell9000: stock20->23; full invoice18000 paise payable once, linked reservation/source/ledger.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-03 - New product receive and price/quantity validation

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "New product receive and price/quantity validation" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: New SKU starts at received quantity; whole positive quantities, cost>0 and selling<=MRP; rejected writes unchanged.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-04 - Duplicate and concurrent submissions

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Duplicate and concurrent submissions" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Same draft/invoice does not add stock or payable twice; partial receipts share one full invoice payable.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-05 - Owner reversal and concurrent downstream changes

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Owner reversal and concurrent downstream changes" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Reversal qty -3 and payable -18000 once; staff prohibited; cost/price restoration limitations recorded rather than invented.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-06 - Historical correction view and retired MRP correction

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Historical correction view and retired MRP correction" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: No new GRN MRP correction action/writer; historical evidence readable; current price editor used instead.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### GRN-07 - Vendor picker pages/search/new vendor

Role: billing/manager/owner; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Receive Stock/GRN History and capture its canonical baseline.
2. Exercise "Vendor picker pages/search/new vendor" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Dropdown automatically loads bounded pages; selected vendor retained, case-sensitive prefix labelled, retry/stale responses safe.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep GRN-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUD-01 - Physical count and evidence

Role: billing/manager/owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Stock Audit and capture its canonical baseline.
2. Exercise "Physical count and evidence" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: A physical17 from20 changes -3, independent cost impact -18000 paise; reason/audit/movement/actor consistent.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUD-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUD-02 - Missing cost and invalid counts

Role: billing/manager/owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Stock Audit and capture its canonical baseline.
2. Exercise "Missing cost and invalid counts" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Explicit cost required where implemented; invalid fractional/negative quantity does not post.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUD-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUD-03 - Concurrent count and sale

Role: billing/manager/owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Scan A into audit at revision1 and enter physical17 before a competing sale.
2. A second staff session sells two A. Review & save, then Confirm and reconcile stale audit.
3. Require changed-stock rejection, quantity18 and zero audits; re-scan before a new count.

Independent expected result: Revisions prevent silent overwrite; accepted final quantity matches ordered source deltas.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUD-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### AUD-04 - Audit history role and paging

Role: billing/manager/owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as billing/manager/owner; open Stock > Stock Audit and capture its canonical baseline.
2. Exercise "Audit history role and paging" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Staff can count; owner-only batch history UI retained; details/items bounded and lazy.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep AUD-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-01 - Zero opening vendor

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Zero opening vendor" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: One vendor with opening0, no unintended payable.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-02 - Owner nonzero opening payable

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Owner nonzero opening payable" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Opening100000 paise stores immutable reason/date source+ledger+account exactly once.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-03 - Staff opening restrictions

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Staff opening restrictions" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Nonzero opening prohibited in UI and Rules for manager/billing.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-04 - Purchase uniqueness and dates

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Purchase uniqueness and dates" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Purchase18000 paise creates one invoice/reservation/ledger/account delta; duplicate conflict/date before activation rejected.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-05 - Partial/full payments and balances

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Partial/full payments and balances" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 100000 payable minus50000 payment =50000; final50000 ->0; allocations sum payment, separate invoice/vendor totals consistent.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-06 - Overpayment and concurrent settlement

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Overpayment and concurrent settlement" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: No overpay/lost balance across two independent requests; rejected sources unchanged.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-07 - Corrections approve/reject/withdraw/stale

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Create invoice100000 and partial payment50000. Request payment correction to40000.
2. Use separate request IDs for withdrawal, owner rejection, unauthorized staff approval and owner approval; retry approved request.
3. Require60000 invoice/account outstanding only after approval; immutable original payment stays50000 with10000 correction evidence.

Independent expected result: Original source immutable; revision and allocation deltas reconcile; own pending withdrawal only, owner approval only.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-08 - Vendor return credit and unsupported outcomes

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Vendor return credit and unsupported outcomes" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Accepted credit10000 reduces payable by10000; partial/reject reasons correct; no cash refund/loan effects.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-08`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-09 - Cheque lifecycle, duplicate number and retry

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Cheque lifecycle, duplicate number and retry" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 1120..1199 normalization/reservation; prepare/issue/present/debit/cancel/bounce authorized; one debit only; no fictitious invoice reservation claim.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-09`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### VEN-10 - Balances/source history and legacy/activation limits

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Vendor Workspace and its named tab and capture its canonical baseline.
2. Exercise "Balances/source history and legacy/activation limits" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Balances match ledger sums; active configuration not reinitialized; legacy records remain read-only; purchase-entry location/gaps explicitly reported.

Automation: [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep VEN-10`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-01 - Expense entry and source/logs

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Expense entry and source/logs" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Cash expense2500 paise (Rs25) stored with correct type/date/actor; totals reconcile.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-02 - Expense cheque modal cancellation

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Expense cheque modal cancellation" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Cancel records no expense/payment/cheque source.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-03 - Cash transfer permissions and idempotency

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Cash transfer permissions and idempotency" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Fixture holder100000 paise, transfer30000 ->70000; billing sender=self; repeated operation one record; bank/person identity preserved.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-04 - Overlimit/concurrent transfer

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Overlimit/concurrent transfer" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Total transfers cannot exceed100000; no orphan controls or balances after rejection.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-05 - Cashout denomination and discrepancy

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Cashout denomination and discrepancy" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 2xRs500+1xRs100+Rs5 loose =110500 paise; compare independent expected drawer; canonical sales/closure/actor/revision correct.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-06 - Cashout confirm cancellation/window enforcement

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Cashout confirm cancellation/window enforcement" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Cancel changes nothing; staff outside 23:55..00:20 IST blocked by UI and Rules; owner permitted.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-06`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-07 - Eligible correction/approve/reject/withdraw

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Seed explicit own Cashout: cash sales600rupees, drawer1000, revision1. Open Corrections.
2. Request sales650/drawer1050 with reason, withdraw first request. Resubmit; owner opens Action Centre, Approve and confirms.
3. Read revision2/source1050/linked sales650. Record staff-window, rejection and stale-approval subcases separately.

Independent expected result: Source identity/date fixed; eligible seven-calendar-day request scoped to own; adjusted holder/sales delta and audit exact.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-07`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### FIN-08 - Loan read-only navigation

Role: owner/manager/billing; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing; open Register/Cash Movement/Cashout and capture its canonical baseline.
2. Exercise "Loan read-only navigation" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Owner sees empty/read-only loan view; staff cannot read; no loan fixture, mutation, deletion, repayment or behavior changes.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep FIN-08`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### ACT-01 - Pending feeds/badges/source details

Role: owner/staff own permitted sources; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/staff own permitted sources; open owner Action Centre > Pending/History and capture its canonical baseline.
2. Exercise "Pending feeds/badges/source details" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Counts agree with independently queried pending sources; correct actors and oldest ordering.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep ACT-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### ACT-02 - Stale decision and source restrictions

Role: owner/staff own permitted sources; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/staff own permitted sources; open owner Action Centre > Pending/History and capture its canonical baseline.
2. Exercise "Stale decision and source restrictions" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Unauthorized/stale action posts no financial change; missing fields honestly unavailable.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep ACT-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### ACT-03 - History filters/pagination

Role: owner/staff own permitted sources; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/staff own permitted sources; open owner Action Centre > Pending/History and capture its canonical baseline.
2. Exercise "History filters/pagination" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 25-row cursor history/source joins lazy; stable unique ordering, badges update across sessions.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep ACT-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### DASH-01 - Month totals/date selectors

Role: owner and POS staff; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner and POS staff; open owner Dashboard or POS > Dashboard and capture its canonical baseline.
2. Exercise "Month totals/date selectors" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Synthetic Oct cash sales10000+UPI20000+card30000=60000 paise; expense2500; net57500; previous months explicitly seeded and selectors independent.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep DASH-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### DASH-02 - POS payment mix and stock attention

Role: owner and POS staff; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner and POS staff; open owner Dashboard or POS > Dashboard and capture its canonical baseline.
2. Exercise "POS payment mix and stock attention" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Totals include all dated bills/states; stock attention bounds/labels honest; refunds and voids not double counted.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep DASH-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### LOG-01 - Every active Logs tab and source navigation

Role: owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner; open owner Logs and each named source tab and capture its canonical baseline.
2. Exercise "Every active Logs tab and source navigation" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Sales/Expenses/Purchases/Payments/Daily Cashouts/Cash Transfers/Settings Audit/Stock Audits usable; no loan mutation.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep LOG-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### LOG-02 - Date/name filters, sorting, columns and pagination

Role: owner; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner; open owner Logs and each named source tab and capture its canonical baseline.
2. Exercise "Date/name filters, sorting, columns and pagination" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 7/15/30/90/custom IST boundaries and unique pages, no browser financial recalculation from truncated records.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep LOG-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SET-01 - Role settings, operations and audit

Role: owner/staff; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/staff; open Settings and its named role-restricted tab and capture its canonical baseline.
2. Exercise "Role settings, operations and audit" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Only owner can edit projection/POS/notice settings; staff password/staff-directory limits enforced in Rules.

Automation: [closure.spec.cjs](tests/drill/closure.spec.cjs), [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SET-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SET-02 - Synthetic announcement and notifications

Role: owner/staff; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/staff; open Settings and its named role-restricted tab and capture its canonical baseline.
2. Exercise "Synthetic announcement and notifications" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Owner publish audit, active staff notices, dismissal/expiry/window behavior; only emulator records.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [closure.spec.cjs](tests/drill/closure.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SET-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### UX-01 - Desktop/phone/long labels/overflow

Role: all permitted roles; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as all permitted roles; open affected app tab/modal at1440x1000 and390x844 and capture its canonical baseline.
2. Exercise "Desktop/phone/long labels/overflow" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: 1440x1000 and390x844 layouts usable, horizontal table scroll contained, navigation reachable.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep UX-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### UX-02 - Keyboard/focus/modal dismissal/loading/errors

Role: all permitted roles; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as all permitted roles; open affected app tab/modal at1440x1000 and390x844 and capture its canonical baseline.
2. Exercise "Keyboard/focus/modal dismissal/loading/errors" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Accessible focus/Enter/Escape, explicit loading/empty/error/retry; mandatory count cannot silently dismiss.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep UX-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### UX-03 - Offline/reconnect/interruption and subscriptions

Role: all permitted roles; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as all permitted roles; open affected app tab/modal at1440x1000 and390x844 and capture its canonical baseline.
2. Exercise "Offline/reconnect/interruption and subscriptions" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: No offline financial posting; reconnect real session/data; second context receives updates; stale responses/listeners do not multiply.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep UX-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### PWA-01 - Manifest/service worker inspection

Role: all; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as all; open local manifest/SW and native hardware (manual) and capture its canonical baseline.
2. Exercise "Manifest/service worker inspection" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Manifest/icons/SW caching semantics inspected; dev mode no install acceptance claim.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep PWA-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### PWA-02 - Native install/scanner/printer manual checks

Role: all; priority: P1; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as all; open local manifest/SW and native hardware (manual) and capture its canonical baseline.
2. Exercise "Native install/scanner/printer manual checks" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Not automated: Android installed app, physical scanner and printer require manual verification; not counted Pass.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs). Resume with `node tests/drill/run.cjs all --grep PWA-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SEC-01 - Forged checkout total/discount/no stock deduction

Role: owner/manager/billing/disabled/unauthenticated; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Authenticate billingA and join counter; UID stays billingA throughout.
2. Use actual checkout with catalogue9000 replaced by1; separately forge actor.role owner with99% discount. Probe direct bill/no stock source too.
3. Require server rejection and unchanged canonical state. Capture any accepted bill/price/discount/stock/cash/revision as original failure evidence.

Independent expected result: Rules reject catalogue-price mismatch,99.99% discount/no paired stock delta; no created bill or sequence.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs), [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SEC-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SEC-02 - Orphan refund event

Role: owner/manager/billing/disabled/unauthenticated; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Assert chosen synthetic bill/approval references do not exist.
2. Billing directly writes bill-return-approved event with refund500000 and those absent references.
3. Require Rules denial and no event; independently read saved event and impacted summaries.

Independent expected result: No refund allowed without valid approved bill/source; cashout/dashboard unchanged.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SEC-02`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SEC-03 - Fabricated stock movement/quantity

Role: owner/manager/billing/disabled/unauthenticated; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Capture A qty20/price9000/revision1 and empty price-change evidence.
2. Billing directly batches movement20->120 and product qty120/selling100/revision2 without GRN/bill/audit source.
3. Require rejection; preserve persisted product/movement and missing owner-review/last-editor evidence on failure.

Independent expected result: No arbitrary stock source or misleading actor accepted; quantity and source invariants enforced.

Automation: [financial.spec.cjs](tests/drill/financial.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SEC-03`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SEC-04 - Callable authorization and count locks

Role: owner/manager/billing/disabled/unauthenticated; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Obtain real local Auth tokens for disabled/missing/anonymous and active staff.
2. Call actual Functions with syntactically valid price/review/transfer payloads; probe owner-only decisions and count locks.
3. Require authorization/lock errors and unchanged sources. Payload validation before authorization is not itself a permission failure.

Independent expected result: Anonymous/disabled rejected; staff owner-only review denied; live reservation blocks prohibited server operations.

Automation: [concurrency.spec.cjs](tests/drill/concurrency.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SEC-04`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### SEC-05 - Direct permission matrix

Role: owner/manager/billing/disabled/unauthenticated; priority: P0; initial status: Not Run.

Preconditions: Fresh guarded demo fixture; real authenticated profile for the listed role; ENV-01 passed before business writes.

1. Sign in as owner/manager/billing/disabled/unauthenticated; open real SDK/HTTP permission probes and capture its canonical baseline.
2. Exercise "Direct permission matrix" using the current accessible controls, including the named rejection/retry variant. Follow the exact executable steps linked below.
3. Read source/state/ledger/stock/balance/actor/revision independently; compare this card's expected arithmetic and verify rejected/repeated writes leave no extra effect.

Independent expected result: Owner-only metadata/review/loans guarded; users cannot escalate role; own-source restrictions and rejected-state immutability verified.

Automation: [remaining.spec.cjs](tests/drill/remaining.spec.cjs), [resilience.spec.cjs](tests/drill/resilience.spec.cjs). Resume with `node tests/drill/run.cjs all --grep SEC-05`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

### DIR-01 - Party Directory add/search/rename and read-only references

Role: owner/manager/billing; priority: P1; initial status: Not Run.

Preconditions: Guarded demo fixture; real profile; ENV-01 local endpoint proof; no loan mutations.

1. Open Party Directory > Add Party and save Drill Synthetic Party.
2. View Parties; search Synthetic, open saved party and rename to Drill Renamed Party. Inspect record-derived references.
3. Read nameDirectory and verify financial history/empty Loans unchanged; distinguish saved editable names from view-only references.

Independent expected result: Saved party can be renamed; record-derived references remain view-only. Directory changes do not rewrite financial history.

Automation: [advanced.spec.cjs](tests/drill/advanced.spec.cjs). Resume with `node tests/drill/run.cjs all --grep DIR-01`.

Evidence: real roles/endpoints; canonical source values, actor/revisions and exactly-once assertions; screenshot/console/failed requests/trace on failure under `output/playwright/<run-id>/`. Redact passwords, tokens and OOB codes before sharing.

## Resumable execution checklist

- [x] Read baseline/instructions/source; preserve unrelated changes and production configuration.
- [x] Create root runbook before execution.
- [x] Prove actual local Auth/Firestore/Functions endpoints and outbound denial.
- [x] Smoke, finance/permission, concurrency/recovery and remaining active-feature batches; persist after each test.
- [x] Fresh scoped domain/Rules/Functions tests, source lint and build.
- [x] Final test-only lint, redaction, protected-file/diff checks and finding triage.
- [ ] Native Android install/scanner/printer and timed real-midnight checks.

Run browser batches sequentially: each test resets the same guarded demo baseline. Supporting suites use separate demo project IDs. The checks command excludes four historical Rules tests that write loan fixtures/payments and the loanMoney domain file. Current shared-counter test fixtures already reserve counts and supply current ID/revision to submitHandover; no assertion weakening was needed.

Run report: [2026-10-12 drill01](docs/operations/drills/2026-10-12-drill-01.md). Original failures and later infrastructure reruns retain distinct artifact folders. No application fixes, commits or deployment are included.

## Current financial acceptance rerun - 16 October 2026

User authorised the full financial test run after the local UI review. Current report: [16 October financial acceptance](docs/operations/drills/2026-10-16-full-financial-testing.md). Evidence: `output/playwright/2026-10-16-full-financial/`. Use Node20 and installed Java21; start `node tests/drill/run.cjs start`, then `node tests/drill/full-financial-acceptance.cjs static`, `support`, and `browser`. Browser suites must remain sequential. No loan mutation, production writes, dependency upgrades, commit, push or deployment. Previous statuses above describe the original drill, not this rerun.

### 16 October run completed with findings

133/143 distinct browser scenarios passed;7 failed and3 skipped (165 attempts including retained retries). Failures:4 application-related checks across3 issues,3 obsolete removed-feature contracts. Domain140+2 metrics, Functions93 and current financial/query Rules21 passed. Older Rules23 failed and4 loan-mutation cases were deliberately excluded; no green acceptance claimed. See the [full report](docs/operations/drills/2026-10-16-full-financial-testing.md) and [scenario matrix](docs/operations/drills/2026-10-16-financial-coverage.md). No application/production changes, commit, push or deploy in this test round.

Supported PowerShell resumption with existing installed tools (use one existing terminal; helpers hide child windows):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:Path = 'C:\Users\devka\AppData\Local\AlphaHubQA\node-v20.20.2-win-x64;' + $env:JAVA_HOME + '\bin;' + $env:Path
$env:DRILL_RUN_ID = '2026-10-16-full-financial'
# Start only if local services are stopped; occupied ports are preserved.
& 'C:\Users\devka\AppData\Local\AlphaHubQA\node-v20.20.2-win-x64\node.exe' .\tests\drill\run.cjs start
# Run supporting Rules before browser mutations to avoid local compilation contention.
& 'C:\Users\devka\AppData\Local\AlphaHubQA\node-v20.20.2-win-x64\node.exe' .\tests\drill\full-financial-acceptance.cjs support
& 'C:\Users\devka\AppData\Local\AlphaHubQA\node-v20.20.2-win-x64\node.exe' .\tests\drill\run.cjs finance-followup --grep F45-12
```

The final command intentionally remains failing until owner-bank read confidentiality is fixed. Do not bypass the endpoint guards, restore retired void/client writers, or use production posSandboxes/test for fixtures. Loans remain read-only.
