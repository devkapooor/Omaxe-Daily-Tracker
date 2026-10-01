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
- Treat all existing loan records, balances, calculations, and workflows as protected and immutable for this redesign.
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
- Independently verify the cheque workbook controls before deciding whether any cheque is eligible for the clean V2 starting position.
- Record every financial question requiring owner confirmation.

### Completion Gate

- Owner approves all decisions in the Financial Decision Register.
- Collection names, money units, event signs, source-of-truth boundaries, and cutover rules are unambiguous.
- Any workbook data proposed for V2 is independently verified; unreliable legacy vendor balances are not migrated. The open-cheque control and blank leaf range have been verified read-only.
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
- Preserve legacy vendor names and balances as read-only historical evidence, excluded from V2 calculations.
- Add an owner-only alias-review tool for new V2 vendors; legacy vendor records are not treated as reliable financial input.
- Add vendor details with empty V2 tabs ready for ledger, purchases, returns, and cheques.

### Completion Gate

- Existing Directory and Register selectors continue to work.
- Vendor identity tests cover aliases, inactive vendors, duplicate names, and legacy fallback.
- No outstanding balance or legacy vendor record is recalculated.

## Phase 4 - Purchase and Ledger Workflow

### Scope

- Add V2 invoice capture using vendor IDs and invoice facts only; purchase creation never embeds or mutates a payment.
- Enforce invoice-number uniqueness per vendor using deterministic reservation records.
- Post purchase ledger effects atomically with source records and idempotency keys.
- Add open-invoice views and derived balances without mutating invoice totals.
- Keep the V1 purchase flow active until the owner-selected clean-start date; prevent mixed V1/V2 posting after activation.

### Completion Gate

- Emulator tests prove atomic posting, retries, duplicate protection, corrections, and balance equations.
- V1 dashboard, planner, logs, and vendor totals remain unchanged while the feature flag is disabled.

## Phase 5 - Settlements and Allocations

### Scope

- Add vendor settlements as separate records rather than purchase mutations.
- Add optional invoice-linked payment allocations plus custom vendor-account payments with no invoice allocation.
- Add compensating corrections with actor, reason, source revision, and reversal reference.
- Integrate correction approvals with the Action Centre if selected in the Financial Decision Register.

### Completion Gate

- Tests cover opening positions, invoice-linked and custom payments, partial payments, overpayments, reversals, stale requests, and idempotent retries.
- Derived outstanding reconciles exactly from all ledger events; invoice balances reconcile from invoice-linked allocations only.

## Phase 6 - Cheque Book and Cheque Register

### Scope

- Add one shared cheque-book reservation and Cheque Register for vendor-payment and expense cheques, with global cheque-number uniqueness.
- Add Draft, Issued, Presented, Debited, Cancelled, and Bounced transitions.
- Post the owner-approved financial effect at the owner-approved lifecycle transition only.
- Add a responsive Cheque Register with searchable history and source links.
- Update Payment Planner to read active instruments from the unified Cheque Register without duplicating linked legacy sources.

### Completion Gate

- Lifecycle, stale revision, cancellation, bounce, leaf state, duplicate number, and planner deduplication tests pass.
- Existing expense accounting remains unchanged; cheque instruments are tracked in the unified register and remain visible in the Payment Planner.

## Phase 7 - Vendor Returns

### Scope

- Add return records and Pending, Vendor Credit, Replacement, and Rejected outcomes. Cash Refund is not supported.
- Apply financial effects only for owner-approved outcome rules.
- Post accepted vendor credits to the vendor ledger without invoice allocation, with compensating reversal behavior for corrections.
- Keep return descriptions free-text and do not change inventory quantities.

### Completion Gate

- Every outcome and partial accepted value is covered by tests.
- Replacement and rejected outcomes create no unintended monetary effect.
- Return outcomes never create cash-holder, Cash Movement, or bank-balance entries.

## Phase 8 - Clean-Start Toolkit and Dry Run

### Scope

- Build an owner-only, disabled-by-default clean-start tool that first produces read-only controls and reports.
- Do not reconstruct or migrate balances from unreliable legacy vendor, purchase, or payment data.
- Default every V2 vendor to zero outstanding and generate starting-position previews only for opening balances the owner explicitly enters and approves.
- Rehearse any approved starting-position records only in the Firebase Emulator Suite.
- Produce per-vendor opening controls and whole-system totals for the clean V2 starting position.

