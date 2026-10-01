# Data Model

## Hard Rule

If record shape, storage ownership, or derived-finance assumptions change, update this file with the matching docs.

## Core Type Sources

- `src/domain/financeTypes.ts`
- `src/domain/appTypes.ts`
- `src/domain/workspaceMetrics.ts`

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
| purchasingCapabilities | map | no | Optional V2 purchasing grants; absent and false values grant nothing to non-owners, while owners retain full authority |

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
| notes | string | no | Optional reason or context captured when the loan is created |
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
| recordedByUserId | string | no | Active ownership key for pending cash |
| recordedByHolder | `Dev \| Arsh \| Farhan` | no | Legacy slot field kept only for pre-user-ID cashouts |
| upiSales | number | yes | UPI sales |
| cashSales | number | yes | Cash sales |
| returns | number | yes | Returns |
| creditSales | number | yes | Credit sales |
| cashAudit | number | yes | System audit amount |
| cashExpense | number | no | Structured cash expense used to calculate expected cash on current records |
| drawerDenominations | object | no | Structured counts for 500/200/100/50/20/10 notes plus change |
| drawerTotal | number | no | Final drawer count |
| auditDifference | number | no | `cashAudit - drawerTotal` |
| auditStatus | `matched \| cash-less \| cash-more` | no | Audit classification |
| auditMessage | string | no | Human-readable audit result |
| actualCashParticulars | string | yes | Drawer breakdown |
| pendingCashParticulars | string | yes | Pending-cash note |
| remainingBalance | number | yes | Saved final drawer balance |
| createdAt | string | yes | ISO timestamp |
| updatedAt | string | no | Latest approved correction timestamp |
| updatedBy | string | no | Owner name that applied the latest correction |
| revision | number | no | Optimistic correction revision; legacy records default to revision 1 |

### CashoutCorrectionRequest

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| cashoutId | string | yes | Target daily cashout |
| cashoutDate | string | yes | Locked business date copied for review |
| recordedBy / recordedByUserId | string | yes/no | Locked recorder identity |
| sourceRevision | number | yes | Revision that the request was based on |
| before / proposed | object | yes | Structured financial and denomination snapshots |
| reason | string | yes | Staff or owner correction reason |
| requestedByUserId / requestedBy | string | yes | Requester identity |
| requestType | `staff-request \| owner-edit` | yes | Approval request or direct owner correction |
| status | `pending \| approved \| rejected \| withdrawn` | yes | Append-only correction lifecycle |
| createdAt | string | yes | Request timestamp |
| reviewedAt / reviewedBy / reviewReason | string | no | Review outcome metadata |

### CashTransfer

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Document ID |
| date | string | yes | Transfer date |
| fromUserId | string | no | Active source ownership key |
| from | `Dev \| Arsh \| Farhan` | no | Legacy source slot for pre-user-ID transfers |
| toType | `person \| bank` | yes | Destination type |
| toUserId | string | no | Active destination ownership key for person transfers |
| toPerson | `Dev \| Arsh \| Farhan` | no | Legacy destination slot for pre-user-ID transfers |
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

## Dormant V2 Vendor Ledger Contracts

`src/domain/vendorLedgerV2.ts` defines the isolated contracts and pure validation rules for the future vendor-ledger workflow. The V2 purchase repository and UI are dormant behind a disabled feature flag and are not connected to live subscriptions, metrics, navigation, or V1 write paths.

- All V2 money fields use safe integer paise and carry an `amountPaise`, `invoiceTotalPaise`, `valuePaise`, or `signedAmountPaise` suffix.
- `VendorV2` starts at zero outstanding. An owner-entered opening balance creates an immutable ledger event; later corrections use signed audited adjustment events.
- `PurchaseV2` stores invoice facts only. Its normalized invoice number links one immutable `InvoiceReservationV2`, enforcing uniqueness per vendor. `VendorSettlementV2` and `InvoiceAllocationV2` remain separate records.
- `VendorReturnV2` supports `pending`, `vendor-credit`, `replacement`, and `rejected`; cash refund is unsupported.
- `ChequeV2` supports one register for `vendor-payment` and `expense` purposes and records whether an instrument is V2 or legacy tracking-only.
- `VendorLedgerEntryV2` distinguishes financial postings from informational pending-cheque entries. Informational entries do not affect outstanding.
- `InvoiceAllocationV2` supports reserved, posted, released, and reversed states without mutating purchase totals.
- Open invoice value subtracts posted allocations only. Reserved allocations remain separately visible and reduce the amount available for another allocation without changing the posted balance.
- V2 vendor outstanding is the sum of financial ledger entries. Pending cheques, legacy cheques, and expense cheques have no vendor-ledger effect.
- The active cheque-book boundary is 1120-1199; this remains a domain rule until persistence is implemented.
- V2 vendor identity uses the vendor document ID as its financial key. Canonical names and aliases are searchable labels only.
- Active canonical names and aliases must be unique across V2 vendors. Ambiguous names resolve to no vendor and require owner review.
- Unmatched historical names remain explicit legacy references and never acquire a V2 vendor ID automatically.

