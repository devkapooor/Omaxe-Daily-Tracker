# Cross-Device QA Drill

## Purpose

This drill validates the current live product:

- login and session behavior
- owner-created user flow
- all major data-entry surfaces
- cross-page derived updates
- desktop/mobile sync behavior
- desktop/mobile visual integrity

This is a planning document only. It does not imply the drill has been executed.

## Current Product Assumptions

The drill must reflect the current app behavior:

- public signup does not exist
- the owner creates users from `Settings`
- owner, manager, and billing are the active roles
- the app is Firebase-backed and single-store
- the UI uses a fixed top bar rather than dropdown menu groups from older docs
- the top bar now hides on downward scroll and returns on upward scroll
- the register supports `Expense`, `Vendor Payment`, and `Loan Payment`
- visible dates in the app should render as `DD/MM/YYYY`
- business-day date logic should follow `Asia/Kolkata`
- the cashout flow is two-step and ends with a drawer-particulars modal
- the dashboard includes a daily cashout review log
- monthly operational expenses are owner-managed from `Settings`
- the dashboard range uses `Yesterday` and `Month To Date`
- purchases can be fully paid, partially paid, or unpaid
- vendor payments reduce vendor outstanding oldest-first
- the dashboard shows a live `Vendor Outstanding` total
- daily cashout saves drawer total and records audit status

## Goal

Verify that:

- every valid login path works
- owner-created accounts behave correctly
- every saved record appears correctly on all relevant pages
- desktop and mobile stay in sync through Firebase/Firestore
- derived values and summaries are consistent everywhere
- visual issues are identified through a screenshot pass

## Test Rig

### Devices

- `Desktop`: primary execution device
- `Mobile`: secondary sync-validation device

### Tools

- live browser session on desktop
- live browser session on mobile
- screenshot capture for major screens and important states
- Firebase Console / Firestore viewer only when deeper verification is needed
- browser devtools only if a sync or permission issue appears
- local localhost session may use `VITE_LOCAL_AUTH_BYPASS` for owner-only drill access

### Browsers

- Desktop: Chrome or Chromium
- Mobile: real mobile browser preferred; emulator acceptable as backup

## Execution Principles

- Perform one write, then verify every place it should surface.
- For every record created, verify:
  - source form success
  - target listing/render correctness
  - dashboard/summary impact where applicable
  - second-device sync
- Capture screenshots for every major page on both desktop and mobile.
- Keep a timestamped test ledger for every test record.

## Pre-Run Setup Checklist

1. Confirm both devices point to the same Firebase-backed environment.
2. Confirm the tested URL is either:
   - the live app under test, or
   - a localhost Vite session pointed at the same Firebase project
3. Confirm the owner account can log in.
4. If manager/billing users do not exist yet, create them from `Settings` before continuing role tests.
5. Decide whether the drill uses:
   - a clean dataset, or
   - an existing live-like dataset
6. Create a test ledger with:
   - test id
   - created by
   - device
   - page
   - payload
   - expected affected pages
   - actual results
   - pass/fail
   - notes/screenshots
7. Prepare screenshot naming inside:
   - `drill screenshots/desktop-*`
   - `drill screenshots/mobile-*`

## Test Data Convention

Use uniquely traceable values:

- User: `TEST Billing User 20260510`
- Vendor: `TEST Vendor Alpha 20260510`
- Person: `TEST Person Dev 20260510`
- Notes: `SYNC-CHECK-01`, `SYNC-CHECK-02`
- Bill number: `INV-TEST-001`
- Loan person: `TEST Loan Person 01`

Use distinctive amounts:

- `111`
- `222`
- `333`
- `444`
- `555`

## Phase 1: Authentication And Session Drill

1. Log in on desktop as `owner`
   - verify success
   - verify owner pages are visible
2. Log in on mobile as the same `owner`
   - verify same access
3. Log out on one device
   - verify local session behavior
4. Create test `manager` and `billing` users from `Settings` if needed.
5. Repeat login/logout checks for:
   - `manager`
   - `billing`

### Checks

- role-based page visibility
- restricted page fallback behavior
- settings access
- deleted-user login behavior

## Phase 2: Navigation Integrity Drill

On desktop and mobile, verify navigation to:

- Dashboard
- Register
- Cashout
- Purchase
- Vendors
- Loans
- Cash Movement
- Settings

### Checks

- top bar navigation works reliably
- top bar hide/reveal behavior works while scrolling
- active item state is correct
- no dead links
- no role-leak pages
- mobile horizontal/top-bar behavior remains usable
- capture screenshots of each state on desktop and mobile

## Phase 3: Visual Screenshot Pass

Capture and review:

- login screen
- dashboard
- register
- cashout
- purchase
- vendors
- loans
- cash movement
- settings
- top bar active states
- success/error/toast states where possible

### Review Checklist

Check for:

- text clipping
- overlap
- top-bar cutoff or glow clipping
- off-screen controls
- broken spacing
- excessive wrapping
- unreadable contrast
- hidden actions on mobile
- unstable card heights where it harms readability
- input or label layout issues
- toast placement issues

## Phase 4: Core Data Entry Drill

For each form below, create one test record on desktop and validate on mobile.

### 1. Expense Register / CashoutForm

Input:

- saved party/vendor from the searchable database-backed list
- amount
- category
- payment mode
- notes

Checks:

- record saved
- appears in recent expenses
- affects today expense totals
- appears on mobile after sync
- free-typed unsaved names are not accepted

### 1A. Vendor Payment

Input:

- saved vendor/party from the searchable database-backed list
- amount
- purpose
- payment mode

Checks:

- payment saved
- oldest open outstanding purchase reduces first
- dashboard vendor outstanding total updates
- no loan balances are affected

### 1B. Loan Payment

Input:

