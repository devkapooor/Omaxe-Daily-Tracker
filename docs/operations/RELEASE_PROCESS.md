# Release Process

The latest application deployment is recorded in [31 October deployment](DEPLOYMENT_2026-10-31.md). This procedure is guidance for future separately authorized releases; it does not authorize commit, push, deployment, cloud changes or production mutations. Use the current [full isolated runbook](../../drill.md#current-maintenance-execution--31-october-2026) and [coverage/exclusions](TEST_COVERAGE.md); a build is not workflow/device acceptance. Preserve unrelated edits and use a reviewed clean release checkout. Historical version examples below are not automatically compatible with current data/Rules/Functions.

## Standard Release Flow

Use this process for every stable AlphaHub release.

1. Finish the intended changes on `main`.
2. Follow [QA Checklist](./QA_CHECKLIST.md) and run:
   - `npm test`
   - `npm run lint` and drill lint through the full runner
   - `npm run build`
   - the current guarded `test:full` path with stack startup/shutdown and fresh evidence ID; never start a second Firestore emulator over an existing stack. Record all exclusions, failures and device gaps.
3. Update `package.json` version to the next release number.
4. Add a new entry to `docs/operations/VERSION_LOG.md`.
5. Commit the release state with a release-style message, for example:
   - `release: cut AlphaHub v1.1.0`
6. Create an annotated tag:
   - `git tag -a v1.1.0 -m "AlphaHub v1.1.0"`
7. Push the branch and tag:
   - `git push origin main`
   - `git push origin v1.1.0`
8. After explicit deployment confirmation, deploy the tagged commit to Firebase Hosting. Deploy Firestore rules first only when the release actually changes them.
9. If GitHub Releases are being used manually, create a GitHub release that points to the same tag and reuse the summary from `VERSION_LOG.md`.

## Release Rules

- Always tag stable production releases.
- Keep one `VERSION_LOG.md` entry per release.
- Do not force-reset `main` to roll back production.
- Prefer rollback by redeploying a tagged stable commit.
- Keep release notes short and operationally useful.
- Keep current status and outstanding work in [Roadmap](./ROADMAP.md). Archive historical evidence without treating old phase status as current.
- Production verification is read-only; test mutations only in emulators/isolated data. Never activate V2 or run migrations as a deployment side effect.
- VITE-prefixed variables are browser-visible. Exclude local auto-login credentials from release build inputs without changing existing .env files.

## Naming Convention

- Stable releases use semantic versions: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Patch fixes use `v1.0.1`, `v1.0.2`
- Minor feature releases use `v1.1.0`, `v1.2.0`
- Major breaking changes use `v2.0.0`
