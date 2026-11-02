# Calculations And Projections

## Historical Cashout drawer timing - deployed 1 November 2026 IST

For a past-date Cashout, `already-removed` records the historical payout without debiting the live drawer; `remove-now` uses the normal physical count, reservation and one-time drawer debit. The approved 17 October incident correction added the remaining ₹14,300 duplicate debit effect to current `handover/main.cashNetPaise`. It preserved the current checkpoint, all subsequent genuine movements, original historical payout and Cash Movement calculations. The amount was derived from the original immutable debit evidence and verified current count boundary, not assigned from a stale displayed total. See [incident release and audit evidence](../operations/HISTORICAL_CASHOUT_SAFETY_2026-11-01.md).

## Current-source scope ? 31 October 2026

Current trusted posting arithmetic belongs to the checkout/refund/stock/finance Functions handlers and their existing policies, not the historical client projection descriptions alone. Shared metrics are owner-derived then validated/published by `functions/sharedViews.js`; staff consume the sanitized projection. Independent scenario arithmetic/persisted reconciliation is recorded in [current drill results](../operations/README.md). Legacy planner/rupee fields below remain compatibility context and must not be merged with canonical paise accounting by apparent similarity. This documentation update changes no formula.

## Hard Rule

If any displayed summary, projection, or allocation rule changes, update this file with the rest of the product docs.

## Current Runtime Sources

Current shared derivation lives in:

- `src/store/deriveWorkspaceMetrics.ts`
- `appMetadata/workspaceMetrics`
- `src/features/dashboard/domain/deriveMonthlyPerformance.ts`
- Historical Payment Planner fields only; `src/domain/unifiedPaymentPlanner.ts` is retired and is not a current runtime source
- V2 domain/repository contracts described in [Vendor Ledger](./VENDOR_LEDGER.md)

The Dashboard month helper reads subscribed source sales, expenses and daily cashouts; shared settings/liabilities/cash snapshots remain Firestore-derived. Vendor Workspace consumes V2 account states. These sources are documented as implemented; cleanup does not change their calculations.

## Date Model

- visible app dates are formatted as `DD/MM/YYYY`
- visible date-time uses `Asia/Kolkata`
- the Dashboard selector uses T (current calendar month), T-1 and T-2
- retained workspaceMetrics.dashboardRanges.yesterday/mtd fields are legacy read-model fields, not the visible month selector

## Dashboard Range Logic

```text
T   -> current IST calendar month
T-1 -> preceding calendar month
T-2 -> two calendar months earlier
comparison -> month immediately before the selected month
```

## Dashboard Totals

### Dashboard Sales

```text
monthly sales = sum(sale.totalSales where sale.date belongs to selected month)
```

### Dashboard Expense Total

```text
monthly recorded expenses = sum(cashout.amount where cashout.date belongs to selected month)
net after recorded expenses = monthly sales - monthly recorded expenses
cash collected = sum(entry.drawerTotal ?? entry.remainingBalance for selected-month daily cashouts)
```

Sales mix sums cash, UPI, credit and returns from selected-month daily cashouts. The preceding month supplies comparison totals. Trend aligns calendar days and preserves missing-record gaps; recording health counts distinct recorded dates without assuming working days.

### Open Loan Balance

```text
workspaceMetrics.liabilities.totalLoans =
sum(normalizedLoan.remainingAmount for all loans)
```

### Vendor Outstanding

The Dashboard uses the V2 vendor master for labels and V2 account states for current payable values. Account amounts are integer paise and are converted to rupees only for display. Vendor credits are shown separately and do not reduce the positive payable summary.

```text
vendorOutstandingByName =
sum(vendorAccountState.outstandingPaise for the matching stable vendor ID) / 100

workspaceMetrics.liabilities.totalVendorOutstanding =
sum(all vendorOutstandingByName values)
```

## Projection Logic

### Monthly Sales Projection

For T, the monthly helper uses the latest recorded sales day as the elapsed-day denominator. T-1/T-2 use actual selected-month sales instead of extrapolation. The margin result is an estimate from configured margin and operational expense, distinct from net after recorded expenses.

```text
monthStart = first day of current month
latestRecordedSalesDate = latest sale date in current month
mtdSales = sum(sale.totalSales from monthStart through latestRecordedSalesDate)
completedDays = inclusive days between monthStart and latestRecordedSalesDate
averageDailySales = mtdSales / completedDays
projectedMonthlySales = averageDailySales * daysInMonth(latestRecordedSalesDate)
projectedMarginValue = projectedMonthlySales * (marginPercentage / 100)
projectedProfit = max(projectedMarginValue - monthlyOperationalExpense, 0)
projectedLoss = max(monthlyOperationalExpense - projectedMarginValue, 0)
```

