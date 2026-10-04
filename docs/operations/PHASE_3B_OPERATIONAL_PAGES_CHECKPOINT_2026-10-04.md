# Phase 3B checkpoint — operational pages

Date: 2026-10-04
Status: User-reviewed and accepted locally ("looks good commit phase 3B")
Deployment: Deployed with the combined UI and cashier-handover release on 2026-10-04
Previous checkpoint: `16da39d` (Phase 3A)

## Completed

- Migrated Cashout, Cash Movement, and Payroll to the shared page-header/layout primitives and aligned their page positions.
- Cashout uses shared New Cashout/Corrections navigation. Removed the redundant latest-closed-day expense card.
- Added today's cash-paid expense total to the shared workspace metrics and fed it into Cash Expense (d). Manual edits are preserved; choosing a non-today date starts at zero for manual entry. Existing drawer counting, expected-cash formula, saving, and correction workflows remain intact.
- Cash Movement balances use the shared Card component, show user names and amounts, and remain in one horizontal row with narrow-screen scrolling.
- Recipient choices include all active users except the selected sender. Billing staff retain the existing own-balance sender restriction; manager/owner sender permissions remain unchanged.
- Bank destinations require Bank Deposit or CDM Machine. New transfers save optional `bankDepositMethod` metadata; creation rules validate the method. Existing historical records remain readable without migration.
- Cash Transfer Logs display and search the saved deposit method. Cash balance calculations continue to use the existing amount and destination fields.
- Cash Movement fields use two desktop rows: sender/destination (with bank method alongside destination), then amount/notes. Fields stack on narrow screens.
- Payroll uses shared navigation and month controls. Month-specific data stays hidden until the selected month's subscriptions have loaded, and invalid/empty month input is rejected.

## Verification

- Focused ESLint passed for changed application and rules-test files.
- `git diff --check` passed (line-ending notices only).
- App tests: 56 files, 299 tests passed.
- Live Firestore rules suite: 1 file, 30 tests passed on a temporary isolated emulator at port 18080. Coverage includes bank-method validation and billing transfers to another user while retaining sender restrictions.
- The standard rules command encountered an occupied port 8080; a broad retry also selected archived test copies under `output/`. The successful run explicitly excluded those copies and targeted `tests/firestore.rules.test.ts`. The existing emulator was left running; the temporary configuration was removed.
- `npm run build` passed, with the existing large-chunk advisory.
- Local server `http://127.0.0.1:5174/` returned HTTP 200. User accepted the local result after the requested refinements.

## Boundaries and remaining work

- No production deployment, record migration, or automated production write was performed.
- Loan records, schema, calculations, permissions, workflows, and financial effects were not changed.
- Existing untracked `.playwright-cli/`, `DESIGN.md`, `docs/design-references/`, and `output/` content is excluded from this checkpoint.
- New bank-deposit validation is a local rules change; any eventual release must include the reviewed rules update.
- Cross-page light/dark, narrow-width, focus, and scroll acceptance remains scheduled for Phase 3E.
- Phase 3C (Vendor Workspace, POS Test, Action Centre) is next and requires separate implementation approval.

## Finding this checkpoint later

Use `git log --oneline -- docs/operations/PHASE_3B_OPERATIONAL_PAGES_CHECKPOINT_2026-10-04.md` to locate its commit. The previous checkpoint is `16da39d`. Review either revision in a separate checkout before selecting a rollback; reverting code does not undo any user-entered financial records.

## Production readiness follow-up — 2026-10-04

- Release inspection found that the owner's selected-month display guard also hid employee salary slips. The guard now applies to owner month filtering; staff retain their subscribed salary-slip history.
- The new UI still requires Bank Deposit/CDM selection. Firestore validates the method when present and accepts older clients that omit it, allowing already-open production sessions to continue bank transfers during rollout. Sender permissions remain unchanged.
- Verification after these corrections: focused ESLint, 299 app tests, 30 live rules-suite tests on an isolated emulator, and TypeScript compilation passed.
- Production follow-up: Phase 3B shipped with the mandatory cashier-handover release on 2026-10-04. Live owner sign-in and the POS setup state were verified read-only after Hosting, Firestore rules, and indexes deployed successfully.
