# Cross-Device QA Drill

## Purpose

This document defines the execution drill for validating:

- all major connections
- all data entry points
- all linked page updates
- desktop/mobile sync behavior
- correctness of derived values across the app
- desktop/mobile visual integrity through screenshot review

This is a planning document only. It does not imply the drill has been executed.

## Goal

Verify that:

- every login/session path works
- every data entry point saves correctly
- every saved record appears correctly on all relevant pages
- desktop and mobile stay in sync through Firebase/Firestore
- derived values and summaries are consistent everywhere
- visual issues are identified on both desktop and mobile through a screenshot pass

## Test Rig

### Devices

- `Desktop`: primary execution device
- `Mobile`: secondary sync-validation device

### Tools

- `Playwright` for repeatable desktop/browser flows
- `Headless Chrome` / browser automation for quick verification
- manual live browser session for realistic UI checks
- screenshot capture for all major screens and important UI states
- Firebase Console / Firestore viewer only for deep verification if needed
- network/devtools checks only when a sync issue appears

### Browsers

- Desktop: Chrome or Chromium
- Mobile: real mobile browser preferred; emulator acceptable as backup

## Execution Principles

- One action at a time, then verify everywhere it should surface
- Always test both:
  - `write success`
  - `read/render correctness`
- For every record created:
  - verify source form
  - verify target listing/page
  - verify dashboard/summary impact
  - verify second-device sync
- For every major screen/state:
  - capture screenshots on desktop
  - capture screenshots on mobile
  - review for overlap, clipping, layout breaks, hidden actions, and visual regressions
- Keep a timestamped test ledger so each entry can be traced

## Pre-Run Setup Checklist

1. Confirm both devices point to the same Firebase-backed environment.
2. Confirm both devices can log in with valid test users.
3. Prepare test users:
   - `owner`
   - `manager`
   - `billing`
4. Clear ambiguity:
   - know which project is live
   - know which URL is under test
5. Decide whether testing uses:
   - clean dataset, or
   - seeded existing dataset
6. Create a test ledger document with:
   - test id
   - created by
   - device
   - page
   - payload
   - expected affected pages
   - actual results
   - pass/fail
   - notes/screenshots
7. Prepare screenshot naming/folder convention:
   - store all screenshots inside a folder named `drill screenshots`
   - use naming patterns such as:
     - `desktop-auth-*`
     - `desktop-dashboard-*`
     - `desktop-register-*`
     - `mobile-auth-*`
     - `mobile-dashboard-*`
     - `mobile-register-*`
   - use equivalent names for each major page and state

## Test Data Convention

Use uniquely traceable values so records are easy to spot:

- Vendor: `TEST Vendor Alpha 20260509`
- Person: `TEST Person Dev 20260509`
- Notes: `SYNC-CHECK-01`, `SYNC-CHECK-02`, etc.
- Bill number: `INV-TEST-001`
- Loan person: `TEST Loan Person 01`

Use deliberately distinctive amounts:

- `111`
- `222`
- `333`
- `444`
- `555`

This makes mismatches obvious.

## Phase 1: Authentication and Session Drill

1. Login on desktop as `owner`
   - verify successful entry
   - verify correct navbar/pages visible
2. Login on mobile as same `owner`
   - verify same access
3. Logout on one device
   - verify local session behavior
   - verify second device remains as expected unless auth refresh forces change
4. Repeat for:
   - `manager`
   - `billing`

### Checks

- role-based page visibility
- restricted page fallback behavior
- settings access only where intended

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

- dropdown opens reliably
- page loads correctly
- no dead links
- no role-leak pages
- mobile menu behavior stable
- capture screenshots of each navigated state on desktop and mobile

## Phase 2A: Screenshot Visual QA Pass

For every major page and important state, capture screenshots and review them for UI quality.

### Desktop Screenshot Pass

Capture:

- login screen
- dashboard
- register
- cashout
- purchase
- vendors
- loans
- cash movement
- settings
- navbar closed state
- navbar dropdown open state
- success/error/toast states if present

### Mobile Screenshot Pass

Capture:

- login screen
- dashboard
- register
- cashout
- purchase
- vendors
- loans
- cash movement
- settings
- mobile navbar closed state
- mobile navbar expanded state
- expanded submenu states
- success/error/toast states if present

### Visual Review Checklist

Check screenshots for:

- text clipping
- overlapping elements
- dropdown cutoff
- off-screen controls
- broken spacing
- excessive wrapping
- inconsistent card heights where it harms readability
- unreadable contrast
- misaligned icons/buttons
- mobile menu overflow problems
- table/list rows collapsing badly
- input fields or labels breaking layout
- toast placement issues
- scroll traps or hidden actions

Every visual issue found should be logged into the final report.

All screenshots from this phase must be saved inside:

```text
drill screenshots/
```

## Phase 3: Core Data Entry Drill

For each form below, create one test record on desktop and validate on mobile.

### 1. Expense Register / CashoutForm

Input:

- person
- amount
- category
- payment mode
- notes

Checks:

- record saved
- appears in recent expenses
- affects today expense totals
- appears on mobile after sync

