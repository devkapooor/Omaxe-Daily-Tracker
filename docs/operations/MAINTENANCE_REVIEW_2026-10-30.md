# Maintenance Review — 2026-10-30

> Historical Phase 1 discovery snapshot below. Subsequent implementation and current drill/banner findings are recorded in [DRILL_REMEDIATION_PLAN_2026-10-30.md](DRILL_REMEDIATION_PLAN_2026-10-30.md). Statements below about a clean tree, unapproved implementation and unrun browser checks describe the original discovery baseline, not the current working tree.

Current approved drill repair execution: [30 October repair results](drills/2026-10-30-drill-repairs-results.md). The repair batch and full isolated verification have completed. All 22 repair targets passed; the report retains a separate intermittent focus failure, three browser skips and physical-device gaps.

## Scope and authorization

This is the Phase 1 read-only discovery, baseline, risk review, and proposed cleanup plan. It does not authorize implementation. No application files, data, configuration, dependencies, Git history, or cloud state were changed. The only workspace addition is this planning report, which is untracked until reviewed. Test output was directed to temporary paths or existing ignored evidence locations; see the baseline notes below.

The inspection inventoried tracked, ignored, and untracked paths, reviewed project guidance and key source/configuration/test/documentation groups, and used bounded listing for large artifacts. It did not read every source line or dump business datasets. Sensitive values and financial rows were not copied into this report. `rg` and Git inspection did not follow external directory symlinks. Four OneDrive Cloud Files directory reparse points (`.git`, `node_modules`, `server`, `src`, tag `0x9000e01a`) were identified; Windows reported no target path, so these were treated as cloud placeholders and no external target was traversed.

## Current repository and environment

- Branch `main`, HEAD `ccc0eb458d73999aa2877427b3bea0df2d875004`, tracking `origin/main`; commit subject `Complete stock and vendor workspace improvements`.
- Before review, the working tree was clean. Read-only checks left it clean; this report is the sole untracked planning addition. No unrelated edits were present to preserve.
- No project `AGENTS.md` was found in the checked project/ancestor locations.
- App: React 19, TypeScript, Vite, Firebase Auth/Firestore. Functions source is `functions/`; Firebase rules and indexes are configured in `firebase.json`.
- `.firebaserc` names `alphahub-f137b` as default. `firebase.json` configures Hosting and Node 22 Functions. `firebase.drill.json` and `tests/drill/` provide local emulator drill configuration.
- `origin` is the GitHub repository `devkapooor/Omaxe-Daily-Tracker`. GitHub API currently reports it as public. This is a containment/retention concern because the repository tracks backup and operational data. This review did not change visibility or inspect those records.
- Read-only production checks: Hosting returned HTTP 200 and served the same Vite asset names as a local build. `firebase functions:list --project alphahub-f137b` showed 35 ACTIVE Node 22 functions (28 default, 7 Telegram). This does not prove current deployed Functions source matches HEAD; deployed Rules/indexes source parity was not established. No production business records were read or written.
- Local system runtime is Node 24.14.1; a retained portable Node 22.23.4 runtime exists at `output/node22-upgrade-2026-10-29/node-v22.23.4-win-x64/node.exe`. Emulator backend suites were run on Node 24 in the prior baseline; repeat on the retained Node 22 runtime before treating that baseline as an exact runtime match.

## Folder and file-group map

Status legend: tracked/untracked/ignored refers to current Git state. “Unique/sensitive” indicates retention risk, not a finding that every file contains sensitive content.