For completed months, estimated margin result = actual sales * marginPercentage / 100 - monthlyOperationalExpense. Break-even sales = max(monthlyOperationalExpense, 0) / (marginPercentage / 100); nonpositive or unavailable margin gives an unavailable state. Current-month daily requirement divides remaining break-even sales by the calendar days left, including today.

### Projection Settings

The current source of truth is:

```text
appMetadata/appSettings.monthlyOperationalExpense
appMetadata/appSettings.marginPercentage
appMetadata/appSettings.operationalExpenseBreakdown
```

Save behavior:

```text
monthlyOperationalExpense =
  rent
  + electricity
  + maintenance
  + salaries
  + royalty
  + caFee
  + miscellaneous
```

## Latest Closed-Day Summary

The retained shared summary uses the latest saved DailyCashoutEntry.date. Cashout still uses that reference; the old Dashboard final-summary panel has been removed.

```text
cashSales   = sum(entries.cashSales for latestClosedDay)
upiSales    = sum(entries.upiSales for latestClosedDay)
creditSales = sum(entries.creditSales for latestClosedDay)
returns     = sum(entries.returns for latestClosedDay)
totalSales  = cashSales + upiSales + creditSales - returns

cashExpenses =
sum(cashout.amount where cashout.date = latestClosedDay)

cashToHand = cashSales - cashExpenses

transfersToday =
sum(cashTransfer.amount where cashTransfer.date = latestClosedDay)
```

## Current-Day Register Summaries

### Today Expense

```text
workspaceMetrics.registerToday.cashout =
sum(cashout.amount where cashout.date = today)
```

### Today Payments

```text
workspaceMetrics.registerToday.paymentPaid =
sum(payment.amount where payment.date = today and payment.type = "Paid")

workspaceMetrics.registerToday.paymentReceived =
sum(payment.amount where payment.date = today and payment.type = "Received")

workspaceMetrics.registerToday.paymentNet =
todayPaymentReceived - todayPaymentPaid
```

## Pending Cash Logic

Pending cash is derived from event history using user IDs.

```text
for each daily cashout:
  if recordedByUserId exists and matches an active user
    userBalance[recordedByUserId] += drawerTotal
  else if recordedBy name exactly matches one active user name
    userBalance[matchedUserId] += drawerTotal
  else
    keep the amount in legacy review only

for each cash transfer:
  if fromUserId exists and matches an active user
    userBalance[fromUserId] -= amount
  else
    keep the source side in legacy review only

  if toType = "person":
    if toUserId exists and matches an active user
      userBalance[toUserId] += amount
    else
      keep the destination side in legacy review only

  if toType = "bank":
    bankTotal += amount
```

Legacy notes:

- old slot-only records do not get silently attached to a newly created login
- unmatched legacy slot records appear separately for review
- only exact name evidence is used for automatic legacy cashout matching

## Daily Cashout Corrections

Approved corrections keep the cashout date and recorder identity fixed and recalculate:

```text
drawerTotal =
  500 * denom500 + 200 * denom200 + 100 * denom100
  + 50 * denom50 + 20 * denom20 + 10 * denom10 + change

remainingBalance = drawerTotal
auditDifference = cashAudit - drawerTotal
expectedCash = cashSales - cashExpense
revision = previous revision + 1
```

Approval also rebuilds the linked `DailySales` document from every daily cashout on the same business date. A request is stale and cannot be approved when its source revision or before snapshot no longer matches the current cashout.

## Daily Cashout Audit Logic

For new daily cashouts, `cashAudit` is the recorded cash sales amount; denomination counts are reconciled against that cash-only amount. Existing cashouts retain their saved audit values.

```text
remainingBalance = drawerTotal
auditDifference = cashAudit - drawerTotal

auditDifference > 0 -> "cash-less"
auditDifference < 0 -> "cash-more"
auditDifference = 0 -> "matched"
```

## Payment Allocation Rules

### Loan Repayment

```text
find open loans for the selected person
sort oldest first
apply payment across remainingAmount until exhausted
reject if payment exceeds total open balance
```

Deletion behavior:

```text
if a loan-payment record is deleted:
  remove that payment
  recompute the selected party's loan ledger from surviving loans + surviving loan-payment history oldest-first

if a loan record is deleted:
  remove that loan
  recompute the selected party's remaining loans against surviving loan-payment history
  block the delete if the surviving loans cannot absorb that repayment history
```

### Vendor Payment

