# Historical Cashout: already removed versus removing now

**Deployed and incident corrected on 1 November 2026 IST.** The owner confirmed that the cash behind the reported 17 October historical Cashout had already been removed, and approved an audited correction of the duplicate debit. `postFinanceOperation`, `getFinanceCashoutSummary`, and Hosting were deployed and verified. The scoped production correction restored ₹14,300 once.

## Behaviour

Past-date Cashouts require an explicit choice; there is no default that silently withdraws cash:

- **Cash already removed:** owner confirmation of an earlier physical removal. Records historical Cashout/sales/Cash Movement history, without reserving or debiting the current drawer. The original denominations are entered as historical particulars. Live billing can continue, and the historical amount need not fit today's balance.
- **Removing cash now:** uses the existing physical count/reservation, available-balance and once-only debit checks. Current-day Cashout remains unchanged.

Old historical quotes without the choice are rejected before any closing write and must be cancelled/restarted. Both preparation and closing enforce ownership for the already-removed choice. A role change after preparation cannot bypass that restriction. The saved quote binds the choice, so the closing request cannot switch it.

## Duplicate deduction correction

As owner, select the past date in Cashout, expand **Correct duplicate drawer deduction**, enter a reason, confirm that cash was already removed earlier, and review the correction amount before saving. The feature uses the existing financial recovery journal. Losing the success response must recover the original operation, not create another correction.

The server verifies the selected Cashout, matching original closure, revision and immutable `financeOperations` posting history. It rejects missing/inconsistent evidence, pending Cashout corrections, ambiguous multiple candidates, active counts and stale previews. Direct client writes are denied by existing Rules.

For new postings and count corrections, each immutable posting result includes the exact drawer checkpoint against which its actual balance delta was applied. Only deltas still belonging to the current checkpoint are compensated. Existing older postings require verified physical-count and subsequent drawer-reset evidence. Both actual login/logout counts and daily Cashout/legacy repair closures can replace the live baseline, even when a closing retains an older reconciliation ID. Ambiguous legacy timestamps within one second are rejected rather than ordered by guesswork.

Consequently, a later count/closing may make the correct restoration zero or partial. A preview is invalidated when its checkpoint, source posting evidence or Cashout changes; ordinary later sales/expenses are preserved and the actual live balance is read again at commit. Repeated clicks, two simultaneous corrections and recovered identical operations cannot restore cash twice.

The correction:

- Preserves the Cashout amount, sales, expense sources, original closure, denomination history, original debit and Cash Movement balance.
- Creates append-only `cashoutDrawerCorrections/{operationId}` evidence: original debit, amount still restored, before/after balance, count absorption, checkpoint, reason, actor and timestamp.
- Records the result under the existing immutable `financeOperations` journal and marks the Cashout as already removed with a reversal reference.
- Adjusts only `handover/main.cashNetPaise` by the remaining signed effect when nonzero. It never assigns a fixed drawer balance or changes the checkpoint. A zero correction changes no drawer document.
- Prevents subsequent historical denomination corrections or the legacy Apply to drawer operation from deducting this already-removed amount again.

Historical reporting still credits the original recorded holder through the existing Cash Movement calculation. This correction does not invent or erase historical deposits/transfers; discrepancies in those records require a separate reconciliation.

## Files and evidence

Server entry points remain `postFinanceOperation` and `getFinanceCashoutSummary`. `functions/historicalCashoutReversal.js` owns the reversal review/transaction; `financeCashout.js` binds timing and handles no-debit historical closes. The existing Cashout screen, details, financial repository and drill runner are reused. `HistoricalDrawerCorrection.tsx` is a separate owner control from expense reconciliation to make the two effects clear.

Evidence: `output/historical-cashout-safety-20261101/`. Pre-existing working files and hashes are preserved under `before/` and `baseline-manifest.json`. Final checks and file hashes are in `acceptance.json`; `task-delta.patch` contains this task's changes only. Baseline source evidence is the previous accepted historical-expense release. Raw screenshots, traces and persisted-state evidence are under `output/playwright/historical-cashout-safety-20261101/batches/`. Failed attempts are retained and explained in acceptance evidence rather than removed.

The existing finance posting emulator suite now covers explicit timing, owner/role enforcement, legacy quote rejection, no-debit record keeping during current expenses, the duplicate-debit regression, intervening financial activity, later physical counts/closings, partial post-count corrections, stale/concurrent reversal, subsequent denomination correction, active count/pending/evidence failures and indistinguishable legacy timestamps. Existing checkout, refund and historical expense checks remain included.

Browser checks use real emulator Auth/Rules/Functions and synthetic sources. F45-20 exercises an independent billing session during an owner historical record; F45-21 exercises the audited correction and a lost successful response. F45-17/18/19 retain overnight, physical historical withdrawal and expense reconciliation/recovery coverage. Loan mutations and external messages remain excluded. Phone viewport evidence is not physical-device, hardware or PWA acceptance; service workers remain blocked.

Reuse the existing Node 22 drill entry point with a fresh run ID:

```powershell
$env:DRILL_RUN_ID = 'historical-cashout-safety-fresh'
node tests/drill/run.cjs start
node tests/drill/run.cjs smoke --grep ENV-01
node tests/drill/run.cjs finance-followup --grep 'F45-20|F45-21|F45-18|F45-19|F45-17'
node tests/drill/run.cjs stop
```

Handler checks use isolated databases on the guarded loopback emulator:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:GCLOUD_PROJECT = 'demo-historical-cashout-safety'
node --require ./tests/drill/server-guard.cjs --test functions/financePosting.integration.test.js functions/posRefunds.integration.test.js functions/posCheckout.integration.test.js
```

## Release and production repair

The two changed Functions were deployed before Hosting. The frozen 27 runtime files in each deployed Function and all 11 hosted files matched release hashes. Rules, indexes, dependencies, Telegram, and 35 other Functions were unchanged. Deployment evidence is under `output/historical-cashout-safety-release-20261101/`, including source ZIP comparison and live Hosting hashes.

The separate approved production correction used the same frozen transaction handler through a narrowly scoped maintenance adapter authenticated by the actual Google IAM operator. It was tested in a dedicated synthetic Firestore database before use. The live read-only preview identified exactly one eligible 17 October Cashout, an original duplicate debit of ₹14,300, and no later count absorption. At posting, the current balance changed from ₹8,659 to ₹22,959 by adding only ₹14,300 to the live net movement. The original sales, cash movement control, closure, and finance operation retained matching hashes; the original Cashout amounts were preserved. The append-only correction and immutable finance operation use `approved-drawer-repair-2026-10-17-v1`. An identical second request returned the recorded result without a second adjustment. A separate fresh read confirmed the audit, operation, reversal link, and unchanged original record hashes. Evidence: `approved-repair-preview.json`, `approved-repair-result.json`, `approved-repair-verification.json`, and `maintenance-selftest.json` in the release folder. The displayed drawer can change after subsequent genuine transactions.

No historical expense reconciliation was applied as part of this incident. The owner can separately confirm the dated expense total in the Cashout screen.

For recovery, preserve the deployed previous release and these before copies. Review later edits before restoring individual files; never reset/stash unrelated work. After a correction is posted, retain its original operations and audit evidence, and review a compensating change rather than deleting history or blindly rolling back its data.
