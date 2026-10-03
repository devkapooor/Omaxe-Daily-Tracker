# Roadmap

This is the single current plan and task queue for approved AlphaHub work, consolidated from PLAN, PLANNED_UPGRADES, and TASK_QUEUE on 2026-10-01. Preserve upgrade IDs and acceptance criteria when updating status. Historical deployment claims below come from the existing release record; cleanup does not reverify or change production data.

## Current product and priorities

- Single-store React/TypeScript PWA using Firebase Authentication and Firestore on Spark; installed launches still require internet for business data.
- Owner-created staff accounts; owner Dashboard, Action Centre and Logs; manager/owner Payment Planner; role-appropriate Settings.
- Vendor Workspace owns vendors, purchases, separate payments, invoices, returns, corrections, cheques and balances. Party Directory manages people; Register contains expenses and owner loan operations.
- Maintain financial write reliability, loan allocation correctness, user-ID cash ownership, planner consistency, and dependable Firebase sync.
- Keep main releasable with focused commits, reviewed deployments, version history, and rollback by redeploying a compatible known-good commit.
- Keep App orchestration focused, features under src/features, shared UI under src/shared, and auth/finance/settings actions in the store.
- Layouts adapt to viewport width through shared primitives, without device-specific implementations.
- Historical baseline tag: v1.0.0. Live Hosting: https://alphahub-f137b.web.app. Historical cash identity cutover: 2026-06-05.

## Current execution queue

- [x] Implement the approved source/document cleanup; source tests, lint, TypeScript/build, import/link checks and local HTTP pass. Rules tests remain blocked by missing Java; no rules were changed. See [cleanup evidence](../archive/PROJECT_CLEANUP_AUDIT_2026-10-01.md). Hosting deployment remains pending separate confirmation.
- [ ] Execute a current [QA checklist](./QA_CHECKLIST.md), with production read-only and all mutation scenarios isolated.
- [ ] Continue the outstanding UP-002/UP-004 work and UP-005 coverage below; finalized record-specific financial rules remain a prerequisite.
- [ ] Define missing/overdue operational signals separately before extending the Action Centre.
- [ ] Complete legacy cheque workbook import, conflict review and unified expense-cheque persistence only under a separately approved release.
- [ ] Preserve vendor purchase/return/cheque correction and opening-adjustment requirements that are not yet exposed by a complete live workflow.
- [ ] Investigate the reported dependency advisories separately without automatic upgrades.
- [ ] Review the public-repository PII/backups exposure separately. Owner chose report-only during cleanup.
- [ ] Restore the Java prerequisite for emulator checks if no existing runtime is available; do not install it as a cleanup side effect.

## Deferred maintenance and boundaries

- Evaluate bundle splitting, uiHelpers decomposition, reusable validation, and narrow-desktop/tablet coverage only when justified by a feature or defect.
- A cash-identity diagnostics/review screen may be considered if needed; never use it to authorize automatic live data repairs.
- Maintainability work keeps expenses and loans untouched and does not broaden financial scope.
- Multi-store, inventory, payroll, GST/tax workflows, offline financial writes, and backend job orchestration are outside the current approved scope.
- Legacy browser import, loan repayment allocation, shared searchable selectors, cashout audit persistence, user-ID cash ownership, release tags and PWA installability remain established functionality.

## Delivery Rules

- At the end of every approved implementation phase, create a dedicated Git checkpoint commit and a dated summary of scope, verification, review status, and known gaps. Do not deploy unless separately requested and confirmed.
- Loan safeguard: loans are strictly out of scope. Do not modify loan data or records, schema, calculations, workflows, permissions, or loan-specific UI. If a requested change or shared refactor would touch loan-specific code or behavior, stop and ask the user before proceeding. Automated checks must not mutate production loan data.
- Never modify, delete, migrate, backfill, or replace existing production financial records during development, testing, deployment, or upgrade work.
- Existing loan records, balances, calculations, and workflows are protected and must not be changed by planned upgrades.
- Treat production verification as read-only. Run every mutation test in the Firebase Emulator Suite or against clearly isolated non-production data.
- Allow production records to change only through a deliberate action by an authorized user in an approved live financial workflow; never run automated correction or cleanup writes against live data.
- Document how an upgrade preserves existing production data before implementation begins.
- Verify Firebase Spark compatibility before implementation. If any part requires Blaze, stop and document the reason, operating cost, and Spark alternative before requesting a separate decision.
- Deploy Firestore rules before UI changes that depend on tighter permissions.
- Keep implementation commits focused and update operational documentation with each release.
- Use non-destructive verification against production data; use tests or emulator coverage for mutation and permission scenarios.

## Approved Upgrade Batch

