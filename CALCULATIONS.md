# Calculations And Projections

## Hard Rule

If any displayed summary, derived value, or projection logic changes, update this file together with:

- `DATA_MODEL.md`
- `ARCHITECTURE.md`
- `PLAN.md`
- `TASK_QUEUE.md` when roadmap or status changes

## Purpose

This document tracks the finance numbers currently used by the app. Some calculations are still performed in `App.tsx`, while pure reusable finance logic belongs in:

[src/domain/financeCalculations.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeCalculations.ts:1)

## Current Dashboard / Summary Logic

### Today Expense Total

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

### Dashboard Range Bounds

Supported dashboard filters:

- `today`
- `yesterday`
- `mtd`

```text
today      -> from = today, to = today
yesterday  -> from = yesterday, to = yesterday
mtd        -> from = first day of current month, to = today
```

### Dashboard Sales

```text
dashboardSales =
sum(sale.totalSales where sale.date is within selected range)
```

### Dashboard Expense Entries

```text
dashboardExpenseEntries =
count(cashout entries where cashout.date is within selected range)
```

### Dashboard Expense Total

```text
dashboardExpenseTotal =
sum(cashout.amount where cashout.date is within selected range)
```

## Projection Logic

### Monthly Sales Projection

Current logic:

```text
projectedMonthlySales =
monthToDateSales / completedDaysInMonth * totalDaysInMonth
```

Where:

```text
monthToDateSales =
sum(sale.totalSales from first day of current month through today)
```

### Break-Even Projection

The current UI uses:

```text
projectedMarginValue = projectedMonthlySales * 0.25
breakEvenDelta = projectedMarginValue - monthlyFixedExpense
projectedProfit = max(breakEvenDelta, 0)
projectedLoss = abs(min(breakEvenDelta, 0))
```

Current fixed monthly expense in the app:

```text
monthlyFixedExpense = 500000
```

## Daily Cashout Register Summary

The current “Daily Cashout Final Summary” panel derives:

### Daily Sales Summary

```text
cashSales   = sum(dailyCashoutEntry.cashSales for today)
upiSales    = sum(dailyCashoutEntry.upiSales for today)
creditSales = sum(dailyCashoutEntry.creditSales for today)
returns     = sum(dailyCashoutEntry.returns for today)
totalSales  = cashSales + upiSales + creditSales - returns
```

### Daily Cash Expense

```text
cashExpenses =
sum(cashout.amount where cashout.date = today)
```

### Cash To Hand

```text
cashToHand = cashSales - cashExpenses
```

### Transfers Today

```text
transfersToday =
sum(cashTransfer.amount where cashTransfer.date = today)
```

## Pending Cash Logic

The latest `DailyCashoutEntry.pendingCashBalances` is treated as the base running balance.

Then transfers adjust that balance:

```text
person-to-person transfer:
  source balance -= amount
  target balance += amount

person-to-bank transfer:
  source balance -= amount
  bankTotal += amount
```

## Purchase / Vendor Summary Tables

### Expense By Category

```text
monthExpenseByCategory =
sum(cashout.amount grouped by cashout.category for current month)
```

### Monthly Purchase Total

```text
monthlyPurchaseTotal =
sum(purchase.purchaseAmount for current month)
```

### Vendor Payment Total

```text
vendorPaymentTotal =
sum(payment.amount where payment.type = "Paid" for current month)
```

### Vendor Payment By Mode

```text
paymentByMode =
sum(payment.amount grouped by payment.paymentMode
where payment.type = "Paid" for current month)
```

## Notes About Current State

- The app currently mixes some derived UI logic inside `App.tsx` with reusable domain helpers.
- Future cleanup should continue moving stable pure finance logic into `src/domain/financeCalculations.ts`.
- Any such move must preserve these formulas or update this document if formulas change.
