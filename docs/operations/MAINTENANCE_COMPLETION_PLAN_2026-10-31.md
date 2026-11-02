# Consolidated maintenance completion plan — 31 October 2026

Authorization: the user requested one consolidated plan followed by implementation. This supersedes the earlier need to request approval separately for each remaining local maintenance batch. Existing restrictions remain: preserve production history and unrelated work; no cloud/configuration changes, deployment, push, Git history rewrite, loan mutations, speculative upgrades, real messages or deletion/relocation of sensitive business records.

The initial inventory and 22 drill repairs remain valid evidence. The last complete browser run had 148 passes, one intermittent bill-dialog focus failure and three skips. This plan completes the remaining locally actionable maintenance, records unresolved items honestly, and prepares exact device/timed acceptance instructions where actual access is unavailable.

## M0 — preservation and current inventory

- Record branch/commit/status and verified recovery copies of every affected source/config/test/document before editing. Keep earlier staged business-file exclusions and unrelated changes intact.
- Refresh the complete folder/file-group map, including hidden and ignored groups, file types/sizes, tracked status, consumers, reproducibility, sensitivity, A-H classification and confidence. Inspect directory reparse metadata before traversal; never follow an external or unknown link target. Treat verified OneDrive placeholders as local paths, not external links.
- Record SHA-256 of the six retained business files before/after without printing contents. Preserve `.env` and other secrets in place; inventory names/metadata only. Keep approved opening-stock sources, backups, SQLite and all unique historical/release evidence. No real-record restore/seed is included.
- Inspect code/config/script/test references and TypeScript module reachability before deleting source. Unproven candidates remain H, retained with the reason recorded; source age and lack of a static import are insufficient.

## M1 — small, proven cleanup

1. Recheck and remove only empty, non-reparse workspace directories `-c/`, `.exe/`, `net use/`. Verify their resolved targets are inside this workspace, use exact literal paths and no recursive deletion. Recovery is exact empty-directory recreation.
2. Move the identical implementations of `normalizeName` and `uniqNames` from `src/app/uiHelpers.ts` and `src/store/storeShared.ts` into `src/shared/lib/nameUtils.ts`. Preserve both existing export APIs through re-exports so consumers, including historical/loan-related callers, keep the same behavior. Retain the separately scoped legacy-data normalization and server identity normalization. Test first-casing, whitespace, case-insensitive uniqueness and unchanged ordering; no financial formula changes.
3. Remove `src/features/directory/components/DirectoryPage.tsx` and `src/features/register/components/ExpenseForm.tsx` only after confirming no runtime, dynamic/config, script, test or alternate entry-point consumer. Current replacements are `VendorDirectoryV2` and `RegisterPaymentForm`, covered by DIR-01 and F45 finance scenarios. Preserve historical reports/findings that name the retired files and document the mapping. Keep shared cheque/loan utilities still used elsewhere.
4. Inspect the remaining static-unreachable candidates and all declared dependencies. Remove no additional module/dependency unless evidence establishes a duplicate/retired role and replacement coverage. Retain test/preview/compatibility modules and label uncertain cases.
5. Hash-review safe source/document/build copies in release/output groups for duplication, but retain historical context and unique nested files. No blanket output/cache/archive deletion. Retaining a confirmed duplicate inside a historical release is an explicit retention outcome, not unfinished housekeeping.

## M2 — close narrow UI findings

- Investigate bill-dialog focus using the existing B3-07 case, actual refresh/layout changes and captured focus events. Preserve its assertion. Reproduce desktop/mobile opener replacement/visibility, native Escape/Close, and React effect cleanup ordering.
- Apply a minimal fix in `src/features/pos/components/useReceiptDialog.ts` if supported: preserve the original visible opener, resolve a visible replacement rather than a hidden responsive duplicate, cancel stale restoration work when reopened, and avoid stealing focus from another dialog/user-selected control. Do not change bill/refund posting. Add focused regression in the existing refund suite and rerun related receipt/dialog scenarios. Keep the original intermittent failure open if evidence does not establish resolution.
- Forward explicit `id`/accessible-name/description props from `src/shared/ui/native-select.tsx` to the actual `SelectField` trigger in `src/shared/ui/select-field.tsx`. Verify Logs Date range by accessible name and preserve all selection/keyboard behavior.
- Put the recorder UID in `src/features/pos/components/PosBillView.tsx` under collapsed Details; retain the visible recorder name and stored audit identity. This is presentation only.

## M3 — coverage and one current execution path

- Add a deterministic same-product last-unit race to `tests/drill/checkout.spec.cjs`. Seed stock 1/revision 1, prepare two distinct authenticated biller intents against that same revision, hold both real requests until both arrive, then release together. The current server increments product revision: require one accepted bill and one stale-product rejection, stock 0, one movement and 9000-paise drawer delta; retries must have no duplicate effects. Do not introduce a new negative-stock prohibition; refreshed negative-stock behavior remains its separate existing contract.
- Extend the existing dialog regression for actual layout/refresh conditions and accessibility checks. Add no alternate drill framework.
- Keep `tests/drill/run.cjs` as the current browser entry point and `full-financial-acceptance.cjs` as the comprehensive entry point. Add a full mode/clear package commands reusing existing static, Functions, Rules, smoke, full browser and concurrency suites. Make the opt-in stock/vendor Rules coverage explicit in full regression; retain historical loan exclusions. Preserve useful older focused commands but label historical investigation tools rather than deleting them.
- Update scenario/coverage metadata to map every active page/tab/role/write family to source/tests, with explicit uncovered/manual rows. Retain historical inventory and dated results. Capture current screenshots/traces and persisted-state evidence in fresh per-run locations.
- Prepare a device/timed acceptance runbook with explicit project/endpoint gates. Do not expose local services on LAN, start tunnels or use production to compensate for missing hardware. Actual devices/owner phone, scanner, printer, installed-PWA/update and real midnight checks remain Blocked/Not Run unless access and timing are genuinely available. Opportunistically run the existing real IST/UTC test only in its genuine time window; never mock request.time.

