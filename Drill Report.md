# Drill Report

## Drill Date / Time

- `2026-05-09 04:59:20 +05:30`

## Environment URL

- `http://127.0.0.1:4173`

## Users / Roles Tested

- `owner`: tested successfully via local Firebase auth bypass and manual logout/login path
- `manager`: intended, but blocked because Settings user creation failed
- `billing`: intended, but blocked because Settings user creation failed

## Devices / Browsers Tested

- Desktop: Chromium via Playwright
- Mobile: Pixel 7 emulation via Playwright

## Pages Covered

- Dashboard
- Register
- Cashout
- Purchase
- Vendors
- Loans
- Cash Movement
- Settings

## Data-Entry Flows Tested

- Vendor creation: passed
- Purchase creation: passed
- Expense register creation on desktop: passed
- Expense register creation on mobile: passed
- Loan creation: passed
- Daily cashout creation: passed
- Cash transfer: failed
- Settings user creation: failed

## Sync Observations

- Vendor save propagated from desktop to mobile in realtime.
- Purchase dashboard total matched on desktop and mobile in realtime.
- Desktop-created expense appeared on mobile in realtime.
- Mobile-created expense was confirmed on desktop after reload.
- Sales dashboard total matched on desktop and mobile in realtime after daily cashout save.

## Calculation Verification Summary

Observed deltas from the controlled test payloads:

- Expense `111` increased the desktop register summary from `1110` to `1221`.
- Mobile expense `444` increased the mobile register summary from `1221` to `1665`.
- Purchase `222` increased dashboard total purchase from `444` to `666`.
- Loan `333` increased dashboard total loans from `666` to `999`.
- Daily cashout payload (`500` cash, `300` UPI, `100` credit) produced dashboard daily sales of `900`.
- Dashboard daily cash-to-hand became `-1165`, which is consistent with `900 - 1665`.

## Screenshot Findings

- No critical desktop layout break, clipping, or menu cutoff was observed in the captured owner flows.
- No critical mobile overflow was observed in the captured owner flows.
- Long person names on mobile expense cards wrap across multiple lines, but remained readable in the sampled run.
- Evidence is stored in `drill screenshots/`.

## Functional Issues

### 1. High - Settings cannot create staff users

- Symptom: Settings shows `Missing or insufficient permissions.` when attempting to create manager or billing users.
- Impact: manager/billing auth, role validation, disable/enable user checks, and broader session drill could not be completed.
- Repro:
  1. Log in as owner.
  2. Open `Settings`.
  3. Fill `Create User` with a valid name, email, role, and password.
  4. Submit `Create User`.
  5. Observe the permission error and no new user in the account directory.
- Evidence:
  - `drill screenshots/desktop-settings-users-created.png`
- Suggested fix:
  - Verify Firestore/Firebase rules and any auth-side permission assumptions around `createUserAccount`.
  - Confirm the owner session can write both the auth user bootstrap data and the Firestore `users` record.

### 2. High - Cash transfer submission does not persist

- Symptom: after daily cashout created `Dev ₹500` pending cash, a transfer submission did not move funds to bank, did not create history, and bank total stayed `₹0`.
- Impact: Cash Movement flow is not reliable, and derived bank/pending balances remain incorrect.
- Repro:
  1. Log in as owner (`Dev Kapoor`).
  2. Save a daily cashout so `Dev` pending cash becomes `₹500`.
  3. Open `Cash Movement`.
  4. Enter amount `150` and a reason such as `SYNC-CHECK-TRANSFER-...`.
  5. Submit `Transfer Cash`.
  6. Reload and reopen Cash Movement.
  7. Observe `Transferred To Bank` still `₹0` and no history row.
- Evidence:
  - `drill screenshots/desktop-cash-movement-after-transfer.png`
  - `drill screenshots/debug-transfer-after-reload.png`
- Suggested fix:
  - Inspect the `CashMovementForm` submit path and `saveCashTransfer` invocation.
  - Verify the form-controlled state is actually passed through on submit and that writes reach Firestore.
  - Verify the `cashTransfers` subscription updates the UI after write.

## Visual Issues

- No release-blocking visual defect was found in the sampled desktop/mobile owner flows.
- Minor observation: mobile recent-expense cards wrap long names aggressively; readability is acceptable, but card height grows quickly.

## Negative / Edge Checks

- Blank purchase submission: passed, required fields remained invalid.
- Overlong vendor notes: passed, validation error `Notes cannot be more than 40 words.` displayed.

## Persistence / Reload

- Vendor record persisted after reload on both desktop and mobile.
- Cash transfer did not persist after reload.

## Final Recommendation On Readiness

- `Not ready` for sign-off yet.
- Owner-side core entry flows are largely working and sync looked healthy in the covered vendor, purchase, expense, loan, and daily cashout flows.
- The app should not be considered drill-complete until:
  - Settings user creation works for manager/billing roles
  - Cash transfer persistence and derived bank totals work
  - manager/billing login, role restrictions, disable/enable user flow, and full reverse-device checks are rerun