### Completion Gate

- Every proposed V2 opening value has an owner-approved source; legacy balances are excluded.
- The approved open-cheque controls, available leaves, and starting statuses reconcile.
- Re-running the clean-start preparation is idempotent.
- Production initialization remains disabled.

## Phase 9 - Cutover Candidate

### Scope

- Prepare rules-first and Hosting release artifacts with the feature flag still disabled.
- Run complete unit, integration, Firestore emulator, lint, TypeScript, and production-build checks.
- Run terminal-only, read-only production smoke checks.
- Prepare rollback instructions that disable V2 without deleting V1 or V2 evidence.

### Completion Gate

- Owner reviews the reconciliation report, release notes, rollback steps, and exact production actions.
- Deployment and production initialization remain separate explicit approvals.
- No production mutation occurs merely by deploying the inactive UI and rules.

## Phase 10 - Owner-Approved Cutover and Stabilization

### Scope

- Deploy only after explicit deployment approval.
- Initialize the clean V2 starting position only after separate explicit approval.
- Activate V2 only after post-import reconciliation succeeds.
- Monitor read-only controls and preserve V1 records and the cheque workbook as legacy evidence.

### Completion Gate

- V2 opening totals match the owner-approved clean-start controls.
- No Expenses, Loans, Cashout, Cash Movement, or unrelated financial records changed.
- Release is tagged and documented; rollback remains available without destructive writes.

## Financial Decision Register

No implementation phase may cross a decision marked `Pending`.

| ID | Decision | Status | Required before |
| --- | --- | --- | --- |
| FD-001 | Vendor outstanding decreases only when the cheque becomes `Debited`. `Issued` and `Presented` cheques remain visible in the vendor ledger as pending cheque commitments without changing outstanding. | Approved 2026-10-01 | Phase 1 sign rules |
| FD-002 | Cancelling or bouncing an `Issued` or `Presented` cheque automatically releases its reserved invoice allocations in the same atomic transition. | Approved 2026-10-01 | Phase 1 transition rules |
| FD-003 | Start V2 as a separate clean vendor workflow. Preserve legacy vendor data as read-only evidence, but exclude it from V2 calculations and do not migrate or reconstruct it. Exact activation date remains pending. | Partially approved 2026-10-01 | Phase 3 compatibility design |
| FD-004 | Every V2 vendor starts at zero outstanding. The owner alone may enter a separately verified opening balance; no legacy value is copied or calculated automatically. After recording, corrections use audited compensating adjustment entries and never overwrite the original opening entry. | Approved 2026-10-01 | Phase 4 ledger posting |
| FD-005 | Staff submit purchase, settlement, return, and cheque correction requests through the Action Centre. The owner may apply direct audited corrections without submitting a separate approval request. | Approved 2026-10-01 | Phase 2 permissions |
| FD-006 | Purchases and payments are always separate records that appear in one vendor ledger. After saving a purchase, a `Record payment for this invoice` shortcut opens Vendor Settlements with the vendor and invoice preselected. Cheques remain in the Cheque Register. | Approved 2026-10-01 | Phase 4 purchase UI |
| FD-007 | Vendor returns post as unallocated vendor-ledger credits and do not adjust individual invoices. Payments may be linked to a selected invoice for any amount up to its open value or entered as a custom unallocated vendor-account payment. | Approved 2026-10-01 | Phase 5 allocation rules |
| FD-008 | Vendors do not repay returns in cash. Remove `Cash Refund` as a supported return outcome; returns never create cash-holder, Cash Movement, or bank-balance entries. | Approved 2026-10-01 | Phase 7 return effects |
| FD-009 | Initialize cheque numbers 1120-1199 as the active available cheque book. Keep verified blank numbers 1200-1299 inactive and unavailable until the owner explicitly activates a future book. | Approved 2026-10-01 | Phase 6 cheque book |
| FD-010 | Include the 30 verified open cheques in V2 operational tracking. Workbook controls are 21 `Issued` totalling INR 182,192.30 and 9 `In Process` totalling INR 46,819; combined total INR 229,011.30, with no duplicate cheque numbers. | Approved 2026-10-01 | Phase 8 dry run |
| FD-011 | Maintain one unified Cheque Register for expense and vendor-payment cheques. Each cheque records its purpose and source link; cheque numbers are unique across both workflows. | Approved 2026-10-01 | Phase 6 planner integration |
| FD-012 | Confirm whether the clean V2 workflow activates for all vendors on one date or may activate vendor by vendor. | Pending | Phase 8 activation design |
| FD-013 | Custom payments are capped at the vendor's current positive outstanding. They cannot create a vendor advance or credit balance. | Approved 2026-10-01 | Phase 5 settlement validation |
| FD-014 | Imported legacy open cheques are tracking-only. Their status may be updated, but they never post to or reduce clean V2 vendor outstanding. Legacy `In Process` maps to V2 `Presented`. | Approved 2026-10-01 | Phase 6 legacy cheque behavior |
| FD-015 | Confirm how existing open expense cheques enter the unified register and whether they remain tracking-only while their source Expense records stay unchanged. | Pending | Phase 6 expense cheque transition |

