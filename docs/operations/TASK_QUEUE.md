# Task Queue

Use this file as the live execution queue and status board for the current AlphaHub baseline.

The approved future upgrade sequence is maintained in [PLANNED_UPGRADES.md](./PLANNED_UPGRADES.md).

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
- Cash ownership is now user-ID based for cashouts, transfers, and pending-balance calculations.
- Logs are centralized under owner-only `Logs`.
- Stable versions are now tracked with Git tags and release docs.
- The current production build is passing.

## In Progress

- [ ] Run a fresh post-V1 QA drill against the current live app shape.
- [ ] Decide whether bundle chunking is needed beyond the current green build.
- [ ] Keep docs aligned with every structural or workflow change.

## Backlog

- [ ] Deliver the approved upgrade batch in `PLANNED_UPGRADES.md`.
- [ ] Add stronger reusable validation helpers as part of the relevant approved workflow upgrades.
- [ ] Improve narrow desktop and tablet QA coverage.
- [ ] Evaluate whether `uiHelpers.ts` should be split further without creating churn.
- [ ] Add a dedicated admin-facing cash identity diagnostics or migration report screen if future live cleanup is needed.

## Done

- [x] Deploy Release 1 permission hardening with emulator-tested role enforcement.
- [x] Add adaptive 7, 15, 30, and 90 day Logs ranges with custom dates and incremental loading.
- [x] Establish viewport-driven responsive layout rules instead of device-specific implementations.
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
- [x] Replace active slot-based cash ownership with user-ID-based cash ownership.
- [x] Migrate live cashouts and cash transfers onto user IDs and clear unresolved legacy cash from active operations.
