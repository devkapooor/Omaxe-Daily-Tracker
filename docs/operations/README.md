# Operations and maintenance index

Current source review: 31 October 2026, local working tree based on `main` / `ccc0eb458d73999aa2877427b3bea0df2d875004`. Existing unrelated edits and staged data exclusions remain. Application code, Rules and Hosting were subsequently deployed on 31 October 2026; see the current deployment record below. No Git commit or push was made. Older reports retain their original evidence scope.

| Need | Current location |
|---|---|
| Latest historical Cashout safety deployment and audited duplicate-debit correction | [Historical cash timing and correction](HISTORICAL_CASHOUT_SAFETY_2026-11-01.md) |
| Latest historical expense deployment, owner steps and evidence | [Historical Cashout expenses](HISTORICAL_EXPENSE_RECONCILIATION_2026-11-01.md) |
| Latest vendor UI deployment and verification | [Vendor reset card and compact invoices](VENDOR_INVOICE_UI_2026-10-31.md) |
| Latest counter-date fix deployment and verification | [Counter date correction](COUNTER_DATE_FIX_2026-10-31.md) |
| Latest deployment, validation and recovery | [31 October deployment](DEPLOYMENT_2026-10-31.md) |
| Vendor and Settings scope; remaining owner data actions | [Release register](PENDING_RELEASE_2026-10-31.md) |
| Consolidated authorization, scope and batches | [Maintenance completion plan](MAINTENANCE_COMPLETION_PLAN_2026-10-31.md) |
| Before/after folders, cleanup manifest, data retention and recovery | [Folder and retention register](MAINTENANCE_FOLDER_REGISTER_2026-10-31.md) |
| Completion status, measured findings, results and readiness | [Completion report](drills/2026-10-31-maintenance-completion.md) |
| Every current automated browser outcome | [Results matrix](drills/2026-10-31-maintenance-matrix.md) |
| Current command / workflow / suite / tool inventory | [Test coverage map](TEST_COVERAGE.md) |
| Safe reproducible setup and execution | [Root drill runbook](../../drill.md#current-maintenance-execution--31-october-2026) |
| Physical devices, PWA, scanner, printer and real midnight | [Acceptance checklist and gaps](DEVICE_ACCEPTANCE.md) |
| Security advisories and measured performance | [Read-only review](SECURITY_PERFORMANCE_REVIEW_2026-10-31.md) |
| Current architecture and entry points | [Architecture](../architecture/ARCHITECTURE.md) |
| Data/domain references | [Data model](../domain/DATA_MODEL.md), [calculations](../domain/CALCULATIONS.md), [vendor ledger](../domain/VENDOR_LEDGER.md); verify historical statements against current source |
| Existing release procedure | [Release process](RELEASE_PROCESS.md), [rollback](ROLLBACK.md), [version log](VERSION_LOG.md) |
| Previous discovery and repair evidence | [30 October inventory](MAINTENANCE_REVIEW_2026-10-30.md), [repair plan](DRILL_REMEDIATION_PLAN_2026-10-30.md), [repair results](drills/2026-10-30-drill-repairs-results.md) |

`README.md` is the project entry point; this index directs operational work. `drill.md` is the single execution runbook, not the old batch wrappers. `docs/operations/drills/<date>-*.md` contains curated, date-scoped acceptance evidence. `docs/archive/` contains already archived historical decisions. Dated plans/checkpoints remain where their existing links point; do not create a catch-all archive or silently rewrite historical results.

Local `data/pos/`, `docs/backups/`, `server/omaxe.db` and ignored secrets stay in place with unresolved retention/recovery decisions. `output/playwright/<run>/` contains raw synthetic drill evidence; `output/maintenance-completion-20261031/` contains this maintenance's inventories, audits and recovery snapshots. These local ignored locations are not durable backups or public-report material. Current `.gitignore` exclusions do not erase public Git history.
