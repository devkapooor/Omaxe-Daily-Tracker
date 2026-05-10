# Data Model

## Hard Rule

If any record shape, storage responsibility, or hierarchy changes, update this file together with:

- `ARCHITECTURE.md`
- `PLAN.md`
- `TASK_QUEUE.md`
- `CALCULATIONS.md` if derived values change

## Overview

The current app uses Firebase Auth + Firestore and keeps a single-store finance model.

Core type sources:

- [src/domain/financeTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeTypes.ts:1)
- [src/domain/appTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/appTypes.ts:1)

## Primary Finance Records

### DailySales

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| storeId | string | yes | Always single-store in current app |
| date | string | yes | Business date |
| totalSales | number | yes | Total recorded sales |
| cashSales | number | yes | Cash sales |
| upiSales | number | yes | UPI sales |
| cardSales | number | yes | Card sales |
| bankTransferSales | number | yes | Bank transfer sales |
| creditSales | number | yes | Credit/pending sales |
| returnsDiscounts | number | yes | Returns/discounts |
| notes | string | yes | Notes or sync details |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Purchase

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| storeId | string | yes | Current app uses a single-store constant |
| date | string | yes | Purchase date |
| supplierName | string | yes | Vendor name |
| billNumber | string | yes | Invoice/bill number |
| purchaseAmount | number | yes | Total purchase amount |
| paidAmount | number | yes | Amount already paid |
| unpaidAmount | number | yes | Auto-derived at save time |
| paymentMode | string | yes | Cash, UPI, Card, Bank Transfer, Credit |
| category | string | yes | Used as brand/category in current purchase screen |
| notes | string | yes | Optional notes |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Cashout

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| storeId | string | yes | Current app uses a single-store constant |
| date | string | yes | Expense register date |
| paidTo | string | yes | Person/party |
| amount | number | yes | Expense amount |
| category | string | yes | Expense purpose/category |
| paymentMode | string | yes | Cash, UPI, Card, Bank Transfer |
| approvedBy | string | yes | Owner/manager auto-fill or pending text |
| notes | string | yes | Optional notes |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Payment

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| storeId | string | yes | Single-store constant |
| date | string | yes | Payment date |
| type | `"Received" \| "Paid"` | yes | Payment direction |
| entryType | `"vendor-payment" \| "loan-payment"` | no | Distinguishes payment allocation flow |
| partyName | string | yes | Party or counterparty |
| amount | number | yes | Payment amount |
| paymentMode | string | yes | Cash, UPI, Card, Bank Transfer |
| notes | string | yes | Context/notes |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

## App-Specific Records

### UserAccount

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Firebase auth UID |
| name | string | yes | Display name |
| role | `"owner" \| "manager" \| "billing"` | yes | Access role |
| email | string | yes | Login email |
| createdAt | string | yes | ISO timestamp |
| disabled | boolean | no | Access disabled flag |

### VendorRecord

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| name | string | yes | Vendor name |
| ownerName | string | yes | Vendor owner/contact person |
| contact | string | yes | Contact details |
| address | string | yes | Address |
| companiesProvided | string | yes | Supplied companies/brands |
| notes | string | yes | Short notes |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### LoanEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| personName | string | yes | Lender/person |
| amount | number | yes | Loan amount |
| paidAmount | number | yes | Repaid so far |
| remainingAmount | number | yes | Open loan balance |
| status | `"Open" \| "Settled"` | yes | Derived repayment state |
| date | string | yes | Loan date |
| promisedPayoffDate | string | yes | Payoff commitment date |
| settledAt | string | no | Present when fully settled |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | no | Latest update time |

### DailyCashoutEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| date | string | yes | Cashout register date |
| recordedBy | string | yes | User name |
| upiSales | number | yes | UPI sales |
| cashSales | number | yes | Cash sales |
| returns | number | yes | Returns |
| creditSales | number | yes | Credit sales |
| cashAudit | number | yes | System audit value |
| drawerTotal | number | no | Final drawer total counted in modal |
| auditDifference | number | no | `cashAudit - drawerTotal` |
| auditStatus | `"matched" \| "cash-less" \| "cash-more"` | no | Saved audit classification |
| auditMessage | string | no | Human-readable audit warning/result |
| actualCashParticulars | string | yes | Drawer breakdown |
| pendingCashParticulars | string | yes | Pending-cash notes |
| pendingCashBalances | object | no | Running balances by person |
| remainingBalance | number | yes | Saved drawer total / carried balance |
| createdAt | string | yes | ISO timestamp |

### CashTransfer

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| date | string | yes | Transfer date |
| from | `"Dev" \| "Arsh" \| "Farhan"` | yes | Source holder |
| toType | `"person" \| "bank"` | yes | Destination type |
| toPerson | `"Dev" \| "Arsh" \| "Farhan"` | no | Destination person when applicable |
| amount | number | yes | Transfer amount |
| reason | string | yes | Transfer reason |
| createdBy | string | yes | Initiator name |
| createdAt | string | yes | ISO timestamp |

### SettingsAuditEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Unique ID |
| action | string | yes | Audit description |
| actor | string | yes | Who performed it |
| createdAt | string | yes | ISO timestamp |

### NameDirectory

```text
people: string[]
vendors: string[]
```

Used for autocomplete and canonical name reuse across forms.

## Storage Notes

- Firebase Authentication stores auth credentials
- Firestore stores all app records
- old browser-only data can still be read once and imported into Firestore
- `Purchase.unpaidAmount` is the source of truth for vendor outstanding
- `Vendor Payment` allocates against open purchases oldest-first
- `Loan Payment` allocates against open loans oldest-first

## Current Structural Ownership

- types live in `src/domain`
- Firestore read/write orchestration lives in `src/data`
- screen-level form shaping lives in `src/components`
