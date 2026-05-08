# Task Queue

Use this file as the live execution queue. Keep it current whenever code changes.

## Hard Rule

Every meaningful implementation change must also update:

- this task queue
- `ARCHITECTURE.md`
- `PLAN.md`
- any related supporting docs (`DATA_MODEL.md`, `CALCULATIONS.md`, setup docs, etc.)

If the code changed and the docs did not, the task is not done.

## Current Phase

Phase 1 hardening and structure cleanup on the Firebase-based single-store app.

## Current Snapshot

- React + Vite + TypeScript app is active.
- Firebase Authentication and Firestore are live foundations.
- App shell has been split into focused components.
- Data layer has been split into coordinator, actions, subscriptions, and shared helpers.
- Styles have been split into focused CSS modules with `global.css` as import hub.
- Shared top navbar with grouped desktop dropdowns and mobile expansion is live.
- Legacy browser-only data can be imported once into Firebase.

## In Progress

- [ ] Keep planning/architecture/supporting docs aligned with current implementation after every structural change.
- [ ] Reconcile any remaining stale MVP wording across docs as features evolve.

## Backlog

- [ ] Add edit/delete flows for key finance entries.
- [ ] Add stronger validation and error handling across all forms.
- [ ] Add a clearer unified reports/register experience.
- [ ] Add export/download support.
- [ ] Add tests for critical finance calculations and summary behavior.
- [ ] Add dashboard data-quality prompts for missing or suspicious inputs.
- [ ] Add responsive QA pass for tablet and narrow desktop layouts.
- [ ] Revisit chunk size and code-splitting if bundle growth continues.

## Done

- [x] Split monolithic app UI into focused reusable components.
- [x] Introduce shared `src/components/ui/navbar1.tsx` for the top navbar.
- [x] Replace flat top-bar links with grouped dropdown navigation while preserving current app styling.
- [x] Split the store layer into `appStore.ts`, `storeActions.ts`, `storeShared.ts`, and `storeSubscriptions.ts`.
- [x] Split the stylesheet into focused CSS files and keep `global.css` as the import entrypoint.
- [x] Add dashboard with range filter component (Today, Yesterday, Month To Date).
- [x] Add separate monthly sales projection component.
- [x] Add break-even outlook card using 25% margin against fixed expenses.
- [x] Rename Cashout register to Expense Register.
- [x] Add separate Cashout page for daily cash register details and balance.
- [x] Add Loans tab with entry form and persistence.
- [x] Add searchable/create-inline person and vendor name fields across forms.
- [x] Add purchase entry screen with minimal required fields.
- [x] Include logout action inside the shared navigation.
- [x] Build Settings page for owner and manager flows.
- [x] Add role-based login-first app access.
- [x] Move app persistence to Firebase Authentication + Firestore.
- [x] Keep single-store scope.
- [x] Add one-time legacy browser-data import path.

## Next Phase Plan

### Phase 2: Workflow Completeness And Controls

- [ ] Add edit/delete actions for expense register, purchase, vendor, loan, and transfer records where appropriate.
- [ ] Add reusable validation helpers for amount/date/required-field rules.
- [ ] Add clearer success/error/loading states around async actions.

### Phase 3: Reporting And Trust

- [ ] Add richer report and register views with filters.
- [ ] Add export/download workflows.
- [ ] Add finance-logic tests for totals, projections, and derived summaries.
- [ ] Add missing-data and anomaly prompts on the dashboard.

### Phase 4: Quality And Scale

- [ ] Review bundle size and split code if needed.
- [ ] Add broader responsive QA and layout polish.
- [ ] Add audit/change history where needed for edits and deletes.

## Working Rule For Future Tasks

When a task changes:

- file hierarchy
- component ownership
- navigation
- storage or auth flow
- domain model
- roadmap/priority

update the docs in the same change before closing the task.
