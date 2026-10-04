# Phase 3C resume checkpoint — 2026-10-04

Status: In progress; local implementation is ready for the next user review.
Branch baseline: `main` at `4b93085` before the Phase 3C changes.

## Resume here

Resume the shared page-header/card-stack redesign at Phase 3C. The Vendor Workspace, POS (Test), and Action Centre layout migration is implemented locally. The user then asked to redesign the POS Test dashboard for staff use and clarified that T means today, T-1 yesterday, and T-2 two days ago. That daily dashboard implementation is now in place. The next step is to open the local server, review the latest POS Test dashboard, and make any requested refinements. Do not start Phase 3D until Phase 3C is reviewed and closed out.

## Current Phase 3C work

- Vendor Workspace and its pre-activation pages use shared page layout and header primitives. The redundant “Vendor Ledger V2” banner was removed.
- POS (Test) uses shared page layout and header primitives. Checkout has a 70/30 desktop split: scanner and cart on the left, full-height payment panel on the right. Customer fields use placeholders; Override Reason appears only when a manager/owner exceeds the configured discount limit. Cash, UPI, and Card have icons; Split Payments spans the panel; checkout actions sit at the bottom.
- Action Centre uses the shared header, page layout, and card stack. Its approval handlers and role boundary remain in place.
- POS Test dashboard now shows daily T/T-1/T-2 views, net sales, bill count, quantity sold, average bill, payment mix, refunds/discounts/voids/unresolved-item counts, top products, zero/negative stock, and recent bills. Dashboard calculations are read-only and use existing `posSandboxes/test` records. No low-stock threshold was invented.

## Files changed for this phase

- `src/features/action-center/components/ActionCenterPage.tsx`
- `src/features/pos/components/CheckoutPaymentPanel.tsx`
- `src/features/pos/components/PosDashboard.tsx`
- `src/features/pos/components/PosPage.tsx`
- `src/features/pos/domain/posDashboard.ts`
- `src/features/pos/domain/posDashboard.test.ts`
- `src/features/vendor-workspace/components/VendorLedgerCutoverPlanner.tsx`
- `src/features/vendor-workspace/components/VendorLedgerWorkspacePage.tsx`

## Validation already completed

- Earlier Phase 3C layout validation: repository ESLint passed, 93 tests passed, production build passed, and `git diff --check` passed.
- POS dashboard redesign validation: focused ESLint passed, its domain suite passed (6 tests), TypeScript compilation passed, and `git diff --check` passed.
- The production build passed before the final daily T/T-1/T-2 clarification; after that clarification TypeScript compilation and focused checks passed. Run the project validation again when closing the phase.
- Local browser review was stopped at the user's request to limit Playwright usage. Do not use Playwright for the next visual check unless the user asks; the user can review the open desktop browser directly.

## Safety and worktree notes

- No production deployment or migration was performed.
- POS Test uses live Firestore data in the isolated `posSandboxes/test` path; UI actions may write to that sandbox.
- At checkpoint creation, the eight source files above are modified and the branch is otherwise at `4b93085`. Pre-existing untracked `.playwright-cli/`, `DESIGN.md`, `docs/design-references/`, `firebase.rules-test.local.json`, and `output/` are unrelated and must remain untouched.
- This checkpoint is intentionally not marked accepted or deployed. Phase 3C needs user review of the redesigned dashboard.
