# Cashier handover verification

Date: 2026-10-04
Release status: Deployed and live-verified on 2026-10-04. Production drawer initialization remains pending owner action.

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

## Release result

- User approved the combined handover/UI deployment.
- Firebase Hosting, Firestore rules, and indexes deployed successfully to `alphahub-f137b`.
- The production build excluded local credentials and emulator flags. Live Hosting referenced `assets/index-CR8EKS0L.js`.
- Read-only live verification confirmed owner sign-in, dashboard access, and the POS shared-drawer setup state without Firestore permission errors.
- Existing financial and loan records were not migrated, rewritten, or changed during deployment verification.
- Owner must deliberately initialize the POS handover baseline through the app before staff resume checkout. Setup reads existing POS history and writes only isolated handover/participant records.

The shared counter has revision-based count invalidation, not an exclusive physical counting lock. Staff must pause billing while counting. Outside POS cash movements are explained in notes and surfaced as discrepancies, as approved.