- saved party from the searchable database-backed list
- amount
- purpose
- payment mode

Checks:

- payment saved
- oldest open loan for that party reduces first
- loan ledger updates paid/remaining/status fields
- overpayment beyond open balance is blocked

### 2. Daily Cashout Register / DailyCashoutForm

Input:

- date
- cash sale
- upi sale
- credit sale
- audit values
- drawer particulars via modal

Checks:

- daily details step opens the drawer modal
- canceling the modal does not create a saved record
- final modal submit saves the record
- drawer total is stored as the saved balance
- cashout audit status is correct for matched / cash less / cash more cases
- today summary updates
- pending cash logic updates
- dashboard impact is correct
- mobile reflects the same values
- dashboard daily cashout log shows the new entry with expandable details

### 3. PurchaseForm

Input:

- vendor
- category
- amount
- invoice

Checks:

- purchase saved
- vendor linkage preserved
- partial payment / unpaid purchase saves correct `paidAmount` and `unpaidAmount`
- mobile reflects the same record

### 4. VendorsPage

Input:

- vendor details

Checks:

- vendor appears in vendor directory
- becomes selectable in purchase flow
- vendor outstanding is visible and correct
- visible on mobile

### 5. LoanForm

Input:

- person
- amount
- dates

Checks:

- record saved
- appears in the on-page loan list
- starts with `paidAmount = 0`, full remaining balance, and `Open` status
- owner-only visibility respected
- dashboard loan totals update
- sync to mobile

### 6. CashMovementForm

Input:

- transfer source
- destination
- amount
- reason

Checks:

- balances update correctly
- bank total is correct
- history log is correct
- sync to mobile

### 7. SettingsPage

Input:

- create user
- delete user
- password change flow if test-safe

Checks:

- owner can create `manager`
- owner can create `billing`
- create-user flow does not log the owner out
- created user can log in immediately
- deleted non-owner disappears from the directory
- deleted user loses app access
- audit log updates
- role permissions remain enforced

## Phase 5: Cross-Page Consistency Drill

For each created record, validate all affected pages.

### Example Mapping

- Expense entry should affect:
  - register page
  - recent expenses
  - today expense summary
  - dashboard expense counts/totals

- Daily cashout entry should affect:
  - daily summary
  - dashboard sales metrics
  - pending cash balances
  - dashboard daily cashout log

- Cash transfer should affect:
  - pending cash cards
  - bank total
  - movement history

- User creation should affect:
  - account directory
  - login behavior
  - settings audit

- Loan payment should affect:
  - payments collection
  - loan ledger row balances/status
  - dashboard open-loan totals

- Vendor payment should affect:
  - payments collection
  - matching purchase unpaid amounts
  - dashboard vendor outstanding total
  - vendor-level outstanding display

## Phase 6: Multi-Device Sync Drill

For each entity type:

1. Create on desktop
2. Observe on mobile without refresh
3. If not visible, refresh mobile once
4. Record whether sync is:
   - realtime
   - refresh-required
   - broken

Then reverse where practical:

1. Create on mobile
2. Observe on desktop
3. Validate same propagation

Do this for:

- expense
- vendor payment
- loan payment
- purchase
- vendor
- loan
- cash transfer
- settings/audit where safe

## Phase 6A: Vendor Outstanding Drill

1. Create one purchase for vendor A:
   - total `500`
   - paid `200`
2. Create another purchase for vendor A:
   - total `300`
   - paid `0`
3. Verify:
   - dashboard vendor outstanding = `600`
   - vendor row shows `600`
4. Create one vendor payment for vendor A: `250`
5. Verify:
   - oldest outstanding purchase reduces first
   - dashboard vendor outstanding becomes `350`
   - no loan values change

## Phase 7: Derived Calculation Drill

Use a compact controlled scenario:

1. Create one expense: `111`
2. Create one purchase: `222`
3. Create one loan: `333`
4. Create one loan payment: `111`
5. Create one daily cashout with:
   - cash sales `500`
   - upi sales `300`
   - credit sales `100`
   - returns `0`
6. Create one transfer: `150`

Then verify:

- today expenses = `111`
- purchase totals = `222`
- open loan balance = `222`
- total sales = `900`
- cash to hand = `500 - 111`
- transfer total = `150`
- pending balances adjust correctly
- dashboard cards and tables match expected math

## Phase 8: Negative And Edge Case Drill

Test:

- blank required fields
- zero values
- large values
- duplicate vendor/person creation
- restricted navigation attempts
- rapid repeated submission
- same-day multiple entries
- unusual notes lengths
- delete a user, then attempt login
- create-user with invalid email / short password / invalid mobile

## Phase 9: Persistence / Reload Drill

For each major record type:

1. Save record
2. hard refresh desktop
3. hard refresh mobile
4. verify record persists
5. verify derived cards still match after reload

This catches "UI updated but backend write did not persist" problems.

## Pass Criteria

A flow passes only if:

- save succeeds
- record is stored once
- linked pages show correct data
- second device reflects the same truth
- reload preserves state
- role rules remain intact

## Failure Handling Order

If something fails, debug in this order:

1. UI validation issue
2. wrong payload built by form
3. Firestore write missing/incorrect
4. subscription not updating local store
5. derived summary logic stale/wrong
6. role or rules blocking part of the flow
7. mobile-only rendering/state issue

## Required Deliverable After Execution

After the drill, create:

- `Drill Report.md`

That report must include:

- drill date/time
- environment URL
- users/roles tested
- devices/browsers tested
- pages covered
- data-entry flows tested
- sync observations
- screenshot findings
- list of functional issues
- list of visual issues
- severity for each issue
- repro steps
- suggested fixes
- final readiness recommendation

Associated evidence should be stored in:

```text
drill screenshots/
```