The current V1 `Purchase`, `Payment`, and `VendorRecord` records remain unchanged and authoritative in the live application until the separately approved all-vendor activation date.

### V2 Persistence Boundary

- `appMetadata/vendorLedgerV2Config.enabled` is the protected master feature flag and defaults effectively to false when absent.
- Dormant collection names are centralized in `src/store/vendorLedgerV2Repository.ts`.
- The guarded transaction helper reads the feature flag inside every future V2 transaction before running its operation.
- Purchase creation atomically writes `purchasesV2`, `invoiceReservationsV2`, one deterministic `vendorLedgerEntriesV2` event, and the matching vendor-account and invoice-state projections; incomplete or conflicting postings are rejected.
- `vendorAccountStatesV2` and `invoiceStatesV2` are guarded derived projections updated in the same transaction as their immutable ledger or allocation evidence. They prevent concurrent overpayment without changing V1 balances.
- `vendorSettlementsV2` stores cash, UPI, card, and bank-transfer payments separately from purchases. Invoice allocation is optional; cheque payments remain outside this collection.
- `vendorSettlementStatesV2` stores the effective revision without rewriting the immutable source settlement. Approved custom-payment amount corrections append a compensating ledger event; invoice-linked correction persistence remains disabled until its allocation-reversal rules are complete.
- Firestore rules independently require the enabled flag and explicit capabilities for non-owner writes.
- `vendorLedgerEntriesV2` is append-only; correction history cannot overwrite or delete ledger entries.
- Active manager and billing users receive baseline V2 authority to manage vendors, create purchases and settlements, and view the vendor ledger. Sensitive actions such as corrections, returns, cheques, migration, and activation remain owner-only or require an explicit capability.
- Newly created staff accounts receive every purchasing capability explicitly set to false.

## Metadata Documents

### appMetadata/appSettings

Current app settings include:

- `monthlyOperationalExpense`
- `marginPercentage`
- `currentBankBalance`
- `operationalExpenseBreakdown`

`operationalExpenseBreakdown` currently contains:

- `rent`
- `electricity`
- `maintenance`
- `salaries`
- `royalty`
- `caFee`
- `miscellaneous`

`monthlyOperationalExpense` remains stored as the derived total used by the dashboard and projection math.

### appMetadata/nameDirectory

Current directory metadata includes:

- `people`
- `vendors`

### appMetadata/workspaceMetrics

Current shared derived snapshot includes:

- `generatedForDate`
- `updatedAt`
- `dashboardRanges.yesterday`
- `dashboardRanges.mtd`
- `registerToday`
- `projections`
- `latestClosedDaySummary`
- `liabilities`
- `vendorOutstandingByName`
- `pendingCash`
- `dashboardTables`
- `planner`
- `monthlyReports`

This document is the shared read model for dashboard, planner, pending-cash, and monthly-report displays. It is derived from the primary finance collections and app metadata, then written back to Firestore so all clients read the same summarized values.

## Storage Notes

- Firebase Authentication stores credentials.
- Firestore stores app records and app metadata.
- `appMetadata/workspaceMetrics` stores the shared derived read model used by the main finance dashboards and planner views.
- Legacy browser-only data can still be imported once.
- `Purchase.unpaidAmount` and `VendorRecord.openingOutstandingRemaining` together drive vendor outstanding.
- Planner availability uses `currentBankBalance`, not counter cash.
- `Cash Movement` records affect pending cash and bank totals; planner records do not.
- Active money ownership is user-ID based. Legacy slot fields are read-only compatibility fields and are not used for new records.
- Loan notes are additive and optional; historical loan documents can omit them.
- `Sales` log rows remain read-only because they are derived from daily cashout history.
- `workspaceMetrics` is derived data, not the canonical input record set. The canonical write records remain collections such as `sales`, `cashouts`, `payments`, `purchases`, `dailyCashouts`, `cashTransfers`, `loans`, and metadata documents such as `appSettings`.