| Location | Purpose, size/type, status | Consumers / reproducibility | Sensitivity and disposition |
|---|---|---|---|
| `src/` | 247 tracked source files, about 1.32 MB; mostly TS/TSX | Current app entry points `src/main.tsx` and `src/features/settings/TelegramAlertsEntry.tsx`; not generated | **A Active application material.** Retain. Fourteen source modules were unreachable from the static entrypoint graph; dynamic/config/test/history references mean these are review candidates only, not deletion instructions. |
| `functions/` | 42 tracked files, about 0.66 MB plus ignored local files | Firebase Functions source, policy modules, tests, Telegram isolated packaging | **A Active application material.** Retain. `.env.telegram.local` and `.env.telegram.secret.json` are ignored local secrets; no values read. `telegram-package-lock.json` is intentionally consumed by `prepareTelegramFunctions.js`. |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `firebase.drill.json` | Tracked security/runtime/project configuration | App, emulator, deploy scripts | **A Active config.** Retain and review carefully. Local test config uses demo ID/loopback; production config is separate. |
| `tests/` | 70 tracked test/support files, 58 under `tests/drill/` | Vitest, Firebase Rules emulator, Playwright drill runner | **C Reusable test infrastructure/fixtures.** Retain. Several suites have stale assumptions or are omitted by “all”; fix execution map before retiring tests. |
| `docs/` | 69 tracked files, about 1.46 MB; includes Markdown, JSON evidence, image, HTML, ZIP | Current guidance, architecture, operations, dated reports | Mix of **C reusable guidance** and **D unique historical evidence**. Preserve dated reports and attachments. Reconcile current entry points after approval; do not overwrite old evidence. |
| `restructure.md`, `drill.md` | Tracked root planning/runbook docs; drill is 1,607 lines | Existing cleanup/drill plans and runner | **C/H.** Reuse and reconcile. `restructure.md` says repo visibility unknown and describes old reparse handling. `drill.md` repeats baseline heading 3 times and contains one partial-receipt case inconsistent with current owner policy. Keep historical content until a reviewed replacement is approved. |
| `docs/backups/` | Three tracked JSON backup records | No ordinary app runtime consumer identified in this review | **B/G.** Potential unique business records. Contents were not read. Retain; separate retention/recovery decision required. |
| `data/pos/` | Two tracked files, about 2.1 MB: approved opening-stock CSV and evidence JSON | Current tests/fixtures reference both | **B/C/G.** Likely operational source/evidence with test use. Retain; do not rewrite or relocate before owner confirms canonical status. |
| `server/omaxe.db` | Tracked SQLite DB, 49,152 bytes; historic according to old audit | No current source consumer found in limited reference search; old reports discuss it | **B/G/H.** Do not delete based on non-use alone. Inspect schema/record counts in a separately approved, privacy-safe retention review. |
| `public/` | Five tracked static assets | Vite build | **A Active app assets.** Retain. |
| `scripts/` | Three tracked tools | Build/policy generation, guarded staff-view publishing | **A/C.** Retain. `publish-staff-views.mjs` has explicit target/release guards. Finance policy generator writes tracked files; only a no-write parity comparison was attempted and found drift (see findings). |
| `.git/` | Git metadata, reparse placeholder | Source history/remotes | **A/G.** Preserve. No history rewrite. Public visibility is an owner containment decision, separate from file cleanup. |
| `node_modules/` (root and `functions/`) | Ignored installed dependencies | Reinstallable in principle from locks, but reproducibility depends on registries/toolchain | **F.** Regenerable; retain during this review. No install or upgrade performed. |
| `dist/` | Ignored Vite build, 11 files/about 1.54 MB | Reproducible build output | **F.** Retain; no cleanup. Baseline build output went to `%TEMP%`, leaving this untouched. |
| `.firebase/` | Ignored local Hosting/emulator cache | Reproducible/local tooling | **F/H.** Retain unless verified cache and recovery path are approved. |
| `.playwright-cli/` | Ignored 87 entries/about 0.59 MB, snapshots/logs/screenshots | Playwright CLI runs | **D/F/H.** Run-specific evidence may be unique. Preserve until grouped by run and evidence owners confirm retention. |
| `logs/` | Ignored 10 entries/about 1.23 MB including logs/screenshots/config | Local testing | **D/G/H.** May contain identifiers or unique diagnostic evidence. Preserve; review privacy and retention before redaction/removal. |
| `output/` | Ignored; about 6,083 files / 712 MB excluding `node_modules`; many dated releases and evidence | Historical builds, patches, Node22 rollout package, Playwright output | Mix of **D/F/G/H**. No blanket cleanup. Includes `output/node22-upgrade-2026-10-29` with runtime and rollout evidence, `output/playwright` (~4,351 files/~550 MB), `output/pos-quick-add`, `output/stock-vendor-release-2026-10-29`, older POS release trees, QA reports and scripts. Treat each run/release separately; verify hashes and recovery before duplicate removal. |
| `-c/`, `.exe/`, `net use/` | Three unusual empty local directories, untracked/ignored state | No consumer found | **H.** Possible typo-created directories; candidates for deletion only after exact-path approval and recheck. |
| `.env`, `functions/.env.telegram.local`, `functions/.env.telegram.secret.json` | Ignored local configuration/secret files; sizes 444/168/163 bytes | Local app/functions config | **G.** Values not read or reported. Do not stage, relocate, print, or delete as cleanup. Confirm authorized storage/rotation separately if exposure is suspected. |