### 2. Daily Cashout Register / DailyCashoutForm

Input:

- date
- cash sale
- upi sale
- credit sale
- audit values
- denomination data

Checks:

- record saves
- today summary updates
- pending cash logic updates
- dashboard impact correct
- mobile reflects same values

### 3. PurchaseForm

Input:

- vendor
- brand/category
- amount
- invoice

Checks:

- purchase saved
- vendor directory linkages preserved
- dashboard purchase totals update
- mobile reflects same record

### 4. VendorsPage

Input:

- vendor details

Checks:

- saved vendor appears in vendor directory
- becomes selectable in purchase flow
- visible on mobile

### 5. LoanForm

Input:

- person
- amount
- dates

Checks:

- record saved
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
- bank/person totals correct
- history log correct
- sync to mobile

### 7. SettingsPage

Input:

- create user
- disable/enable user
- password change flow if test-safe

Checks:

- audit log updates
- role permissions enforced
- resulting user behavior correct on login

## Phase 4: Cross-Page Consistency Drill

For each created record, validate all affected pages.

### Example Mapping

- Expense entry should affect:
  - register page listing
  - recent expenses
  - today expense summary
  - dashboard expense counts/totals
  - possibly cash-to-hand logic

- Purchase entry should affect:
  - purchase record storage
  - purchase totals
  - vendor-linked displays
  - dashboard purchase summaries

- Daily cashout entry should affect:
  - daily summary
  - dashboard sales metrics
  - pending cash balances

- Cash transfer should affect:
  - pending cash cards
  - bank total
  - movement history

This phase is specifically about asking:

`After this single write, did every dependent read surface update correctly?`

## Phase 5: Multi-Device Sync Drill

For each entity type:

1. Create on desktop
2. Observe on mobile without refresh
3. If not visible, refresh mobile once
4. Record whether sync is:
   - realtime
   - refresh-required
   - broken

Then reverse:

1. Create on mobile
2. Observe on desktop
3. Validate same propagation

Do this for:

- expense
- purchase
- vendor
- loan
- cash transfer
- settings/audit where safe

Also capture screenshots before and after sync-sensitive actions when the UI changes visibly.

## Phase 6: Derived Calculation Drill

Manually compute expected values for a tiny known dataset and compare with UI.

Use a compact controlled scenario:

1. Create one expense: `111`
2. Create one purchase: `222`
3. Create one daily cashout with:
   - cash sales `500`
   - upi sales `300`
   - credit sales `100`
   - returns `0`
4. Create one transfer: `150`

Then verify:

- today expenses = `111`
- purchase totals = `222`
- total sales = `900`
- cash to hand = `500 - 111`
- transfer total = `150`
- pending balances adjusted correctly
- dashboard tables and cards match expected math

This is the strongest way to catch hidden cross-page inconsistencies.

## Phase 7: Negative and Edge Case Drill

Test:

- blank required fields
- zero values
- large values
- duplicate vendor/person creation
- role-restricted navigation attempts
- mobile menu interruptions during save
- rapid repeated submission
- date changes across forms
- same-day multiple entries
- unusual notes lengths
- disable a user, then attempt login

## Phase 8: Persistence / Reload Drill

For each major record type:

1. Save record
2. hard refresh desktop
3. hard refresh mobile
4. verify record persists
5. verify derived cards still correct after reload

This catches “UI updated but backend write didn’t actually persist” problems.

## Phase 9: Evidence Collection Drill

For every failed or suspicious case, capture:

- screenshot on source device
- screenshot on target device
- exact record payload
- page where mismatch appears
- expected vs actual
- whether refresh fixes it
- whether Firebase console shows correct raw document
- desktop screenshot
- mobile screenshot

If needed, classify failures as:

- write failure
- read/render failure
- sync latency issue
- permission/role bug
- derived calculation bug
- stale state bug
- mobile-only UI bug
- desktop-only UI bug
- cross-device visual inconsistency

## Playwright Execution Structure

Desktop automation suites:

1. `auth.spec.ts`
2. `navigation.spec.ts`
3. `expense-flow.spec.ts`
4. `cashout-flow.spec.ts`
5. `purchase-flow.spec.ts`
6. `vendor-flow.spec.ts`
7. `loan-flow.spec.ts`
8. `cash-movement.spec.ts`
9. `settings.spec.ts`
10. `cross-page-consistency.spec.ts`

Manual/assisted sync checks:

- keep mobile open during desktop-run
- verify record appearance live
- then reverse with mobile-originated writes

## Pass Criteria

A flow passes only if:

- save succeeds
- record is stored once
- all linked pages show correct data
- second device reflects same truth
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

## Final Output After Execution

After running the drill, produce:

- tested flows matrix
- pass/fail by module
- sync behavior summary
- calculation verification summary
- screenshot review summary
- bug list ranked by severity
- exact repro steps
- fix recommendations

## Required Deliverable After Drill

After execution, create:

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
- suggested fixes or changes
- final recommendation on readiness

Associated evidence for the report should be stored in:

```text
drill screenshots/
```

The drill is only complete when `Drill Report.md` is produced with both functional and visual findings.
