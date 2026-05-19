# Cross-Device QA Drill

## Purpose

This is the current drill plan for the live Firebase-backed app. It should be used for the next full verification pass after structural changes.

## Current Product Assumptions

- login is email/password only
- the owner creates manager and billing users from `Settings`
- the app is single-store
- the live source of truth is Firestore
- owner navigation includes `Dashboard`, `Directory`, `Register`, `Cashout`, `Cash Movement`, `Logs`, and `Settings`
- manager and billing do not have `Dashboard` or `Logs`
- `Register` contains expenses, vendor payments, purchases, and owner-only loans
- `Directory` contains vendor and party tabs
- `Logs` contains sales, expenses, purchases, payments, loans, daily cashouts, cash transfers, and settings audit
- cheque mode is available in expense and payment flows
- visible display dates should read as `DD/MM/YYYY`
- business-day logic follows `Asia/Kolkata`
- the app is installable from Chrome as a PWA
- installed launches are standalone but still require internet for live data

## Goal

Verify:

- role-based access works
- navigation stays coherent on desktop and mobile
- every write flow persists correctly
- linked summaries and logs refresh correctly
- cross-device sync stays truthful
- the current consolidated screens are visually stable
- the hosted app is installable from Chrome on mobile

## Test Rig

### Devices

- Desktop browser
- Mobile browser or reliable emulator

### Environment Options

- live deployment
- local Vite session against the same Firebase project
- local owner-only testing may use `VITE_LOCAL_AUTH_BYPASS=true`

## Phase 1: Authentication And Roles

1. Log in as owner.
2. Verify owner navigation and settings controls.
3. Create manager and billing users if needed.
4. Log in as manager.
5. Log in as billing.
6. Verify restricted pages fall back correctly.

Checks:

- owner sees dashboard and logs
- manager and billing do not
- deleted users lose access
- password updates still work

## Phase 2: Navigation Integrity

Check desktop and mobile navigation to:

- Dashboard
- Directory
- Register
- Cashout
- Cash Movement
- Logs
- Settings

Checks:

- active state is correct
- no dead ends
- mobile drawer or grouped nav remains usable
- owner-only items do not leak to non-owner roles
- installed PWA shell still lands on a valid page without browser chrome

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
- summaries update where expected

### Vendor Payments

Verify:

- payment saves successfully
- oldest vendor outstanding reduces first
- vendor outstanding totals update
- cheque mode works correctly

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

## Phase 7: Settings Drill

Owner:

- create staff user
- delete staff user
- save projection settings

All roles:

- update own password

Checks:

- owner is not logged out during create-user flow
- audit log updates
- settings restrictions remain correct

## Phase 8: Logs Drill

Owner only:

Verify filters, search, and visibility for:

- sales
- expenses
- purchases
- payments
- loans
- daily cashouts
- cash transfers
- settings audit

## Phase 9: Persistence And Sync

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

## Deliverables

After execution, update:

- `docs/archive/Drill Report.md`

Include:

- exact drill date and time
- environment URL
- roles tested
- devices and browsers
- flows executed
- sync observations
- installability observations
- findings
- screenshots or evidence paths
- final readiness recommendation

