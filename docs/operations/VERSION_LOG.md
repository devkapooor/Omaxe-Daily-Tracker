# Version Log

## Dashboard Batch A - 2026-10-01

- Commit: `42e19a9`
- Deployment: Firebase Hosting - `https://alphahub-f137b.web.app`
- Firebase Hosting version: `293f4664f732d2be`
- Summary:
  - Added break-even progress from the configured margin and monthly operating expense.
  - Added a responsive daily sales trend against the preceding month.
  - Added neutral sales and cashout recording coverage without false missing-day warnings.
- Verification:
  - Seven unit tests, source ESLint, TypeScript, and the production build passed.
  - The live HTML returned HTTP 200 and referenced the expected production asset.
  - Hosting-only deployment made no Firestore rule or production financial-record changes.

## Live Update - 2026-10-01

- Commit: `ed1b933`
- Deployment: Firebase Hosting and Firestore Rules - `https://alphahub-f137b.web.app`
- Summary:
  - Hardened Firestore access for owner, manager, billing, disabled, and unauthenticated users.
  - Restricted billing cash movements to the signed-in holder while preserving manager and owner operations.
  - Added emulator-only permission tests covering eight allow and deny scenarios.
  - Added adaptive Logs ranges for 7, 15, 30, and 90 days plus custom dates and incremental loading.
  - Formalized shared viewport-responsive layouts rather than device-specific implementations.
- Verification:
  - Unit tests, source ESLint, production build, and Firestore emulator rules tests passed.
  - Production smoke testing was read-only and confirmed the deployed asset bundle returned HTTP 200.
  - No production financial records were modified, migrated, backfilled, or used as test data.

## Live Update - 2026-06-05

- Deployment: Firebase Hosting - `https://alphahub-f137b.web.app`
- Summary:
  - Removed active slot-based cash ownership from runtime money flows and moved cash ownership to Firebase user IDs.
  - Updated daily cashouts, cash transfers, dashboard balances, logs, and Cash Movement to use user-based identity.
  - Added user-deletion safeguards so accounts with finance or audit history cannot be removed casually.
  - Migrated all live cashouts and cash transfers onto user IDs and cleared unresolved legacy cash from the active workspace.
  - Corrected the reported Pawan mismatch and the incorrect transfer label that showed `Farhan to Dev`.
- Notes:
  - This was a live operational upgrade on top of `v1.0.0`, not a new tagged release.
  - Local backup kept outside git: `docs/backups/cash-identity-migration-2026-06-05T14-41-41-788Z.json`

## v1.0.0 - 2026-05-19

- Tag: `v1.0.0`
- Commit: `e88dd54915eb273ffaea82fb92b497386b8618ce`
- Deployment: Firebase Hosting - `https://alphahub-f137b.web.app`
- Summary:
  - Formalized AlphaHub V1 as the first stable tagged release.
  - Included the production app state with the cleaned project structure, updated AlphaHub branding, compact workspace shell, and current cash movement/planner workflows.
  - Established a documented rollback workflow using Git tags and redeployable release commits.
- Rollback:
  - Create a temporary branch from the tag, for example `rollback/v1.0.0`.
  - Run `npm run build` and `npm run lint`.
  - Redeploy that exact tagged commit to Firebase Hosting if recovery is needed.

## Release Template

Use this template for each future release:

```md
## vX.Y.Z - YYYY-MM-DD

- Tag: `vX.Y.Z`
- Commit: `<full commit hash>`
- Deployment: Firebase Hosting - `<live URL or channel>`
- Summary:
  - `<high-level change 1>`
  - `<high-level change 2>`
- Rollback:
  - `git checkout -b rollback/vX.Y.Z vX.Y.Z`
  - `npm run build`
  - `npm run lint`
  - `firebase deploy --only hosting`
```