| ID | Upgrade | Priority | Planned release | Plan requirement | Status | Blaze required |
| --- | --- | --- | --- | --- | --- | --- |
| UP-001 | Permission hardening | Critical | Release 1 | Enforce owner, manager, and billing capabilities in Firestore rules; protect immutable identity and audit fields; add rules tests. | Deployed 2026-10-01 | No |
| UP-002 | Audited finance record corrections | Critical | Release 2 | Add owner-controlled correction or deletion flows for expenses, purchases, vendor payments, and cash transfers, with before/after snapshots and reasons. Loan records remain excluded and protected. | Partial: cashout and V2 settlement workflows implemented; remaining record types planned | No |
| UP-003 | Operations Action Centre | High | Release 3 | Build an owner-only approval hub first, then add missing cashouts, upcoming cheques, and overdue planned payments without adding dashboard clutter. | Approval phase deployed 2026-10-01 | No |
| UP-004 | Export Centre | High | Release 3 | Allow owner-filtered CSV downloads for sales, expenses, purchases, payments, cashouts, and cash movements, including the applied date range. | Planned | No |
| UP-005 | Automated finance and permission tests | Critical | Releases 1-3 | Cover dashboard totals, cash balances, payment allocation, correction workflows, date boundaries, and Firestore role enforcement. | Release 1 coverage deployed | No |
| UP-006 | Bounded and filtered Logs loading | High | Release 1 | Default Logs to the latest 7 days; provide 15, 30, and 90 day presets plus a custom date range; query only the active tab and paginate older records instead of downloading all history. | Deployed 2026-10-01 | No |
| UP-007 | Dashboard break-even progress | High | Dashboard batch A | Use the configured margin and monthly operating expense to show break-even sales, progress, amount remaining, and required daily sales for the selected month. | Deployed 2026-10-01 | No |
| UP-008 | Dashboard daily sales trend | High | Dashboard batch A | Add a compact daily sales trend for the selected month with a preceding-month overlay, controlled by the existing T, T-1, and T-2 selector. | Deployed 2026-10-01 | No |
| UP-009 | Dashboard recording health | High | Dashboard batch A | Show recorded-day coverage and latest sales and cashout dates without adding detailed records or Cash Movement calculations to the dashboard. | Deployed 2026-10-01 | No |
| UP-010 | Purchase, vendor, and cheque ledger redesign | Critical | Lean V2 finance release | Deliver a visible owner preview, operational ledger, and controlled clean start; preserve separately approved post-launch requirements. | Operational workspace, settlement approvals, returns, cheque display and planner integration implemented through 5777168; legacy import and broader corrections remain | No |

## Implementation Readiness

| Upgrade | Readiness | Next implementation step |
| --- | --- | --- |
| UP-001 Permission hardening | Deployed | Eight owner, manager, billing, disabled-user, and unauthenticated scenarios pass in the local Firestore emulator. |
| UP-005 Automated finance and permission tests | Release 1 coverage deployed | Permission tests and existing cashout correction tests pass; broader finance calculation coverage continues with later releases. |
| UP-006 Bounded and filtered Logs loading | Deployed | Shared IST range filtering, adaptive controls, incremental rendering, and bounded Settings Audit queries are live. Shared finance subscriptions remain intact where required for calculations. |
| UP-002 Audited finance record corrections | Partially implemented | Cashout and V2 settlement corrections exist. Finalize invariants for the remaining record types before implementation. |
| UP-003 Operations Action Centre | Approval phase deployed | Define missing and overdue rules separately before adding operational signals. |
| UP-004 Export Centre | Planned after Release 2 | Finalize export columns and role visibility; exports remain client-side and read-only. |
| UP-007 Dashboard break-even progress | Deployed | Formula, zero-margin state, current-month requirement, and completed-month behavior are covered by tests. |
| UP-008 Dashboard daily sales trend | Deployed | Responsive SVG trend aligns calendar days and preserves gaps where no sales record exists. |
| UP-009 Dashboard recording health | Deployed | Neutral sales and cashout coverage is shown without treating closed days as missing. |
| UP-010 Purchase, vendor, and cheque ledger redesign | Operational code implemented | Review [Vendor Ledger](../domain/VENDOR_LEDGER.md) for current behavior and remaining gaps. Activation state is read from Firestore; do not initialize or import data during maintenance. |

## Acceptance Criteria

### UP-001 Permission Hardening

- Firestore rules match the capabilities exposed to each role in the UI.
- Staff cannot directly update or delete protected financial records outside approved workflows.
- Audit history cannot be changed or deleted by ordinary staff.
- Emulator tests prove allowed and denied operations for owner, manager, billing, disabled, and unauthenticated users.

### UP-002 Audited Finance Record Corrections