## Phase 0 Findings

- Current purchases store mutable `paidAmount` and `unpaidAmount` values in rupees.
- Current vendor payments reduce `openingOutstandingRemaining` and purchase `unpaidAmount` values.
- Current vendor and payment relationships use names rather than stable vendor IDs.
- Payment Planner currently derives cheque commitments from existing expense and payment records.
- Shared workspace metrics derive vendor outstanding from the current mutable V1 fields.
- Adding V2 records without an explicit compatibility and cutover boundary would double count vendor balances and cheque commitments.
- The proposed design remains Spark-compatible if it uses Firestore client transactions, rules, indexes, and emulator-tested owner tooling without Cloud Functions.
- The owner has identified legacy vendor financial data as unreliable. It will remain preserved as read-only historical evidence but will not seed or influence V2 balances.
- Existing loan balances and all loan records, calculations, and workflows are protected and must never be changed by this redesign.
- The owner requires the verified open cheques from the workbook to remain visible in the new Cheque Register.

## Verified Cheque Workbook Controls

- Source file: `Daily-Liquidity-Payment-Planner.xlsx`
- Read-only verification date: 2026-10-01
- SHA-256: `10295B920CD635D634B977A705B84846B8608B91E10BAE225C72F134D0989F50`
- `Issued`: 21 cheques totalling INR 182,192.30.
- `In Process`: 9 cheques totalling INR 46,819.00.
- Combined open control: 30 cheques totalling INR 229,011.30.
- Open cheque numbers are unique and range from 1079 to 1119 with gaps.
- Blank cheque leaves: 180 unique numbers covering every number from 1120 through 1299.
- Blank leaves have no date, party, amount, or status populated.
- No open cheque number overlaps the blank 1120-1299 range.
- Active V2 cheque book: 80 available leaves numbered 1120-1199.
- Verified numbers 1200-1299 remain inactive source evidence and cannot be reserved or issued unless the owner explicitly activates a future cheque book.
- These controls verify workbook structure and totals only. They do not establish vendor opening balances or authorize an accounting effect in V2.
- Imported legacy open cheques are tagged as legacy tracking records and are excluded from all V2 vendor-ledger posting equations.
- Preserve each imported workbook status as source metadata; map `Issued` to V2 `Issued` and `In Process` to V2 `Presented`.
- Changing a legacy cheque to `Debited`, `Cancelled`, or `Bounced` updates operational status and history only; it creates no vendor settlement or reversal event.
- Tests must prove that all nine `In Process` records map to `Presented`, all 21 `Issued` records retain `Issued`, and every legacy status transition leaves V2 vendor outstanding and invoice balances unchanged.
- Tests must accept and uniquely reserve numbers 1120-1199, reject 1200-1299 while inactive, reject numbers outside the active book, and prevent duplicate leaf reservation under concurrent submissions.

## Approved Financial Behavior

### Cheque Effect on Vendor Outstanding

- `Draft`: no vendor-ledger visibility and no financial effect.
- `Issued`: show the cheque amount in the vendor ledger as a pending cheque commitment; do not reduce vendor outstanding.
- `Presented`: retain the pending cheque commitment in the vendor ledger; do not reduce vendor outstanding.
- `Debited`: post the settlement ledger event and reduce vendor outstanding exactly once.
- A pending cheque commitment is informational and must be excluded from the outstanding-balance equation.
- Invoice allocations attached before debit are reservations only. Their final accounting effect occurs on debit.

### Cancelled and Bounced Pending Cheques

