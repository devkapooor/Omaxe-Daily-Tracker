# Version Log

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
