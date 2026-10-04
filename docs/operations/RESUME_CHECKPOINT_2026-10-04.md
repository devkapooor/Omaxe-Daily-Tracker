# AlphaHub resume checkpoint — 2026-10-04

Use this note when resuming work in this repository. Current code checkpoint: `11249d3` on `main` (`origin/main`). The production release is live at https://alphahub-f137b.web.app.

## Current phase position

- Phases 3A, 3B, and 3C are recorded as reviewed and deployed. See [ROADMAP.md](./ROADMAP.md), the [shared-layout plan](./SHARED_PAGE_LAYOUT_REDESIGN_PLAN_2026-10-04.md), and the [Phase 3C closeout](./PHASE_3C_RESUME_CHECKPOINT_2026-10-04.md).
- Phase 3D is next, but has **not started** and still needs separate user approval. It covers presentation-only migration of Dashboard, Register, and Logs. Never change loan records, schemas, calculations, workflows, permissions, or financial side effects.
- Phase 3E is cross-page visual acceptance after 3D: light/dark, wide/narrow layouts, overflow, focus, and alignment.
- Continue the approved-upgrade queue in [ROADMAP.md](./ROADMAP.md); do not silently expand scope or begin unrelated queued work.

## Latest release

Trusted server time, scheduled blocking notices, staff/manager Cashout hours, the POS staff sign-in default, and the approved cash-audit behavior are deployed. Existing financial history was not migrated. Details and verification are in [SERVER_TIME_CASHOUT_RELEASE_2026-10-04.md](./SERVER_TIME_CASHOUT_RELEASE_2026-10-04.md).

## Suggested resume sequence

1. Hard-refresh the live app and manually confirm staff and manager sign-ins land on POS while owner sign-in preserves its preferred page.
2. At the Cashout boundaries, verify staff/manager access at 23:55–00:20 Asia/Kolkata, and verify the Action Centre notice/acknowledgement flow in an open staff browser. Avoid leaving a temporary test notification in production settings.
3. Review the remaining queue in `ROADMAP.md`. Ask before starting Phase 3D or another item that needs approval.
4. Before any next deployment, inspect the target and dirty worktree, run scoped lint/tests/build and Firestore Rules tests, then commit and push a focused checkpoint.

## Known follow-ups

- The deployed `getServerTime` function uses Node.js 20; upgrade to Node.js 22 before the scheduled 2026-10-30 runtime decommission date.
- Firebase created the function but the CLI reported that no Artifact Registry cleanup policy is configured. No deletion policy was applied; choose a retention period explicitly before configuring one.
- Current validation passed: ESLint, 106 unit tests, 51 Firestore Rules emulator tests, production build, and `git diff --check`. Build still reports the existing large-bundle advisory.
- Existing unrelated untracked `.playwright-cli/`, `DESIGN.md`, `docs/design-references/`, `firebase.rules-test.local.json`, and `output/` were left untouched.
