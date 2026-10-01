# Calculations And Projections

## Hard Rule

If any displayed summary, projection, or allocation rule changes, update this file with the rest of the product docs.

## Current Runtime Sources

Current shared derivation lives in:

- `src/store/deriveWorkspaceMetrics.ts`
- `appMetadata/workspaceMetrics`
- `src/features/dashboard/domain/deriveMonthlyPerformance.ts`
- `src/domain/unifiedPaymentPlanner.ts`
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

This is the retained legacy metric currently passed to the Dashboard. V2 Vendor Workspace balances are separate account-state projections; switching the Dashboard source is outside cleanup.

```text
vendorOutstandingByName =
vendor.openingOutstandingRemaining
+ sum(purchase.unpaidAmount for matching vendor)

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

## Payment Planner Logic

Planner schedule items are built from:

```text
all expenses where paymentMode = "Cheque" and chequePayDate exists
+ all payments where type = "Paid" and entryType = "vendor-payment" and paymentMode = "Cheque"
+ all manual planned payments
```

Then:

```text
sort by deduction date
runningBalance starts at appSettings.currentBankBalance
for each planner item:
  runningBalance -= amount
  status = runningBalance >= 0 ? "available" : "deficit"
```

Planner notes:

- AppWorkspace passes this legacy/manual schedule through mergeV2ChequesIntoPlanner. It adds issued/presented V2 cheques, excludes legacy rows sharing their normalized cheque numbers, and rebuilds running balances from the configured bank balance.
- counter cash is shown for reference only
- planner records do not alter pending cash balances
- planner does not currently ingest loan-repayment cheques
- the legacy/manual schedule is persisted into workspaceMetrics.planner; the unified display is composed by the shared V2 planner helper

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
