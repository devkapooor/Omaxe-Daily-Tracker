# Purchase, Vendor, and Cheque Ledger Execution Plan

## Status

- Current phase: Phase 0 - architecture and financial decision gates
- Production financial writes: prohibited during development and validation
- Firebase plan: Spark-compatible; stop before implementation if a later requirement introduces a Blaze-only service
- Release method: complete, validate, commit, and push each phase before starting the next phase
- Deployment method: request owner confirmation separately after a release candidate is complete

## Non-Negotiable Controls

- Do not modify, delete, migrate, backfill, or reinterpret existing production financial records during development.
- Use the Firebase Emulator Suite or isolated non-production data for every mutation test.
- Treat all production checks and exports as read-only.
- Do not infer a financial meaning, opening balance, cheque state, allocation, return treatment, or cutover rule. Record the question and obtain owner confirmation first.
- Keep Expenses, Loans, Cashout, Cash Movement, and their calculations outside this redesign.
- Keep the current vendor workflow operational until the owner approves a reconciled cutover report.
- Never activate a new write path before its Firestore rules and emulator tests pass.
- Never deploy automatically. Commit and push completed phases; request confirmation before deployment.

## Phase Workflow

Every phase uses the same sequence:

1. **Start:** confirm scope, dependencies, financial decision gates, and a clean Git baseline.
2. **Check:** inspect current behavior and data contracts; run applicable tests before changing code.
3. **Resolve:** implement only approved behavior using emulator or isolated data.
4. **Validate:** run targeted tests, source lint, TypeScript build, Firestore rules tests when applicable, and review the diff for production-write risk.
5. **Commit:** create one or more focused commits with the phase documentation updated.
6. **Push:** push the validated commits to `origin/main`.
7. **Advance:** begin the next phase only when the current phase is complete and no unresolved financial decision affects it.

## Phase 0 - Architecture and Decision Record

### Scope

- Inventory current vendor, purchase, payment, cheque-planner, metrics, permissions, and Firestore rule behavior.
- Define V2 record boundaries without changing current runtime behavior.
- Define legacy compatibility, idempotency, uniqueness, revisions, corrections, and rollback.
- Independently verify the cheque workbook controls before treating them as migration facts.
- Record every financial question requiring owner confirmation.

### Completion Gate

- Owner approves all decisions in the Financial Decision Register.
- Collection names, money units, event signs, source-of-truth boundaries, and cutover rules are unambiguous.
- Workbook control totals and cheque-number ranges are independently verified.
- No application code or production data is changed in this phase.

## Phase 1 - Domain Foundation

### Scope

- Add V2 TypeScript domain types for vendors, purchases, returns, cheque books, cheques, ledger events, and allocations.
- Use integer `amountPaise` fields for new V2 financial records while preserving legacy rupee-number fields unchanged.
- Add pure converters at the V1/V2 display and compatibility boundary.
- Add deterministic identifiers, revision contracts, transition validators, balance equations, and allocation validators.
- Add unit tests for signs, rounding, transitions, stale revisions, idempotency, FIFO proposals, and over-allocation rejection.

### Completion Gate

- Pure domain tests, source ESLint, TypeScript, and production build pass.
- No Firestore writes, subscriptions, UI activation, or legacy calculations change.

## Phase 2 - Security and Persistence Foundation

### Scope

- Add capability fields to user records with owner override and explicit non-owner defaults.
- Add V2 collection repositories and transaction helpers behind a disabled feature flag.
- Add Firestore rules for capabilities, immutable identities, append-only ledger events, revision checks, and protected corrections.
- Add emulator coverage for owner, permitted staff, unpermitted staff, disabled users, and unauthenticated users.
- Prevent capability self-escalation and financial history deletion.

### Completion Gate

- Firestore emulator tests prove all allowed and denied paths.
- Feature flag remains disabled and no production V2 record exists.
- Rules are ready for a later rules-first deployment, but are not deployed without confirmation.

## Phase 3 - Vendor Identity Foundation

### Scope

