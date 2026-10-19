# Financial remediation execution â€” 16 October 2026

Status: Implemented, accepted, committed, pushed, and deployed. Read-only verification and validation evidence are in the [19 October release report](2026-10-19-predeployment-validation.md). Existing Batches 1â€“5 and original failure evidence preserved.

Evidence directory: output/playwright/2026-10-16-financial-remediation/

## Checkpoint

- Baseline Git status and per-file hashes recorded before application changes.
- Production financial/history/configuration untouched; demo-only mutation tests, loan mutation excluded.
- Starting with FT-01 privacy and FT-03 logout.

## Application changes in progress

- FT-01: owner/private settings and full metrics; server-published allowlisted staff views; direct client publication fenced. Focused handlers/Rules passed. Initial release publication remains a separately authorised production step.
- FT-02: receipt selection moved to stable parent with lazy source fetch; loading context stabilises row identities.
- FT-03: queued visible logout readiness/retry, mandatory count and pending-operation guards retained. AUTH-04 and repaired local AUTH-06 passed their first focused run; original guard failure was timing-dependent and did not reproduce in one ready-state diagnostic control.
- FT-04/05: due cheque action readiness/fresh confirmation and independent deposit labels implemented.
- Newly exposed FT-06: owner approval of a non-invoice vendor payment correction fails atomically while persisting undefined allocation fields. Original supporting failure preserved. Narrow server-result canonicalisation implemented; original source remains immutable and balance/replay regressions added.
- Original test sources copied under this run's original-tests directory before legacy contract replacement. Supporting mocked transport is reported separately from real browser/HTTP acceptance.

## Stable-source focused acceptance

- R01/R02 direct staff bank/privacy and missing-view recovery passed. A test denial matcher was strengthened to preserve actual Firebase error codes, rather than accepting generic errors.
- R03 controlled stale-clock logout/readiness passed. R04 exposed a recovery overlay conflict, fixed by keeping logout feedback separate from the counter error modal. Existing financial recovery deliberately reloads; the user then chooses Log out again, and the mandatory count must appear.
- R05 due-stage/concurrent confirmation and R06 32-second phone receipt/live-row/focus checks passed after prerequisite fixtures and source freeze. The earlier receipt attempt was invalidated by implementation hot reload and is retained.
- R07 real authenticated HTTP non-invoice correction/replay passed.
- Integrated static milestone passed: domain142, source/drill lint, TypeScript and production build. Further changed source will receive a final focused check.
- Preparing full sequential browser milestone and actual five-minute expiry; real-midnight transition remains time-window dependent.