The following is the legacy V1 allocation behavior, retained for historical compatibility. Active V2 entries follow [Vendor Ledger](./VENDOR_LEDGER.md); do not apply this legacy algorithm to V2 balances.

```text
apply against vendor openingOutstandingRemaining first when present
then apply against open purchases oldest first
reject if payment exceeds total open vendor outstanding
```

Deletion note:

```text
historical vendor-payment deletes are safety-blocked
because old records do not store enough allocation provenance
to rebuild purchase-level paid/unpaid state without risking live totals
```

## Legacy Planner Compatibility

The Payment Planner screen and all planner write actions are removed. The retained compatibility schedule is still derived from:

```text
all expenses where paymentMode = "Cheque" and chequePayDate exists
+ all payments where type = "Paid" and entryType = "vendor-payment" and paymentMode = "Cheque"
+ preserved manual planned payments
```

Then:

```text
sort by deduction date
runningBalance starts at appSettings.currentBankBalance
for each planner item:
  runningBalance -= amount
  status = runningBalance >= 0 ? "available" : "deficit"
```

Compatibility notes:

- `workspaceMetrics.planner` remains temporarily so Vendor Workspace can show legacy expense/vendor cheques as read-only records.
- Manual planned payments remain preserved for history and user-account deletion safeguards, but are filtered out of Vendor Workspace.
- `currentBankBalance` remains stored for compatibility and has no active editor.
- Preserved planner records do not alter pending cash balances.

## Daily Cashout Delete Resync

```text
if a daily cashout entry is deleted:
  remove the entry
  recompute that date's auto-synced sales row from surviving daily cashouts for the same date
  if no daily cashouts remain for the date, delete the sales row
```

## Retained Dashboard Table Fields

The read model retains monthly grouped fields such as:

- expense by category
- purchase total vs vendor payment total
- payment mode breakdown for paid payments

These remain in workspaceMetrics.dashboardTables for compatibility. The current Dashboard does not render the removed detailed tables; this cleanup removes only their unreachable UI files.


## Shared counter date and overnight carryover

`counterSession.date` is the historical session opening date. An initialized, open counter is ready for a business date when `checkpoint.date` matches that date. An accepted later-day logout/handover count can therefore make the same session ready for that day without rewriting its opening date or session ID. POS, cash expenses/vendor payments, customer refunds and current-day Cashout use this same readiness rule; cashier membership, count reservations and sufficient cash remain independently enforced.

Current-day Cashout classifies the active drawer using the accepted checkpoint date. Historical-date Cashout retains its separate source selection and drawer-debit audit. The fix does not synthesize an opening record for a later date or use an old opening count as later-day carryover evidence. A stale count or closed counter still requires a valid opening/count through POS. The counter formula remains `checkpoint.cashActualPaise + cashNetPaise - checkpoint.cashNetPaise`; midnight changes no cash automatically.

Regression: F45-17 in the existing finance-followup drill covers the user-visible overnight path and the Open Counter option after closure. Deterministic handler regressions cover current counts, stale/closed rejection, original source preservation and retry safety. Real full-stack midnight/device acceptance remains separately timed/manual.

## Historical Cashout expense reconciliation (deployed 1 November 2026 IST)

Pending follow-up: [historical cash timing and duplicate-debit correction](../operations/HISTORICAL_CASHOUT_SAFETY_2026-11-01.md) requires an explicit past-date cash-removal choice and compensates only drawer posting deltas not already absorbed by the current verified checkpoint. This safety repair is locally implemented, not yet deployed. Expense reconciliation below remains separate and has zero drawer impact.

For a past date, `recordedOrdinaryCashExpenses` includes trusted expenses plus recognised legacy ordinary cash expense records. Cancelled/non-cash entries are excluded; vendor payments and POS refund events are separate. The owner confirms the full ordinary expense total, not an additional payout:

```text
historicalAdjustmentPaise = confirmedOrdinaryExpensePaise - recordedOrdinaryExpensePaise
historicalCashPaidOutPaise = recordedOrdinaryExpensePaise + historicalAdjustmentPaise
                           + vendorCashPaymentPaise + cashRefundPaise
expenseReconciliationDrawerImpactPaise = 0
```

Source changes make the dated declaration stale and require reconfirmation. The declaration never creates an itemised payment or mutates stock, sales, physical cash counts or live cash. Existing Cashouts require explicit owner correction with retained before/after evidence; ambiguous legacy combined payouts and changed vendor/refund evidence are not guessed. A separately saved physical Cashout continues to remove its actual counted cash. See [current workflow and safeguards](../operations/HISTORICAL_EXPENSE_RECONCILIATION_2026-11-01.md).