Tracked files total 463. `.gitignore` excludes local env files, dependencies, build output, logs, Firebase cache, local rules config, Playwright cache, and `output/`; ignored status does not imply disposable.

## Data, privacy, and archive register

| Material | Current evidence | Decision needed |
|---|---|---|
| Public GitHub repository | GitHub API reports `private=false`; tracked paths include backups, operational stock data, and a historic database. Values were not inspected. | Owner should urgently decide containment (for example, make repository private) and separately review whether any tracked records require incident handling. Changing visibility is not part of cleanup authorization and cannot recall existing clones. |
| `docs/backups/*.json` | Three tracked backups; historical audit characterized them as business/personal records, but current content was intentionally not inspected. | Identify canonical backup, recovery test, retention period, and whether versions are redundant. Do not delete or rewrite history without approval. |
| `data/pos/*` | Both tracked, current test references found. | Confirm if approved CSV/evidence pair is canonical operational source, test fixture, or both; preserve until answered. |
| `server/omaxe.db` | Historic DB path; no current code consumer found in limited reference check. | Decide whether to retain as a recovery artifact. Do not infer that it is empty from older reports. |
| Local ignored secrets | File names and sizes only; secret contents never read. | Verify that the files are needed locally and excluded from backup/sharing. Any rotation or movement is a separate security action. |
| `output/`, `logs/`, `.playwright-cli/` | Large ignored collections with dated runs, traces, screenshots, runtime archives and release copies. | Keep by default. A future duplicate manifest must name exact source/retained copy, hash equality, unique nested files, recovery source, and retention owner. |

## Test and drill coverage map

| Command / suite | Baseline result | Purpose and limitation |
|---|---:|---|
| `npm test` | 34 files, 172 tests passed | App unit/domain tests. No production mutation. |
| `npm run build` (equivalent TS checks plus Vite to temp output) | Passed | TypeScript app/config checks and production bundle. Two large chunks warned: Telegram settings JS 594.88 KB (185.03 KB gzip), main JS 911.78 KB (266.35 KB gzip). Not workflow acceptance. |
| `npx eslint src` | Failed: 3 errors, 2 warnings | Effect/state lint issues in VendorDirectoryV2, SettingsPage and StockReturnTab; Telegram entry fast-refresh warning. |
| `npm run lint` | Failed: 33,896 problems (33,889 errors, 7 warnings) | `eslint .` applies browser/TS rules to CommonJS Functions/drill files and also scans ignored `output`. Many `require/module/process` false positives. Runner scope/config issue; does not represent 33k distinct app defects. |
| `npx eslint --config tests/drill/eslint.config.mjs tests/drill` | Passed | Drill-specific lint. |
| Functions `npm test` with retained portable Node 22.23.4 and no emulator env | 22 pass, 9 emulator-dependent suites skipped | Confirms the Functions unit baseline on the configured major runtime; isolated emulator integrations below were previously executed under Node24 and should be repeated on Node22 before acceptance. |
| Functions emulator integration | 119 passed, 0 failed; selected gated suites skipped | Isolated Firestore emulator, project `demo-functions-maintenance`, loopback; no prod. Executed under Node24, so repeat with retained Node22 before final acceptance. Metadata probe’s attempted link-local metadata connection was blocked by network guard. |
| Firestore Rules emulator | 131 passed, 8 skipped, 1 failed; 9 suites passed, 1 failed, 1 skipped | Isolated demo project, Firestore only, loopback; loan mutation exclusions retained. Failed partial-GRN contract is stale versus complete-delivery/credit-note policy (details below). |
| Browser drill `node tests/drill/run.cjs all` | Not run | Existing runner is mutation-capable against demo emulator and requires explicit safe endpoint preflight; not executed in this Phase 1 baseline. |
| Local Vite build output | Passed, same asset names as hosted HTML | Hosting GET is not proof of deployed source parity or full functionality. |

