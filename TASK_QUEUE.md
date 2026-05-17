# Task Queue

Use this file as the live execution queue and status board.

## Current Phase

Stabilization and release-readiness after the workspace consolidation into:

- `Dashboard`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Logs`
- `Settings`

## Current Snapshot

- Firebase Authentication and Firestore are the live foundations.
- The app is single-store only.
- The owner creates staff users from `Settings`.
- Directory management is now centralized under `Directory`.
- Expense, vendor payment, purchase, and loan flows are grouped under `Register`.
- Logs are centralized under owner-only `Logs`.
- Vendor outstanding includes vendor opening balances plus unpaid purchases.
- Cheque details are supported on expense and payment flows.
- The production build is currently passing.

## In Progress

- [ ] Run a fresh end-to-end QA drill against the current consolidated navigation and logs structure.
- [ ] Decide whether bundle chunking is needed beyond the current green build.
- [ ] Keep the docs aligned with every structural change.

## Backlog

- [ ] Add edit and delete flows for key finance records.
- [ ] Add stronger reusable validation helpers across forms.
- [ ] Split `LogsPage.tsx` if the tab content grows further.
- [ ] Split `DirectoryPage.tsx` if vendor-management logic expands further.
- [ ] Add critical-path tests for finance summaries and payment allocation.
- [ ] Add export or download support.
- [ ] Improve narrow desktop and tablet QA coverage.

## Done

- [x] Move the app to Firebase-first live data flow.
- [x] Replace public signup with owner-created staff accounts.
- [x] Consolidate navigation around dashboard, directory, register, cashout, movement, logs, and settings.
- [x] Add shared searchable selectors for vendors and parties.
- [x] Add vendor outstanding tracking using unpaid purchases plus opening balances.
- [x] Add loan repayment allocation against oldest open loans.
- [x] Add daily cashout audit state and drawer-total persistence.
- [x] Add shared logs workspace for owner auditing.
- [x] Fix the current navigation config TypeScript build blocker.
- [x] Extract shared cheque-mode state into `src/components/useChequeDetails.ts`.
- [x] Extract shared stat card UI into `src/components/SummaryCard.tsx`.
- [x] Refresh the markdown documentation set for the current app shape.