- Every correction records the actor, reason, timestamp, before snapshot, and resulting values.
- Owner approval is required where staff request a correction.
- Related balances and allocations are recalculated atomically.
- Stale revisions and duplicate pending requests are rejected safely.

### UP-003 Operations Action Centre

- The owner-only queue handles cashout corrections, V2 settlement corrections and vendor return decisions with a live navigation badge.
- Pending approvals are processed individually, stale requests can be closed as outdated, and the latest 20 decisions remain visible.
- Source workflows retain their own collections and atomic approval actions through a reusable approval-item adapter.
- A later phase may add missing recent cashouts, upcoming cheques, and overdue planned payments after those rules are separately approved.
- The dashboard remains focused on monthly performance and current financial position.

### UP-004 Export Centre

- Exports respect collection, date range, and visible filters.
- Currency values, dates, record IDs, and audit identity fields are included in a consistent format.
- Exporting does not alter Firestore data and works on desktop and mobile browsers.

### UP-005 Automated Tests

- Domain calculations and high-risk financial actions have deterministic tests.
- Firestore rules have emulator coverage before deployment.
- Build, source ESLint, tests, and production smoke checks are required for each release.

### UP-006 Bounded and Filtered Logs Loading

- Opening Logs loads only the active tab and defaults to the latest 7 calendar days in Asia/Kolkata.
- Presets for 15, 30, and 90 days and a custom start/end range are available on every log tab.
- Older records load through pagination or an explicit `Load more` action; changing tabs does not eagerly query every tab.
- Search operates within the loaded date range and clearly displays the active range and result count.
- Current dashboard, cash, vendor, loan, and planner calculations remain complete and unchanged; any shared data dependency is separated from the bounded Logs query before global subscriptions are reduced.
- Required Firestore indexes are documented and deployed with the feature.

The full bounded-query behavior above remains an acceptance target: current source finance subscriptions are retained for complete calculations; range filtering and table pagination do not prove server-side pagination for every collection.

### UP-007 Dashboard Break-Even Progress

- Break-even sales are derived from the configured monthly operating expense and margin percentage; no production record is written or changed.
- The current month shows progress, amount remaining, and required average daily sales for the remaining calendar days.
- Completed months show final break-even attainment without a future-sales requirement.
- Zero or missing margin settings produce a clear unavailable state instead of division errors or misleading values.

### UP-008 Dashboard Daily Sales Trend

- The chart follows the shared T, T-1, and T-2 month selector and uses existing daily sales records only.
- The selected month and its immediately preceding month are aligned by calendar day for a fair visual comparison.
- Missing dates render as gaps or clearly identified no-record days rather than silently inventing financial values.
- The visualization remains compact and responsive without requiring separate mobile and desktop implementations.

### UP-009 Dashboard Recording Health

- The dashboard shows the number of days with recorded sales and cashouts plus the latest recorded date for each source.
- The first release uses neutral coverage wording and does not assume that every calendar day is a working day.
- Missing-day warnings remain disabled until store closure and holiday rules are explicitly approved.
- The status contains no holder balances, bank transfers, detailed logs, or Cash Movement calculations.

### UP-010 Purchase, Vendor, and Cheque Ledger Redesign

- Each phase follows start, check, resolve, validate, commit, and push before the next phase begins.
- Existing production financial records remain unchanged throughout development and clean-start rehearsals.
- New financial behavior is implemented only after its corresponding owner decision is recorded.
- V2 money is stored as integer paise while V1 rupee-number fields remain unchanged behind explicit compatibility boundaries.
- V2 initialization is blocked unless vendor-level and whole-system dry-run controls reconcile exactly.
- Deployment, production initialization, and feature activation are separate owner approvals.
- Current rules and implementation limits are in [Vendor Ledger](../domain/VENDOR_LEDGER.md). The complete phase sequence and original decision register are preserved in the [implementation archive](../archive/PURCHASE_VENDOR_CHEQUE_IMPLEMENTATION_2026-10-01.md).

## Release Order

This records the original batch ordering. Delivered Dashboard and Action Centre work is not undone by consolidating the plan; use current statuses above for execution.

1. Release 1: UP-001, the first UP-005 rules tests, and UP-006.
2. Release 2: UP-002 with its remaining correction and calculation tests from UP-005.
3. Release 3: UP-003 and UP-004 with end-to-end regression coverage.
4. Dashboard batch A: UP-007, UP-008, and UP-009 were deployed to Firebase Hosting on 2026-10-01.

## Deferred Suggestions

These are not part of the approved batch and require a future decision:

- Vendor payment aging with bill due dates and overdue balances.
- Customer credit ledger with customer-level sales, collections, and outstanding balances.
- Bundle splitting and expanded tablet or narrow-desktop QA beyond work required by the approved upgrades.