- Upgrade the Vendor Directory UI to use stable vendor IDs and searchable aliases.
- Preserve legacy vendor names and balances as read-only compatibility data.
- Add an owner-only alias-review tool that creates no production mapping until explicitly confirmed.
- Add vendor details with empty V2 tabs ready for ledger, purchases, returns, and cheques.

### Completion Gate

- Existing Directory and Register selectors continue to work.
- Vendor identity tests cover aliases, inactive vendors, duplicate names, and legacy fallback.
- No outstanding balance or legacy vendor record is recalculated.

## Phase 4 - Purchase and Ledger Workflow

### Scope

- Add V2 invoice capture using vendor IDs and invoice facts only.
- Enforce invoice-number uniqueness per vendor using deterministic reservation records.
- Post purchase ledger effects atomically with source records and idempotency keys.
- Add open-invoice views and derived balances without mutating invoice totals.
- Keep the V1 purchase flow active until cutover; prevent mixed V1/V2 posting for the same invoice.

### Completion Gate

- Emulator tests prove atomic posting, retries, duplicate protection, corrections, and balance equations.
- V1 dashboard, planner, logs, and vendor totals remain unchanged while the feature flag is disabled.

## Phase 5 - Settlements and Allocations

### Scope

- Add vendor settlements as separate records rather than purchase mutations.
- Add FIFO allocation proposals, authorized overrides, partial allocations, and allocation reversals.
- Add compensating corrections with actor, reason, source revision, and reversal reference.
- Integrate correction approvals with the Action Centre if selected in the Financial Decision Register.

### Completion Gate

- Tests cover opening positions, partial payments, overpayments, reversals, stale requests, and idempotent retries.
- Derived outstanding reconciles exactly from ledger events and allocations in emulator fixtures.

## Phase 6 - Cheque Book and Cheque Register

### Scope

- Add cheque-book leaf reservations and unique cheque-number enforcement.
- Add Draft, Issued, Presented, Debited, Cancelled, and Bounced transitions.
- Post the owner-approved financial effect at the owner-approved lifecycle transition only.
- Add a responsive Cheque Register with searchable history and source links.
- Update Payment Planner to merge legacy expense cheques and V2 vendor cheques without duplication.

### Completion Gate

- Lifecycle, stale revision, cancellation, bounce, leaf state, duplicate number, and planner deduplication tests pass.
- Existing expense cheques remain unchanged and visible.

## Phase 7 - Vendor Returns

### Scope

- Add return records and Pending, Vendor Credit, Replacement, Cash Refund, and Rejected outcomes.
- Apply financial effects only for owner-approved outcome rules.
- Add allocation and reversal behavior for accepted credits and refunds.
- Keep return descriptions free-text and do not change inventory quantities.

### Completion Gate

- Every outcome and partial accepted value is covered by tests.
- Replacement and rejected outcomes create no unintended monetary effect.
- Cash refund behavior matches the owner-approved receipt and balance rules.

## Phase 8 - Migration Toolkit and Dry Run

### Scope

- Build an owner-only, disabled-by-default migration tool that first produces read-only exports and reports.
- Generate vendor alias candidates, duplicate/unmatched reports, opening-position reconstruction, cheque matches, and allocation proposals.
- Import only into the Firebase Emulator Suite until the owner approves the final reconciliation artifact.
- Produce per-vendor before/after controls and whole-system totals.

### Completion Gate

- Every vendor difference is zero or explicitly resolved by the owner.
- Workbook controls, cheque matches, available leaves, and imported statuses reconcile.
- Re-running the migration is idempotent.
- Production import remains disabled.

## Phase 9 - Cutover Candidate

### Scope

- Prepare rules-first and Hosting release artifacts with the feature flag still disabled.
- Run complete unit, integration, Firestore emulator, lint, TypeScript, and production-build checks.
- Run terminal-only, read-only production smoke checks.
- Prepare rollback instructions that disable V2 without deleting V1 or V2 evidence.

### Completion Gate

- Owner reviews the reconciliation report, release notes, rollback steps, and exact production actions.
- Deployment and production migration remain separate explicit approvals.
- No production mutation occurs merely by deploying the inactive UI and rules.

