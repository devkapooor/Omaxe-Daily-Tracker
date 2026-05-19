# Drill Report

## Historical Status

This report is a historical read-only drill snapshot from before the current V1 stabilization and release-management pass. Keep it for audit history, but do not treat it as the current verification status of the live app.

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

## Pages Covered At The Time

- Dashboard
- Directory
- Register
- Cashout
- Cash Movement
- Logs
- Settings

## Historical Notes

- This pass happened before the current `Payment Planner` rollout and before the later V1 release/rollback workflow was documented.
- Because the app was live and in active use, this pass intentionally skipped all write-path testing.
- To avoid accidental data mutation, page switching was executed through the saved active-page state rather than form submissions.

## Sync / Read Observations

- Desktop and mobile reflected the same owner-facing high-level totals during the pass.
- The owner dashboard loaded live values for sales, open loan balance, vendor outstanding, and pending cash.
- Logs rendered recent history and auto-synced cashout-derived sales entries successfully in both desktop and mobile captures.

## Functional Findings

### 1. Low - Dashboard summary eyebrow showed mojibake text during the drill

- Symptom during the read-only pass: the dashboard summary eyebrow rendered a malformed separator instead of clean text.
- Impact: low-severity presentation defect on a key owner screen.
- Source confirmed in code at the time: `src/features/dashboard/components/DailyCashoutFinalSummaryPanel.tsx`

## Follow-Up Status

- The dashboard summary label issue was fixed after this drill.
- PWA installability and online-only offline handling were added after this pass.
- Later app work also added `Payment Planner`, release tagging, rollback docs, and the current AlphaHub V1 baseline.
- A fresh current-state drill is still recommended before treating this historical report as operationally representative.

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

## Final Recommendation At The Time

- `Conditionally ready` from a read-only validation perspective.
- No destructive-path testing was performed in this pass by design.
- No release-blocking read/navigation failure was found in the covered owner screens.
