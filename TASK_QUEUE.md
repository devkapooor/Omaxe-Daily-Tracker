# Task Queue

Use this file as the live execution queue. Keep it current whenever code changes.

## Hard Rule

Every meaningful implementation change must also update:

- this task queue
- `ARCHITECTURE.md`
- `PLAN.md`
- `DRILL.md`
- any related supporting docs when they become stale

If the code changed and the docs did not, the task is not done.

## Current Phase

Phase 2 hardening on the live Firebase-based single-store app, with an emphasis on workflow stability, compact UI, and maintainability.

## Current Snapshot

- React + Vite + TypeScript app is active.
- Firebase Authentication and Firestore are live foundations.
- Tailwind CSS v4 and shadcn-style local UI primitives are now the active UI layer.
- Login is email/password only.
- Public signup, pending request approval, and launch cleanup flows are removed from the live product.
- The owner creates users directly from `Settings`.
- The shared fixed top bar is live.
- The top bar now hides on downward scroll and reappears on upward scroll.
- Legacy browser-only data can still be imported once into Firebase.
- Dashboard summary derivations have been split out of `App.tsx` into `useDashboardMetrics.ts`.
- Register now handles expense, vendor payment, and loan payment.
- Purchase and register selectors are database-backed searchable lists only.
- Dashboard now includes a daily cashout review log.
- Loans now track repayment state and remaining balances.
- Visible app dates are standardized to `DD/MM/YYYY`.
- Business-day date logic now uses `Asia/Kolkata`.
- Dashboard range now uses only `Yesterday` and `Month To Date`.
- Register expense log now shows the full filtered list instead of a short recent-only slice.
- Monthly operational expenses are now owner-managed from Settings instead of hardcoded.
- Daily cashout now saves drawer total as the final cashout balance and records `Cash Less` / `Cash More` audit status.
- Purchases now support full, partial, and unpaid vendor balances.
- Vendor payments now reduce the oldest outstanding vendor purchases first.
- Dashboard now shows a live `Vendor Outstanding` total.
- Vendors page now shows vendor-level outstanding balances.

## In Progress

- [ ] Keep planning/architecture/drill/supporting docs aligned with the live implementation after every structural change.
- [ ] Continue trimming dead code and stale configuration whenever old flows are retired.

## Backlog

- [ ] Add edit/delete flows for key finance entries.
- [ ] Add stronger validation and error handling across all forms.
- [ ] Add clearer reports/register views with filters.
- [ ] Add export/download support.
- [ ] Add tests for critical finance calculations and summary behavior.
- [ ] Add dashboard data-quality prompts for missing or suspicious inputs.
- [ ] Add broader responsive QA for tablet and narrow desktop layouts.
- [ ] Revisit chunk size and code-splitting if bundle growth continues.
- [ ] Keep reducing large files where there is a clean seam for extraction.

## Done

- [x] Migrate the app to Tailwind/shadcn-style structure with `src/components/ui` primitives.
- [x] Replace the old navbar with the shared hover-gradient fixed top bar.
- [x] Add shared glow background and animated login hero treatment.
- [x] Remove public signup flow from the live product.
- [x] Move user creation to owner-only `Settings`.
- [x] Remove pending request and launch cleanup UI from `Settings`.
- [x] Keep password update available from `Settings`.
- [x] Split the store layer into `appStore.ts`, `storeActions.ts`, `storeShared.ts`, and `storeSubscriptions.ts`.
- [x] Move app persistence to Firebase Authentication + Firestore.
- [x] Keep single-store scope.
- [x] Add one-time legacy browser-data import path.
- [x] Add dashboard with range filter component.
- [x] Add monthly sales projection and break-even support.
- [x] Add separate expense register, cashout, purchase, vendors, loans, cash movement, and settings flows.
- [x] Make cash movement display dynamic user labels instead of stale placeholder names.
- [x] Extract dashboard derivations into `src/app/useDashboardMetrics.ts`.
- [x] Perform safe dead-code cleanup for retired signup-era and bootstrap-era code paths.
- [x] Add scroll-aware top navigation hide/reveal behavior.
- [x] Split cashout into a daily-details step and a drawer-particulars modal step.
- [x] Add dashboard daily cashout log with date and user filters.
- [x] Add repayment-aware loan ledger and loan payment register flow.
- [x] Replace register and purchase datalist fields with strict searchable Firestore-backed selectors.
- [x] Replace user disable/restore with owner-driven delete from account directory.
- [x] Add vendor-ledger style outstanding tracking using purchase unpaid balances plus vendor-payment allocation.
- [x] Add IST-based business-date handling for dashboard and shared formatters.
- [x] Add cashout audit status based on system-audit vs drawer-total comparison.

## Next Phase Plan

### Phase 3: Workflow Completeness And Controls

- [ ] Add edit/delete actions for expense register, purchase, vendor, loan, and transfer records where appropriate.
- [ ] Add reusable validation helpers for amount/date/required-field rules.
- [ ] Add clearer success/error/loading states around async actions.

### Phase 4: Reporting And Trust

- [ ] Add richer report and register views with filters.
- [ ] Add export/download workflows.
- [ ] Add finance-logic tests for totals, projections, and derived summaries.
- [ ] Add missing-data and anomaly prompts on the dashboard.

### Phase 5: Quality And Scale

- [ ] Review bundle size and split code further if needed.
- [ ] Add broader responsive QA and layout polish.
- [ ] Add audit/change history where needed for edits and deletes.

## Working Rule For Future Tasks

When a task changes:

- file hierarchy
- component ownership
- navigation
- styling system
- storage or auth flow
- domain model
- roadmap/priority

update the docs in the same change before closing the task.
