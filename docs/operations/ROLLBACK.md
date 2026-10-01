# Rollback Playbook

## Goal

Recover AlphaHub to a known stable version without rewriting `main`.

## Standard Rollback

1. Identify a compatible target in [Version Log](./VERSION_LOG.md), including its deployed rules and active data contracts. The historical v1.0.0 tag is not automatically compatible with an activated V2 ledger.
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
- Do not delete or rewrite financial records, loans, backups or audit history to match older code. V2 containment/resume requires its own reviewed operation; see [Vendor Ledger](../domain/VENDOR_LEDGER.md).
- Obtain deployment confirmation before redeploying. A hosting rollback does not authorize rules changes or a data rollback.

## Quick Commands

```powershell
git fetch --tags
git checkout -b rollback/v1.0.0 v1.0.0
npm run build
npm run lint
firebase deploy --only hosting
```
