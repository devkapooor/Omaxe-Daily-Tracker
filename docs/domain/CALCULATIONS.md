# Calculations And Projections

## Hard Rule

If any displayed summary, projection, or allocation rule changes, update this file with the rest of the product docs.

## Current Runtime Sources

Most current derived summary logic lives in:

- `src/features/dashboard/hooks/useDashboardMetrics.ts`
- `src/features/dashboard/components/DashboardTables.tsx`
- `src/features/planner/components/PaymentPlannerPage.tsx`

## Date Model

- visible app dates are formatted as `DD/MM/YYYY`
- visible date-time uses `Asia/Kolkata`
- dashboard range options are currently:
  - `yesterday`
  - `mtd`

## Dashboard Range Logic

```text
yesterday -> from = yesterday, to = yesterday
mtd       -> from = first day of current month, to = today
```

## Dashboard Totals

### Dashboard Sales

```text
dashboardSales =
sum(sale.totalSales where sale.date is within selected range)
```

### Dashboard Expense Total

```text
dashboardExpenseTotal =
sum(cashout.amount where cashout.date is within selected range)
```

### Open Loan Balance

```text
totalLoans =
sum(normalizedLoan.remainingAmount for all loans)
```

### Vendor Outstanding

```text
vendorOutstandingByName =
vendor.openingOutstandingRemaining
+ sum(purchase.unpaidAmount for matching vendor)

totalVendorOutstanding =
sum(all vendorOutstandingByName values)
```

## Projection Logic

### Monthly Sales Projection

```text
monthStart = first day of current month
latestRecordedSalesDate = latest sale date in current month
mtdSales = sum(sale.totalSales from monthStart through latestRecordedSalesDate)
completedDays = inclusive days between monthStart and latestRecordedSalesDate
averageDailySales = mtdSales / completedDays
projectedMonthlySales = averageDailySales * daysInMonth(latestRecordedSalesDate)
```

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

The owner dashboard uses the latest saved `DailyCashoutEntry.date` as the closed day reference.

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
todayCashout =
sum(cashout.amount where cashout.date = today)
```

### Today Payments

```text
todayPaymentPaid =
sum(payment.amount where payment.date = today and payment.type = "Paid")

todayPaymentReceived =
sum(payment.amount where payment.date = today and payment.type = "Received")
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

- counter cash is shown for reference only
- planner records do not alter pending cash balances
- planner does not currently ingest loan-repayment cheques

## Daily Cashout Delete Resync

```text
if a daily cashout entry is deleted:
  remove the entry
  recompute that date's auto-synced sales row from surviving daily cashouts for the same date
  if no daily cashouts remain for the date, delete the sales row
```

## Dashboard Tables

Current tables include monthly grouped views such as:

- expense by category
- purchase total vs vendor payment total
- payment mode breakdown for paid payments

These are read models only and do not write back to Firestore.