`tests/drill/run.cjs` discovers 14 `.spec.cjs` suites, but `all` runs only seven: smoke, financial, concurrency, remaining, advanced, closure, resilience. It omits checkout, finance, financeFollowup, refund, stock, stockResidual, remediation. `full-financial-acceptance.cjs browser` runs 12 but omits financeFollowup/remediation and pins an old Node20/run ID, risking overwriting dated evidence. No browser drill was run. Existing `tests/drill/playwright.config.cjs` blocks service workers and runs one worker; these are automated browser contexts, not physical devices or installed-PWA validation. Hardware/manual scanner, printer, actual second device and owner-phone acceptance remain **Not Run**.

The existing inventory and current drill runner should be consolidated after approval. Do not add another parallel drill system. Tests should retain auth/Rules/Functions behavior, synthetic fixtures, independent arithmetic and independent persisted-state assertions. Loan mutation stays excluded absent explicit approval.

## Baseline failures and prioritized risks

### P0 — Public repository with tracked business/backup material

Evidence: GitHub API reports public; tracked backup, operational data, and database paths exist. Record contents were not inspected. This is an exposure/retention concern, not proof that specific sensitive fields are present. Recommend a separate owner-controlled containment decision promptly. No visibility change or history rewrite was performed.

### P1 — Generated Functions finance policies drift from source contracts

Evidence: in-memory, no-write TypeScript transpilation/hash comparison found `functions/vendorLedgerPolicy.js` and `functions/cashoutPolicy.js` differ from the current `src/domain/vendorLedgerV2.ts` and `src/domain/cashoutCorrections.ts` generation. Runtime consumers include `financeCashout.js`, `registerPayments.js`, and `vendorFinanceDecisions.js`. The generator itself writes these files. This may cause server/browser policy disagreement; exact financial impact is not established. Reproduce with `node scripts/syncFinancePolicies.cjs` only after approval because it mutates tracked policy files, then inspect diff, run targeted Functions and Rules regressions, and verify intended compatibility. Do not deploy as part of cleanup.

### P1 — Obsolete partial receipt assertion conflicts with current business rule

Evidence: `tests/pos.repository.rules.test.ts` expects a second partial GRN tied to a full invoice, while current `functions/stockReceiving.js` requires a complete receipt or shortage credit-note workflow. Current stock/vendor documentation says deliveries are complete and shortages are canceled/credited. Treat as stale test behavior, not proof of app defect. Replace scenario after approval while retaining rejection/no-partial-write and payable/stock reconciliation checks.

### P1 — Drill `all` omits seven registered scenarios

Evidence: runner suite registry vs `all` command mismatch above. Reconcile deliberate exclusions/ordering and per-run evidence paths; do not simply append mutation suites without isolation review.

### P1 — Routine lint command is unusable as a signal

Evidence: root `eslint .` scans CommonJS and ignored output with app rules; focused `src` lint has three concrete errors. Propose scoped ESLint configs/ignores and keep drill/Functions lint separate with explicit commands. Do not use automatic lint fixes.

### P2 — Docs and test guidance drift

`restructure.md` is dated 2026-10-09 and says repository visibility is unverified; `drill.md` repeats an initial section three times and contains a partial receipt expectation that conflicts with current policy; `docs/operations/QA_CHECKLIST.md` suggests loan mutations and says browser automation is outside cleanup, conflicting with this task’s loan exclusion and planned drill. `docs/operations/VERSION_LOG.md` latest entry is v1.5.2 dated 2026-10-12, behind current release work. Preserve dated evidence; update current entry points and mark old reports historical rather than editing past results.

### P2 — Large frontend chunks

Build warns main 911.78 KB and Telegram settings 594.88 KB (uncompressed). Measure route usage/read cost before proposing splitting; bundle size alone is not a correctness issue.

### P2 — Dependency audit findings

Root audit: 14 vulnerable package groups (10 high, 1 critical, 1 moderate, 2 low); production-only tree: 3 groups (2 high, 1 critical). Functions audit: 11 groups (1 high, 10 moderate); high finding is transitive `body-parser@1.20.8`; other moderate Admin/Google SDK changes suggest breaking upgrades. Runtime reachability and exploitability are not established. Do not auto-fix; assess package paths and propose controlled upgrades separately.

### Candidates requiring source/consumer proof before any cleanup

