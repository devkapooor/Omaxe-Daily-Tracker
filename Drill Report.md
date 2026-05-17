# Drill Report

## Drill Date / Time

- `2026-05-17 12:26 +05:30`

## Environment URL

- `http://127.0.0.1:5173/`
- local Vite session with `VITE_LOCAL_AUTH_BYPASS=true`
- Firebase project under test: `alphahub-f137b`

## Safety Mode

- `safe read-only live-data drill`
- no create, edit, delete, transfer, or submit actions were performed
- the pass only loaded pages, switched read-only views, extracted visible text, and captured screenshots

## Users / Roles Tested

- `owner`: tested through local owner bypass
- `manager`: not executed in this pass
- `billing`: not executed in this pass

## Devices / Browsers Tested

- Desktop: Chromium automation
- Mobile: Pixel 7 style mobile emulation

## Pages Covered

- Dashboard
- Directory
- Register
- Cashout
- Cash Movement
- Logs
- Settings

## Execution Notes

- Because the app is live and in active use, this pass intentionally skipped all write-path testing.
- To avoid accidental data mutation, page switching was executed through the app's saved active-page state rather than form or submit flows.
- The app loaded successfully against live Firestore-backed data on both desktop and mobile emulation.

## Sync / Read Observations

- Desktop and mobile reflected the same owner-facing high-level totals during the pass.
- The current owner dashboard loaded live values for sales, open loan balance, vendor outstanding, and pending cash.
- Logs rendered recent sales history and auto-synced cashout-derived sales entries successfully in both desktop and mobile captures.

## Functional Findings

### 1. Low - Dashboard summary eyebrow showed mojibake text during the drill

- Symptom during the read-only pass: the dashboard summary eyebrow rendered a malformed separator instead of clean text.
- Impact: low-severity presentation defect on a key owner screen.
- Source confirmed in code at the time: `src/components/DailyCashoutFinalSummaryPanel.tsx`

## Follow-Up Status

- The dashboard summary label issue has now been fixed in code by switching to a plain ASCII separator.
- PWA installability and online-only offline handling were added after this read-only drill.
- A new installability-focused verification pass is still recommended on hosted Chrome Android after deployment.

## Visual Findings

- No release-blocking layout break was observed in the covered owner flows.
- Desktop dashboard, directory, register, cashout, movement, logs, and settings all rendered successfully.
- Mobile versions of the same pages also rendered successfully in the read-only pass.
- The current grouped navigation structure is reflected correctly in the captured owner screens.

## Evidence

- `drill artifacts/latest-drill-readonly.json`
- `drill screenshots/desktop-dashboard.png`
- `drill screenshots/desktop-directory.png`
- `drill screenshots/desktop-register.png`
- `drill screenshots/desktop-cashout.png`
- `drill screenshots/desktop-movement.png`
- `drill screenshots/desktop-logs.png`
- `drill screenshots/desktop-settings.png`
- `drill screenshots/mobile-dashboard.png`
- `drill screenshots/mobile-directory.png`
- `drill screenshots/mobile-register.png`
- `drill screenshots/mobile-cashout.png`
- `drill screenshots/mobile-movement.png`
- `drill screenshots/mobile-logs.png`
- `drill screenshots/mobile-settings.png`

## Final Recommendation On Readiness

- `Conditionally ready` for continued live owner use from a read-only validation perspective.
- No destructive-path testing was performed in this pass by design.
- No release-blocking read/navigation failure was found in the covered owner screens.
- Before a stronger sign-off, the next drill should add:
  - manager and billing coverage
  - controlled write-path verification in a safe test window
  - direct navigation interaction checks for the grouped desktop and mobile menus
  - hosted Chrome Android installability verification
