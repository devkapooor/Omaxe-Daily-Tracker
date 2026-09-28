# AlphaHub V2 Phase 1 Architecture Baseline

## Purpose

V2 is an isolated development line for Phase 1 improvements. The live V1 checkout, production Firebase data, historical finance records, and the existing uncommitted V1 visual work remain outside this worktree.

## Phase 1 scope

- Preserve all historical data.
- Keep Dashboard, Cashout, Cash Movement, Logs, and Settings as primary workspace areas.
- Audit Directory, Register, and Payment Planner before hiding or repurposing them.
- Do not delete historical collections when a screen or workflow is removed.
- Add stock receiving with optional supporting fields.
- Update vendor outstanding from stock receiving when enabled by the approved business rules.
- Add per-item reorder levels.
- Add optional low-stock Telegram delivery with configurable destination and review/automatic sending mode.
- Remove receivables from this phase.
- Refactor reusable components and separate UI, workflows, calculations, and persistence.
- Add automated and manual regression testing before Phase 1 is accepted.

## Safety boundaries

- No production Firebase writes from V2 during development testing.
- No destructive data migrations without a separately approved migration plan and backup evidence.
- Finance and inventory corrections must be append-only or use explicit controlled actions; silent overwrites are not allowed.
- Telegram credentials must remain outside source control.
- A feature removal removes access or navigation first; historical records remain preserved.

## Target dependency direction

```text
Shared UI components
  -> feature components and workflows
  -> validation and domain rules
  -> calculations and selectors
  -> Firestore adapters/actions
  -> audit records
```

Feature components must not contain arbitrary Firestore writes or duplicate financial calculations.

## Commit and delivery policy

Each packet is independently validated and pushed:

1. Architecture and component baseline
2. Shared component extraction
3. Feature/navigation audit
4. Stock receiving
5. Vendor outstanding
6. Reorder-level alerts
7. Telegram settings and delivery
8. Tests and regression checks
9. Phase 1 finalisation

Every packet requires build, source lint, relevant tests, `git diff --check`, a focused commit, and upstream verification. Rollback uses a previous commit or `git revert`; force-push and destructive reset are not part of the workflow.