## Phase 10 - Owner-Approved Cutover and Stabilization

### Scope

- Deploy only after explicit deployment approval.
- Run production migration only after separate explicit import approval.
- Activate V2 only after post-import reconciliation succeeds.
- Monitor read-only controls and preserve V1 records and the cheque workbook as legacy evidence.

### Completion Gate

- Production totals match the owner-approved controls.
- No Expenses, Loans, Cashout, Cash Movement, or unrelated financial records changed.
- Release is tagged and documented; rollback remains available without destructive writes.

## Financial Decision Register

No implementation phase may cross a decision marked `Pending`.

| ID | Decision | Status | Required before |
| --- | --- | --- | --- |
| FD-001 | Vendor outstanding decreases only when the cheque becomes `Debited`. `Issued` and `Presented` cheques remain visible in the vendor ledger as pending cheque commitments without changing outstanding. | Approved 2026-10-01 | Phase 1 sign rules |
| FD-002 | Confirm whether a cancelled/bounced cheque reopens its original invoice allocations automatically or requires owner review. | Pending | Phase 1 transition rules |
| FD-003 | Confirm the authoritative V1-to-V2 cutover boundary: a fixed business date or an owner-controlled per-vendor cutover. | Pending | Phase 3 compatibility design |
| FD-004 | Confirm how current opening outstanding and open purchases should be represented in the V2 ledger without double counting. | Pending | Phase 4 ledger posting |
| FD-005 | Confirm whether V2 purchase, settlement, return, and cheque corrections require Action Centre approval or can be performed directly by users with correction capabilities. | Pending | Phase 2 permissions |
| FD-006 | Confirm whether an immediate payment entered with a purchase should support all payment modes or only create a linked non-cheque settlement. | Pending | Phase 4 purchase UI |
| FD-007 | Confirm whether vendor credit must allocate to the source invoice first and then FIFO, and who may override that order. | Pending | Phase 5 allocation rules |
| FD-008 | Confirm how a cash refund is received: cash drawer, bank receipt, or a selectable destination, and which workflow records that receipt. | Pending | Phase 7 return effects |
| FD-009 | Confirm whether cheque numbers 1120-1299 are a new available book and whether any imported open cheque uses a number in that range. | Pending verification | Phase 6 cheque book |
| FD-010 | Confirm the 30 imported cheque statuses and totals after independent workbook reconciliation. | Pending verification | Phase 8 dry run |
| FD-011 | Confirm whether legacy expense cheques remain permanently separate from the new vendor cheque register. | Pending | Phase 6 planner integration |
| FD-012 | Confirm whether production cutover is all vendors together or may occur vendor by vendor. | Pending | Phase 8 migration design |

## Phase 0 Findings

- Current purchases store mutable `paidAmount` and `unpaidAmount` values in rupees.
- Current vendor payments reduce `openingOutstandingRemaining` and purchase `unpaidAmount` values.
- Current vendor and payment relationships use names rather than stable vendor IDs.
- Payment Planner currently derives cheque commitments from existing expense and payment records.
- Shared workspace metrics derive vendor outstanding from the current mutable V1 fields.
- Adding V2 records without an explicit compatibility and cutover boundary would double count vendor balances and cheque commitments.
- The proposed design remains Spark-compatible if it uses Firestore client transactions, rules, indexes, and emulator-tested owner tooling without Cloud Functions.

## Approved Financial Behavior

### Cheque Effect on Vendor Outstanding

- `Draft`: no vendor-ledger visibility and no financial effect.
- `Issued`: show the cheque amount in the vendor ledger as a pending cheque commitment; do not reduce vendor outstanding.
- `Presented`: retain the pending cheque commitment in the vendor ledger; do not reduce vendor outstanding.
- `Debited`: post the settlement ledger event and reduce vendor outstanding exactly once.
- A pending cheque commitment is informational and must be excluded from the outstanding-balance equation.
- Invoice allocations attached before debit are reservations only. Their final accounting effect occurs on debit.