## M4 — security and performance review

- Run read-only npm audits for root/all, root/runtime and Functions; no install, lockfile change or automatic fix. Assess dependency paths, production reachability and advisory scope using installed code and primary advisory sources. Report severity, evidence, practical mitigation and proposed upgrade separately; do not apply upgrades under this plan.
- Measure current bundle output, query/listener lifecycle and locally observable navigation/resource timing using the existing isolated infrastructure. Distinguish network targets from billable Firestore reads and desktop timing from device performance. Propose optimizations only where measured; do not split modules merely for size.

## M5 — final organization and deliverables

- Maintain `README.md` as entry point, `docs/architecture/ARCHITECTURE.md` for current architecture, `drill.md` for the executable runbook, and dated `docs/operations/drills/` reports for curated evidence. Raw runs/recovery snapshots remain ignored under `output/`. Current completion/retention/cleanup/coverage registers live under `docs/operations/` with one index. Historical plans/results remain immutable and clearly labeled.
- Update current navigation, backend ownership, data locations, test commands, release-vs-working-tree limitations and roadmap. Add a local maintenance entry to the version log without claiming a release/tag/deployment.
- Deliver before/after folder map, exact deletion/consolidation/retention manifest, data/archive register, current docs entry point, commands/coverage/exclusions, reproducible setup, scenario matrix/evidence, prioritized findings, physical-device gaps, recovery instructions and readiness assessment.

## M6 — validation and closure

- Baseline targeted new regression before its source fix where feasible. After each coherent batch run meaningful focused tests, lint/typecheck and preserved behavior checks.
- Verify exact demo services and outbound guards before any browser mutation; use synthetic fixtures and one owner per shared fixture. Keep Telegram/external delivery isolated. Use real Auth/Rules/Functions for acceptance; label focused unit mocks.
- Run the updated comprehensive static/support/browser path after local changes, preserving raw failures and every intended suite. Repeat relevant focus/race scenarios with fresh fixtures. Do not weaken failing checks or delete coverage to obtain green results.
- Stop only owned processes, verify local service ports, compare business-file hashes and retained recovery snapshots, check the current diff and all pre-existing staged removals. No commit, push or deployment.

Implementation status and exact evidence will be recorded in the completion report. Hardware, timing, uncertain data recovery and unsupported upgrade decisions are reported explicitly instead of being treated as passing acceptance.

## Execution refinements from verified discovery

- Two opt-in Functions suites need explicit handling in the comprehensive runner: operations revision on the main loopback Firestore with its dedicated demo project, and Telegram on its pre-existing strict `demo-telegram-alerts`/8189 contract. Reuse the cached official jar in the current runner; no install, external delivery or parallel test system. The final full sequence is static/support/Telegram/browser. Telegram transport remains an explicitly labeled collector while database transactions/Rules are real.
- Routine tests depended on the private retained opening-stock CSV. Preserve the exact historical workbook check as opt-in `RUN_APPROVED_CATALOGUE_EVIDENCE=true`; use one shared synthetic fixture for permanent parser/import-denial coverage. This preserves business files and supports a clean public clone without those operational records.
- Add active profile disable/role removal with three independent authenticated browser sessions to close an available automation gap. Physical-device execution remains separate.
- A local pre-scenario reset returned emulator `ABORTED: Transaction lock timeout`. Record status/message and allow at most three idempotent reset attempts only for that exact local bootstrap conflict, repeating isolation/loan health gates; all other reset failures abort. No application financial retry, assertion or expected outcome is relaxed.
- An intermediate dev-server run overlapped source/test edits and observed an extra document load during receipt inspection. Preserve its failures as interrupted evidence, freeze all source/test/config changes, then run final acceptance. Do not label that reload an application defect without an uncontaminated reproduction.
- The newly enabled operations revision suite was found to mix ordinary reference checks with a synthetic loan marker. Its original execution is retained as a scope incident, not exclusion-compliant acceptance. After the current frozen browser run ends, preserve/split the loan-specific assertions into an explicitly skipped check, guard cleanup against loan records, and rerun the affected backend layer. No loan behavior/records may be changed to make the test pass.
- Close the available desktop browser-restart gap through the existing finance-followup suite and shared guarded session helper: launch a new synthetic persistent Chrome profile, lose an acknowledgement after a real expense commit, close its owned Chrome process, reopen that same profile in a fresh process, verify restored real Auth/pending intent, recover once and reconcile the original5000-paise expense/drawer effect. Retain explicit process-lifecycle proof; no copied storage/auth mocks and no PWA/physical-device claim. Apply this test-only extension after the frozen run; rerun helper-dependent focused coverage, concurrency and the new case. Application/backend source remains unchanged. Physical-device/native-PWA restart remains separate.
