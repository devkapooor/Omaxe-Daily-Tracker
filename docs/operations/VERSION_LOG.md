# Version Log

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
