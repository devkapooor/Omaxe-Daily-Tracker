# Rollback Playbook

## Goal

Recover AlphaHub to a known stable version without rewriting `main`.

## Standard Rollback

1. Identify the target version in `docs/operations/VERSION_LOG.md`.
2. Create a rollback branch from the release tag:
   - `git checkout -b rollback/v1.0.0 v1.0.0`
3. Verify the release locally:
   - `npm run build`
   - `npm run lint`
4. Redeploy that exact code to Firebase Hosting.
5. Confirm the live app behaves as expected.
6. If additional fixes are needed, make them from the rollback branch or from a fresh branch based on the stable tag, then cut a new release tag after verification.

## What Not To Do

- Do not use `git reset --hard` on `main` as the normal rollback path.
- Do not delete release tags that represent deployed stable versions.
- Do not deploy untagged emergency code if a stable tagged rollback is available.

## Quick Commands

```powershell
git fetch --tags
git checkout -b rollback/v1.0.0 v1.0.0
npm run build
npm run lint
firebase deploy --only hosting
```
