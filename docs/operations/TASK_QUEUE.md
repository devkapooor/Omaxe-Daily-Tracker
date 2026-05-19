# Task Queue

Use this file as the live execution queue and status board for the current AlphaHub baseline.

## Current Phase

V1 stabilization and disciplined release management for:

- `Dashboard`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Payment Planner`
- `Logs`
- `Settings`

## Current Snapshot

- Firebase Authentication and Firestore are the live foundations.
- The app is single-store only.
- The owner creates staff users from `Settings`.
- Directory management is centralized under `Directory`.
- Expense, vendor payment, purchase, and loan flows are grouped under `Register`.
- `Payment Planner` merges cheque deductions plus manual planned payments.
- Logs are centralized under owner-only `Logs`.
- Stable versions are now tracked with Git tags and release docs.
- The current production build is passing.

## In Progress

- [ ] Run a fresh post-V1 QA drill against the current live app shape.
- [ ] Decide whether bundle chunking is needed beyond the current green build.
- [ ] Keep docs aligned with every structural or workflow change.

## Backlog

- [ ] Add edit and delete flows for key finance records.
- [ ] Add stronger reusable validation helpers across forms.
- [ ] Add critical-path tests for finance summaries, payment allocation, and planner calculations.
- [ ] Improve narrow desktop and tablet QA coverage.
- [ ] Add export or download support where operationally useful.
- [ ] Evaluate whether `uiHelpers.ts` should be split further without creating churn.

## Done

- [x] Move the app to Firebase-first live data flow.
- [x] Replace public signup with owner-created staff accounts.
- [x] Consolidate navigation around dashboard, directory, register, cashout, movement, planner, logs, and settings.
- [x] Add shared searchable selectors for vendors and parties.
- [x] Add vendor outstanding tracking using unpaid purchases plus opening balances.
- [x] Add loan repayment allocation against oldest open loans.
- [x] Add daily cashout audit state and drawer-total persistence.
- [x] Add shared logs workspace for owner auditing.
- [x] Add payment planner using cheque schedules and manual planned payouts.
- [x] Clean up the source structure into app, features, shared, and store layers.
- [x] Tag the first stable release as `v1.0.0`.
- [x] Add release and rollback workflow docs.
