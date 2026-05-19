# GitHub Repository

## Archive Status

This note is retained as a lightweight repository reference. It now reflects the current AlphaHub V1 setup instead of the earlier pre-release snapshot.

## Primary Repository

`https://github.com/devkapooor/Omaxe-Daily-Tracker.git`

## Current Git Baseline

- primary branch: `main`
- first stable release tag: `v1.0.0`
- release commit for `v1.0.0`: `e88dd54915eb273ffaea82fb92b497386b8618ce`
- current release-management follow-up commit on `main`: `d0e04e0`

## Standard Release Flow

```powershell
git status --short
npm run build
npm run lint
git add -A
git commit -m "release: cut AlphaHub vX.Y.Z"
git tag -a vX.Y.Z -m "AlphaHub vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

## Standard Rollback Flow

```powershell
git fetch --tags
git checkout -b rollback/v1.0.0 v1.0.0
npm run build
npm run lint
firebase deploy --only hosting
```

## Notes

- use `docs/operations/VERSION_LOG.md` as the human-readable release history
- use `docs/operations/RELEASE_PROCESS.md` for the operational release checklist
- prefer redeploying tagged stable commits instead of rewriting `main`
