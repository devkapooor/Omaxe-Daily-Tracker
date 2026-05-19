# Data Model

## Hard Rule

If record shape, storage ownership, or derived-finance assumptions change, update this file with the matching docs.

## Core Type Sources

- `src/domain/financeTypes.ts`
- `src/domain/appTypes.ts`

## Primary Finance Records

### DailySales

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| storeId | string | yes | Current app uses a single-store constant |
| date | string | yes | `YYYY-MM-DD` business date |
| totalSales | number | yes | Total sales for the day |
| cashSales | number | yes | Cash sales |
| upiSales | number | yes | UPI sales |
| cardSales | number | yes | Card sales |
| bankTransferSales | number | yes | Bank transfer sales |
| creditSales | number | yes | Credit sales |
| returnsDiscounts | number | yes | Returns or discounts |
| notes | string | yes | Free text |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Purchase

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| storeId | string | yes | Single-store constant |
| date | string | yes | Purchase date |
| supplierName | string | yes | Canonical vendor name |
| billNumber | string | yes | Invoice or bill number |
| purchaseAmount | number | yes | Total purchase amount |
| paidAmount | number | yes | Amount paid at creation or after updates |
| unpaidAmount | number | yes | Open outstanding for this purchase |
| paymentMode | `Cash \| UPI \| Card \| Bank Transfer \| Cheque \| Credit` | yes | Purchase payment mode |
| category | string | yes | Current UI uses this as a purchase category/brand field |
| notes | string | yes | Free text |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Cashout

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| storeId | string | yes | Single-store constant |
| date | string | yes | Expense date |
| paidTo | string | yes | Expense recipient or payee label |
| amount | number | yes | Expense amount |
| category | string | yes | Expense category |
| paymentMode | `Cash \| UPI \| Card \| Bank Transfer \| Cheque` | yes | Expense payment mode |
| chequeNumber | string | no | Required in the UI when payment mode is cheque |
| chequePayDate | string | no | Required in the UI when payment mode is cheque |
| approvedBy | string | yes | Owner or manager name |
| notes | string | yes | Free text |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### Payment

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| storeId | string | yes | Single-store constant |
| date | string | yes | Payment date |
| type | `Received \| Paid` | yes | Direction |
| entryType | `vendor-payment \| loan-payment` | no | Used for allocation logic and planner filtering |
| partyName | string | yes | Canonical party or vendor name |
| amount | number | yes | Payment amount |
| paymentMode | `Cash \| UPI \| Card \| Bank Transfer \| Cheque` | yes | Payment mode |
| chequeNumber | string | no | Required in the UI when payment mode is cheque |
| chequePayDate | string | no | Required in the UI when payment mode is cheque |
| notes | string | yes | Free text |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

## App-Specific Records

### UserAccount

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Firebase auth UID |
| name | string | yes | Display name |
| role | `owner \| manager \| billing` | yes | Role-based access |
| email | string | yes | Login email |
| mobileNumber | string | no | Stored for admin use |
| approvalStatus | `pending \| approved \| rejected` | no | Current app generally writes approved for created users |
| createdAt | string | yes | ISO timestamp |
| disabled | boolean | no | Optional inactive marker |

### VendorRecord

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| name | string | yes | Canonical vendor name |
| ownerName | string | yes | Vendor owner or contact person |
| contact | string | yes | Contact detail |
| address | string | yes | Address |
| companiesProvided | string | yes | Supplied brands/companies |
| notes | string | yes | Free text |
| openingOutstanding | number | yes | Owner-managed opening balance |
| openingOutstandingRemaining | number | yes | Remaining opening balance after payments |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### LoanEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| personName | string | yes | Lender or counterparty |
| amount | number | yes | Original amount |
| paidAmount | number | yes | Repaid so far |
| remainingAmount | number | yes | Open balance |
| status | `Open \| Settled` | yes | Repayment state |
| date | string | yes | Loan start date |
| promisedPayoffDate | string | yes | Planned payoff date |
| settledAt | string | no | Present when fully settled |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | no | Latest mutation time |

### DailyCashoutEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| date | string | yes | Close date |
| recordedBy | string | yes | User name |
| recordedByHolder | `Dev \| Arsh \| Farhan` | no | Resolved holder at save time |
| upiSales | number | yes | UPI sales |
| cashSales | number | yes | Cash sales |
| returns | number | yes | Returns |
| creditSales | number | yes | Credit sales |
| cashAudit | number | yes | System audit amount |
| drawerTotal | number | no | Final drawer count |
| auditDifference | number | no | `cashAudit - drawerTotal` |
| auditStatus | `matched \| cash-less \| cash-more` | no | Audit classification |
| auditMessage | string | no | Human-readable audit result |
| actualCashParticulars | string | yes | Drawer breakdown |
| pendingCashParticulars | string | yes | Pending-cash note |
| pendingCashBalances | object | no | `{ dev, arsh, farhan }` balances |
| remainingBalance | number | yes | Saved final drawer balance |
| createdAt | string | yes | ISO timestamp |

### CashTransfer

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| date | string | yes | Transfer date |
| from | `Dev \| Arsh \| Farhan` | yes | Source holder |
| toType | `person \| bank` | yes | Destination type |
| toPerson | `Dev \| Arsh \| Farhan` | no | Required for person transfers |
| amount | number | yes | Transfer amount |
| reason | string | yes | Transfer reason |
| createdBy | string | yes | Initiator name |
| recordType | `bank-transfer \| cash-movement` | no | Optional compatibility marker for current movement history |
| createdAt | string | yes | ISO timestamp |

### PlannedPayment

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| title | string | yes | Payee or plan label |
| date | string | yes | Planned deduction date |
| amount | number | yes | Planned amount |
| notes | string | yes | Free text |
| createdBy | string | yes | Actor name |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | yes | ISO timestamp |

### SettingsAuditEntry

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| action | string | yes | Audit description |
| actor | string | yes | Who performed the action |
| createdAt | string | yes | ISO timestamp |

### NameDirectory

```text
people: string[]
vendors: string[]
```

Used to back searchable selectors and keep naming consistent across forms.

## Metadata Documents

### appMetadata/appSettings

Current app settings include:

- `monthlyOperationalExpense`
- `marginPercentage`
- `currentBankBalance`

### appMetadata/nameDirectory

Current directory metadata includes:

- `people`
- `vendors`

## Storage Notes

- Firebase Authentication stores credentials.
- Firestore stores app records and app metadata.
- Legacy browser-only data can still be imported once.
- `Purchase.unpaidAmount` and `VendorRecord.openingOutstandingRemaining` together drive vendor outstanding.
- Planner availability uses `currentBankBalance`, not counter cash.
- `Cash Movement` records affect pending cash and bank totals; planner records do not.
