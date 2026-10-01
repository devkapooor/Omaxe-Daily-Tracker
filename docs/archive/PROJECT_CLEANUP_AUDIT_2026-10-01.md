# Project Cleanup Audit - 2026-10-01

## Baseline and authorization

- Baseline commit: `577716813cd1720870a824883709acda35eb0b9d`; working tree clean before implementation.
- Owner approved the Safe Project and Documentation Cleanup, compact documentation, deletion of proven dead source, and source-folder renaming.
- Preserve the stored `vendor-preview` page key. No UI behavior, finance calculations, permissions, schemas, rules, production data, or loan records may change.
- Public-repository sensitive-data exposure is report-only by owner decision. No visibility changes, history rewriting, backup deletion, or secret copying.
- Commit this evidence before deletions. Validate, commit, and push focused changes. Hosting deployment requires separate confirmation.

## Inventory and dependencies

The baseline has 150 tracked files: 16 at root, 18 in docs (including three JSON backups), five public assets, one SQLite database, 109 source files, and one rules-test file. README is the only root Markdown document; 15 more Markdown documents are under docs.

`index.html` loads `src/main.tsx`, then `App.tsx` and `AppWorkspace.tsx`. Firebase Authentication and Firestore provide live identity and records. Store subscriptions and actions feed the workspace; page selection is role-aware state persisted in local storage. Production startup registers the service worker. Root npm, Vite, TypeScript, ESLint, shadcn, and Firebase configuration remain where their tools expect them.

Source is already grouped into app, config, domain, features, shared, store, and styles. Tests are colocated with source except emulator rules tests under tests. No scripts directory or local server runtime is required. No byte-identical tracked duplicates were found.

Ignored artifacts include node_modules, dist, .firebase, logs, root tool logs, and an incomplete functions folder containing only a lockfile and installed dependencies. The logs folder includes an old built application and Hosting cache.

## Deletion and consolidation evidence

Paths below describe the pre-cleanup inventory. Deleted source remains recoverable from the baseline commit.

| File or folder | Reason | Evidence it is unused or safely consolidated | Risk |
| --- | --- | --- | --- |
| src/features/dashboard/components/DailyCashoutFinalSummaryPanel.tsx | Removed dashboard panel | No imports/references; unreachable from main and source-test roots | Low |
| src/features/dashboard/components/DashboardTables.tsx | Removed dashboard tables | No imports/references; unreachable from main and source-test roots | Low |
| src/features/register/components/PurchaseForm.tsx | Superseded legacy entry form | No consumers; production purchases use PurchaseFormV2 in Vendor Workspace | Low |
| src/features/register/components/VendorPaymentForm.tsx | Superseded legacy entry form | No consumers; production payments use VendorSettlementFormV2 | Low |
| src/shared/ui/typewriter-effect.tsx | Unused animation | No imports/references; login uses its own active motion components | Low |
| docs/operations/PLAN.md, PLANNED_UPGRADES.md, TASK_QUEUE.md | Overlapping current planning | Merge approvals, acceptance criteria, pending work, and deferred ideas into ROADMAP.md before deletion | Low after content review |
| docs/operations/CURRENT_DRILL_PLAN.md and docs/archive/DRILL.md | Duplicate QA templates | Merge unique checks into QA_CHECKLIST.md; retain the historical executed drill report | Low after content review |
| docs/archive/GITHUB_REPO.md | Duplicate repository/release guidance | Repository, branch, baseline, release and rollback references retained in README and operations docs | Low |
| functions/ | Abandoned local scaffold | Only lockfile and node_modules; no manifest/source or Firebase Functions configuration | Low; recheck before removal |
| logs/, root *.log, .firebase/, dist/ | Generated artifacts | Ignored; old builds, diagnostics and Hosting cache can be regenerated | Low; skip files held by active processes |

Before each recursive local deletion, resolve and verify the exact path is inside this workspace, exclude reparse points, and do not follow links outside it. Retain any unexpected source, data, or uncertain file for review.

## Moves and dependency hygiene

- Rename the four-file vendor-preview feature folder to vendor-workspace and update source imports. Keep the existing navigation/local-storage key unchanged.
- Rename SearchableSelect.tsx to searchable-select.tsx, changing only import paths in consumers.
- Archive the complete purchase/vendor/cheque execution plan, retain historical evidence, and extract current rules and implementation limits into docs/domain/VENDOR_LEDGER.md.
- Remove unused direct Radix accordion, dialog, icons, label, and navigation-menu dependencies; no source/config consumers were found.
- Classify Vite, TypeScript, the React Vite plugin, and tw-animate-css as build dependencies. Retain all remaining locked versions; no audit fix or upgrades.
- Keep configuration at root; add generated cache/coverage ignores and use specific Functions output ignores. Keep secrets out of examples.

## Protected and intentionally retained

- `.env` and all existing secret/environment configuration: ignored and never copied into documentation.
- `docs/backups/*.json`: real user/contact, cashout, transfer, vendor, purchase and payment history; unchanged.
- `server/omaxe.db`: tracked legacy SQLite database, unreferenced by the current app; read-only inspection found one store and zero rows in its four finance tables. Kept as historical data.
- Firebase configuration, rules, indexes, domain financial types/calculations, store/repository logic, loan workflows and all production records.
- Active vendor preview/cutover components, legacy-local import utilities, seed store data, PWA assets, tests and financial compatibility code. These remain referenced.
- Shared select wrappers are adapters over SelectField, not duplicate implementations to merge.
- Historical Drill Report and existing release evidence remain preserved.

## Issues and deferred work

- The GitHub repository was publicly readable during the audit. Tracked backup files contain personal and financial data. Moving/deleting their current paths does not remove Git history. Owner chose report-only; exposure remains unresolved.
- No private-key/token signature was found in the targeted tracked-file scan. This was not a complete historical secret audit.
- `npm audit --omit=dev` reported 10 advisories (one critical) during the audit. Transitive package presence does not establish browser exploitability. Investigate and upgrade separately; do not run audit fix in this cleanup.
- Production JavaScript bundle is about 1.17 MB with an existing size warning. Code splitting and large-file refactoring are deferred.
- Baseline Firestore emulator invocation could not find Java on PATH. Do not silently install a runtime or report those tests as passing.
- Current docs describe dormant V2 and old navigation despite the active workspace imports. Correct descriptions based on code, preserving historical statements only in the archive.
- No production write or authenticated browser workflow will be executed as verification. Terminal HTTP checks validate serving/assets only.

## Baseline verification

Audit-stage checks: 51 source tests passed; source/test ESLint passed; TypeScript and Vite production build passed with the existing bundle warning. npm dependency tree resolved. Firestore rules tests were blocked by the Java prerequisite. Implementation-stage verification and exact cleanup outcomes will be appended after the changes.