- Fourteen non-test TS/TSX files were unreachable from the two static app entrypoints. Several have direct test or historical references; planner/preview modules are internally linked and old architecture docs say preview workflows consume them. DirectoryPage and ExpenseForm may be retired/legacy but require route/config/action-center checks. None is approved for removal.
- Exact duplicate `normalizeName`/`uniqNames` implementations were previously reported between `src/app/uiHelpers.ts` and `src/store/storeShared.ts`; a legacy-specific third implementation exists. Recompare semantics and side effects before consolidating.
- Three empty unusual directories (`-c`, `.exe`, `net use`) are possible typo artifacts; exact scoped deletion candidates only after approval.
- Large `output/` evidence trees contain some reproducible builds but also unique reports/screenshots/runtime files; no duplicate removals are currently confirmed.

## Proposed current documentation and data organization

- Current user/developer starting point: `README.md` plus `docs/operations/QA_CHECKLIST.md` (rewrite its current guidance, preserve its historical notes in dated evidence if useful).
- Current architecture: `docs/architecture/ARCHITECTURE.md`, updated with verified entrypoints, function groups, and generation ownership.
- Current drill entry point: root `drill.md`, shortened to link one current runbook, the exhaustive page/tab inventory, and per-execution evidence; retain dated drill reports as immutable history.
- Operational evidence: retain `docs/operations/drills/<date>-<run-id>/` for tracked, intentionally curated results; ignored local Playwright/emulator evidence stays in `output/<run-id>/` until an owner retention policy says otherwise. Never mix runs or overwrite historical run IDs.
- Business source/backups: keep `docs/backups/`, `data/pos/`, and `server/` in place pending canonical ownership and recovery decision. Do not invent a new archive folder.
- Reproducible build/cache: `dist/`, `.firebase/`, dependencies remain local ignored artifacts; regeneration is allowed only when needed and after recovery check.

## Proposed implementation batches, validation, and recovery

These are proposals only; no implementation is approved by this report.

1. **Documentation/drill command correction:** verify every suite registry entry, define unit/Rules/Functions/smoke/full/concurrency commands, remove duplicate headings, update current policies and manual/device exclusions. Preserve original dated reports. Recovery: revert only the new docs/runner diff; evidence files untouched. Validate command enumeration, lint, dry-run/preflight guards.
2. **Financial policy generation reconciliation:** diff generated copies against intended current contracts; agree authoritative source and generator behavior before applying. Preserve transaction boundaries. Run focused unit, Functions, Rules reconciliation tests. Recovery: restore exact pre-change hashes of the two generated files; never deploy until separately approved.
3. **Lint and focused maintainability fixes:** fix the three `src` lint errors in small isolated edits, then scope root lint to maintained source and explicit CommonJS/test configs. Validate app typecheck/build and focused lint. Recovery via individual file diff reversal.
4. **Stale test contract update:** replace only the partial-GRN test scenario with full receipt/short-line cancellation-credit note and assert stock/payable atomicity, idempotency/reversal. Run Rules/Functions suites. Keep failing test coverage; do not delete it.
5. **Exact confirmed dead/duplicate candidates:** only after route/handler/config/test review, remove individually named confirmed files or consolidate pure helpers. For every unique local file, create and verify a recoverable copy before delete; no broad `output/` or data cleanup.
6. **Comprehensive isolated drill:** preflight exact demo project, loopback endpoints, outbound guards and Telegram isolation; use authenticated synthetic users and independent calculations. First execute existing suites in controlled order, then expand only approved missing scenarios. No production fallback; physical-device/PWA/scanner/printer checks remain manual and explicitly labeled.

## Decisions required before Phase 2

1. Confirm the retention/recovery owner for tracked backup, stock evidence, and `server/omaxe.db`, and decide separately how to contain the public repository. No actual record contents are disclosed here.
2. Review this specific proposed cleanup and reply exactly `APPROVE IMPLEMENTATION` to start Phase 2. That gate does not approve production visibility/configuration changes, Git history rewriting, deletion of sensitive data, or deployment; those require separate explicit authorization.

## Recovery and deployment assessment

No code/config/data/deployment changes were made. Planning report can be removed as a single untracked file if rejected. Builds were emitted to temporary output. Emulators were isolated and shut down; no production records changed. Do not deploy from this review: generated financial policies drift, Rules baseline includes an obsolete contract failure, root lint is noisy, and comprehensive current browser/device workflows have not been accepted. Local passes are baseline evidence only, not release acceptance.