- Cancelling or bouncing an `Issued` or `Presented` cheque automatically releases only that cheque's reserved invoice allocations.
- Because vendor outstanding is unchanged before debit, releasing a pending reservation creates no settlement reversal and does not alter outstanding.
- The status change and reservation release must be atomic and idempotent.
- Tests must prove that the release occurs exactly once, retries do not duplicate effects, unrelated allocations remain unchanged, and vendor outstanding remains unchanged.

### V2 Vendor Opening Balance

- Every newly created V2 vendor starts with zero outstanding.
- No legacy vendor, purchase, or payment amount may prefill or calculate the V2 opening balance.
- Only the owner may enter a separately verified opening balance.
- Owner-entered opening balances require actor, timestamp, and reason audit fields.
- A recorded opening balance is immutable.
- A later correction creates a compensating opening-adjustment ledger entry with actor, timestamp, mandatory reason, signed amount, and reference to the original opening entry.
- Tests must cover positive and negative adjustments, repeated submissions, authorization, and preservation of the original entry.

### Correction Authority

- Staff cannot directly alter posted V2 financial records.
- Staff correction requests are reviewed individually through the owner-only Action Centre.
- The owner may apply a direct correction without creating a separate pending approval request.
- Every approved request and direct owner correction records before and proposed snapshots, actor, reason, timestamp, source revision, resulting revision, and compensating ledger references where applicable.
- Tests must deny unauthorized direct writes, reject stale revisions and duplicate effects, and prove that owner corrections remain fully auditable.

### Separate Purchase and Payment Records

- A purchase records invoice facts and increases vendor outstanding; it never contains an embedded payment mutation.
- Cash, UPI, Card, and Bank Transfer payments are created as separate Vendor Settlement records.
- Cheque payments are created and managed through the Cheque Register and affect outstanding only when `Debited`.
- Purchases, settlements, and cheque events appear together chronologically in the vendor ledger.
- After saving a purchase, `Record payment for this invoice` opens Vendor Settlements with the vendor and invoice preselected; the user must still review and submit the payment separately.
- Allocations connect settlements to invoices and derive the remaining invoice balance without rewriting the purchase total.
- Tests must prove that retries and repeated shortcut use cannot duplicate a settlement or mutate the source purchase.

### Vendor-Level Credits and Flexible Payments

- An accepted vendor return posts one vendor-ledger credit and reduces net vendor outstanding without changing any invoice balance.
- An invoice-linked payment may pay the selected invoice in full or partially, up to that invoice's open amount.
- A custom payment reduces net vendor outstanding without selecting or changing an invoice.
- A custom payment must be greater than zero and cannot exceed the vendor's current positive outstanding at transaction time.
- Custom payments cannot create an advance or vendor credit balance.
- The vendor view must display net vendor outstanding, total open invoice value, and unallocated credits/payments separately whenever those figures differ.
- Invoice balances derive only from invoice-linked payments; vendor outstanding derives from all posting ledger events.
- Corrections use compensating ledger events and never rewrite the original return credit or payment.
- Tests must cover mixed invoice-linked payments, custom payments, return credits, exact-balance settlement, excess-payment rejection, concurrent submissions, idempotent retries, and the difference between invoice totals and net vendor outstanding.

### Supported Vendor Return Outcomes

- `Pending`: records the unresolved return with no financial effect.
- `Vendor Credit`: posts an unallocated vendor-ledger credit and reduces net vendor outstanding.
- `Replacement`: closes only when the replacement is recorded as received and has no monetary ledger effect.
- `Rejected`: closes with a mandatory reason and has no financial effect.
- `Cash Refund` is not available because vendors do not repay returns in cash.
- Return workflows cannot create or modify cash-holder balances, Cash Movement records, or bank balances.
- Tests must reject unsupported outcomes and prove that every supported return outcome leaves operational cash records unchanged.

### Unified Cheque Register

- Maintain one Cheque Register for every physical cheque, regardless of whether its purpose is `vendor-payment` or `expense`.
- Every cheque has one globally unique cheque number, one cheque-book leaf reservation, a purpose, and a source-record link.
- Expense records remain the source of truth for expense recognition and are not recalculated or rewritten by cheque status changes.
- Vendor-payment cheques follow the approved vendor-ledger rule and reduce vendor outstanding only when `Debited`.
- The Payment Planner reads pending instruments from the unified register rather than presenting separate cheque registers.
- Tests must prevent duplicate numbers across expense and vendor workflows and prove that an expense-cheque status change cannot create a vendor-ledger event.
