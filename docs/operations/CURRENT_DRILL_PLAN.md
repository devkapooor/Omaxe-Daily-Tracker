# Current Drill Plan

## Purpose

This is the canonical current-state QA checklist for the live AlphaHub V1 baseline. Use this file for future manual verification passes after product, structural, auth, or deployment changes.

Archived drill files under `docs/archive/` are historical context only and should not be treated as the active checklist.

## Current Baseline

- Stable release tag: `v1.0.0`
- Live Hosting URL: `https://alphahub-f137b.web.app`
- Primary verification target: current production app behavior

## Pre-Drill Safety Notes

- Prefer using safe test accounts and test data where possible.
- If the drill is run against production, coordinate a safe window before write-path testing.
- Record every intentional write so it can be reviewed or cleaned up afterward.
- Capture screenshots or evidence for every failed or ambiguous step.

## Environment Options

- Live deployment at `https://alphahub-f137b.web.app`
- Local Vite session against the same Firebase project
- Local owner-only testing may use `VITE_LOCAL_AUTH_BYPASS=true`

## Required Roles And Accounts

- owner account
- manager account
- billing account
- at least one vendor test record
- at least one party test record
- ability to create temporary test records during the drill

## Pass / Fail Capture

For each phase:

- mark `Pass`, `Fail`, or `Blocked`
- record the exact failing step
- capture the role, device, and environment used
- link evidence paths or screenshots
- note whether the failure is release-blocking, moderate, or low severity

## Evidence Requirements

Collect evidence for:

- login and restricted-page behavior
- desktop sidebar and mobile drawer navigation
- at least one register save path
- one daily cashout entry
- one cash movement entry
- planner ingestion and manual plan behavior
- logs visibility
- PWA installability and offline-required messaging

## Phase 1: Authentication And Roles

1. Log in as owner.
2. Verify owner navigation and settings controls.
3. Log in as manager.
4. Verify manager page visibility.
5. Log in as billing.
6. Verify billing page visibility.
7. Attempt to open restricted pages directly where practical.

Checks:

- owner sees `Dashboard`, `Logs`, and `Payment Planner`
- manager sees `Payment Planner` but not `Dashboard` or `Logs`
- billing does not see `Payment Planner`, `Dashboard`, or `Logs`
- restricted pages fall back correctly
- disabled or deleted users lose workspace access
- password updates still work

## Phase 2: Navigation Integrity

Verify navigation on desktop and mobile for:

- `Dashboard`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Payment Planner`
- `Logs`
- `Settings`

Checks:

- active state is correct
- desktop sidebar remains usable in open and collapsed states
- mobile drawer remains usable
- page persistence lands on a valid page after refresh/reopen
- owner-only items do not leak to non-owner roles

## Phase 3: Directory Drill

### Vendor Tab

1. Create or edit a vendor.
2. Verify opening outstanding behavior.
3. Verify the vendor becomes selectable in purchase and vendor-payment flows.

### Party Tab

1. Add a party.
2. Verify the name becomes selectable in loan repayment and other relevant flows.

## Phase 4: Register Drill

### Expenses

Verify:

- expense saves successfully
- cheque mode requires cheque details
- expense appears in logs
- expense cheque entries appear in planner on the correct date

### Vendor Payments

Verify:

- payment saves successfully
- oldest vendor outstanding reduces first
- vendor outstanding totals update
- cheque mode works correctly
- cheque-mode vendor payments appear in planner

### Purchases

Verify:

- full, partial, and unpaid purchases save correctly
- unpaid amount persists correctly
- purchase appears in logs and affects vendor outstanding

### Loans

Owner only:

- save a loan
- save a loan repayment
- verify oldest open loan reduces first
- verify overpayment is blocked

## Phase 5: Cashout Drill

1. Save a daily cashout entry.
2. Verify modal cancellation does not save.
3. Verify final save persists drawer total and audit state.
4. Verify owner can review the entry from `Logs`.

Checks:

- `matched`, `cash-less`, and `cash-more` states behave correctly
- pending cash balances update
- latest closed-day dashboard summary updates

## Phase 6: Cash Movement Drill

1. Record person-to-person transfer.
2. Record person-to-bank transfer.

Checks:

- balances update correctly
- bank total updates correctly
- transfer history appears in logs
- movement affects cash balances but not planner entries directly

## Phase 7: Payment Planner Drill

1. Verify cheque expenses appear on the correct planned deduction dates.
2. Verify cheque vendor payments appear on the correct dates.
3. Add a manual planned payment.
4. Update the planner bank balance.
5. Delete a manual planned payment.
6. Verify availability and running balance calculations.

Checks:

- planner uses bank balance only for availability
- counter cash remains reference-only in planner
- planner does not alter cashout or cash-movement balances
- grouped schedule rendering remains readable

## Phase 8: Settings And Logs Drill

Owner:

- create staff user if safe to do so
- delete or disable staff user if safe to do so
- save projection settings
- verify logs visibility across all log sections

All roles:

- update own password

Checks:

- owner is not logged out during create-user flow
- settings audit updates
- logs remain owner-only
- settings restrictions remain correct

## Phase 9: Persistence And Cross-Device Sync

For each major entity type:

1. Create on desktop
2. Verify on mobile
3. Refresh both devices
4. Verify persistence

Entity list:

- vendor
- party
- expense
- vendor payment
- purchase
- loan
- loan repayment
- daily cashout
- cash transfer
- manual planned payment
- settings audit event

## Phase 10: Installability And Offline Messaging

1. Open the hosted app in Chrome on Android.
2. Confirm install prompt or Add to Home Screen eligibility.
3. Install the app.
4. Launch it from the home screen.
5. Confirm standalone shell behavior.
6. Turn internet off and reopen the installed app.
7. Confirm the app shows a clear online-required message.
8. Re-enable internet and confirm recovery.

## Reporting Output

When this drill is executed, save results in a dated report file such as:

- `docs/archive/Drill Report - YYYY-MM-DD.md`

Each report should include:

- exact timestamp
- environment URL
- roles tested
- devices and browsers
- flows executed
- findings
- screenshots or evidence paths
- final readiness recommendation
