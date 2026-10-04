# Cashier handover verification

Date: 2026-10-04
Release status: Local implementation complete; deployment pending user approval.

## Automated evidence

- `npm test`: 15 active test files, 93 unit tests passed.
- Firestore emulator (`demo-alphahub`, alternate local ports), `npx vitest run tests --reporter=dot`: 2 files, 51 tests passed. Full output: `logs/handover-rules-validation.log` (local, ignored).
- `npx eslint src tests vite.config.ts vitest.config.ts`: passed.
- Production-mode `npm run build`: passed with auto-login disabled, local credentials cleared and emulator mode disabled. Vite reports its existing large-bundle advisory.
- `git diff --check`: passed.

The previous 311-unit-test result included archived release copies. `vitest.config.ts` now includes only active `src/**/*.test.ts` and `tests/**/*.test.ts`; archived release suites no longer interfere with current emulator projects.

## Browser evidence

Used synthetic owner/billing accounts and `demo-alphahub-browser` Auth/Firestore emulators at localhost. No production database writes or deployment commands were performed.

- Previous billing participant was blocked by the opening count dialog, with blurred/inert underlying workspace.
- Entered zero actual cash against an expected INR 100, matched UPI/card readings, and saved a shortage note. Submission unlocked the workspace and reported the saved discrepancy without waiting for owner approval.
- Logout required a closing count. The dialog was checked at desktop and 390 x 844 mobile sizes; longer mobile content scrolls inside the dialog.
- Simulated another drawer ledger update during counting. The dialog displayed a restart warning and disabled submission. Restart reset the inputs against the latest expected amounts.
- Saved a matching closing count and verified return to the sign-in screen.
- Signed in as a dashboard-only owner and verified there was no cashier count gate.
- Owner Action Centre displayed the pending shortage with cashier identity, expected/actual/difference for each method, timestamp and note. Owner review cleared the pending item while retaining audit evidence.
- Browser error check returned no page errors.

Local screenshot evidence (ignored): `logs/handover-opening-desktop.png`, `logs/handover-closing-mobile.png`, `logs/handover-owner-review.png`.

## Required release steps

1. Obtain the user's approval for the combined handover/UI deployment.
2. Deploy Hosting, Firestore rules and indexes together using the production build, with local credentials and emulator flags excluded.
3. Verify production read-only. Existing financial/loan records must remain unchanged.
4. Owner deliberately initializes the POS handover baseline through the app before staff resume checkout. Setup reads existing POS history and writes only isolated handover/participant records.

The shared counter has revision-based count invalidation, not an exclusive physical counting lock. Staff must pause billing while counting. Outside POS cash movements are explained in notes and surfaced as discrepancies, as approved.
