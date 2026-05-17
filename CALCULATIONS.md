# Calculations And Projections

## Hard Rule

If any displayed summary, projection, or allocation rule changes, update this file with the rest of the product docs.

## Current Runtime Sources

Most current derived summary logic lives in:

- `src/app/useDashboardMetrics.ts`
- `src/components/DashboardTables.tsx`

There is no longer an active `src/domain/financeCalculations.ts` module in the current codebase.

## Date Model

- visible app dates are formatted as `DD/MM/YYYY`
- business-day helpers use `Asia/Kolkata`
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

Base balances come from the latest saved `DailyCashoutEntry.pendingCashBalances`.

Transfers then adjust that base:

```text
person-to-person:
  source -= amount
  target += amount

person-to-bank:
  source -= amount
  bankTotal += amount
```

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

### Vendor Payment

```text
apply against vendor openingOutstandingRemaining first when present
then apply against open purchases oldest first
reject if payment exceeds total open vendor outstanding
```

## Dashboard Tables

Current tables include monthly grouped views such as:

- expense by category
- purchase total vs vendor payment total
- payment mode breakdown for paid payments

These are read models only and do not write back to Firestore.
