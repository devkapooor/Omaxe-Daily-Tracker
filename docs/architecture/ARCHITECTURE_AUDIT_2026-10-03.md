# 1. Executive Summary

Omaxe Daily Tracker is a client-rendered React 19/Vite application using Firebase Authentication and Firestore directly from the browser. There is no API server, Cloud Function layer, ORM, or trusted backend. Navigation is state-based rather than URL-based.

The architecture has two distinct generations:

- The legacy finance system uses rupee-number records, mutable documents, name-based relationships, direct Firestore writes, and client-derived balances.
- Vendor Ledger V2 uses stable IDs, integer paise, revisions, Firestore transactions, append-only ledger entries, allocation records, and stronger security rules.

The V2 vendor design is a good foundation. The legacy cash, loan, expense, sales, and reporting areas are not yet safe enough for unrestricted long-term growth. The most urgent finding is a client-visible local-auth credential in the current compiled artifact.

This was a strictly read-only audit. No files, configuration, financial data, or deployment state were changed. Git was clean at `c3724a5`, synchronized with `origin/main`, when the audit was completed.

# 2. Architecture Diagram

```text
Browser
|-- Firebase Authentication
|-- React application
|   `-- App
|       |-- useAppStore
|       |   |-- Authentication/profile verification
|       |   |-- Realtime legacy collection subscriptions
|       |   |-- Legacy action factories
|       |   `-- Owner-only workspaceMetrics generation
|       |-- useDashboardMetrics
|       |   |-- Raw FinanceData calculations
|       |   `-- Shared workspaceMetrics snapshot
|       `-- AppWorkspace
|           |-- State-based page dispatch
|           |-- All primary feature pages
|           `-- Approval queue composition
|-- Direct feature access
|   |-- LogsPage -> settingsAudit
|   `-- useVendorLedgerV2 -> all V2 collections
`-- Firestore
    |-- Legacy mutable collections
    |-- appMetadata/workspaceMetrics
    `-- V2 transactional vendor ledger collections
```

Actual legacy write path:

```text
Form -> AppWorkspace callback -> appStore action -> Firestore client SDK
```

V2 write path:

```text
Vendor Workspace -> repository transaction -> V2 domain builders -> Firestore
```

# 3. Repository Structure

```text
Omaxe Daily Tracker/
|-- src/
|   |-- main.tsx
|   |-- app/
|   |   |-- App.tsx
|   |   |-- AppWorkspace.tsx
|   |   `-- uiHelpers.ts
|   |-- config/
|   |-- domain/
|   |   |-- financeTypes.ts
|   |   |-- appTypes.ts
|   |   |-- workspaceMetrics.ts
|   |   |-- cashoutCorrections.ts
|   |   `-- vendorLedgerV2.ts
|   |-- features/
|   |   |-- auth/
|   |   |-- dashboard/
|   |   |-- action-center/
|   |   |-- vendor-workspace/
|   |   |-- directory/
|   |   |-- register/
|   |   |-- cashout/
|   |   |-- cash-movement/
|   |   |-- planner/
|   |   |-- logs/
|   |   |-- navigation/
|   |   `-- settings/
|   |-- shared/
|   |   |-- lib/
|   |   `-- ui/
|   |-- store/
|   |   |-- appStore.ts
|   |   |-- storeSubscriptions.ts
|   |   |-- deriveWorkspaceMetrics.ts
|   |   |-- vendorLedgerV2Repository.ts
|   |   `-- actions/
|   `-- styles/global.css
|-- tests/firestore.rules.test.ts
|-- firestore.rules
|-- firestore.indexes.json
|-- firebase.json
|-- docs/
|-- public/
`-- server/omaxe.db
```

Feature boundaries are **partially separated**:

| Feature | Main files | Data ownership and dependencies |
|---|---|---|
| Authentication | `appStore`, `createAuthActions`, auth components | Firebase Auth and `users`; controls all subscription startup |
| Dashboard | dashboard domain/components/hooks | Reads raw legacy records plus `workspaceMetrics`; no writes |
| Action Centre | action-center feature | Combines cashout corrections, V2 settlement corrections, and returns |
| Vendor Workspace | V2 domain, hook, repository, workspace page | Owns V2 vendor, purchase, return, settlement, cheque, allocation and ledger collections |
| Party Directory | `DirectoryPage`, `nameDirectory` actions | Owns directory names, not historical transaction identities |
| Register | expense and loan forms | Writes legacy expenses, loans, and loan payments |
| Cashout | cashout forms and corrections | Writes `dailyCashouts`, linked `sales`, and correction requests |
| Cash Movement | `CashMovementForm`, cash metric derivation | Writes `cashTransfers`; reads holder balances from shared metrics |
| Payment Planner | planner page and unified cheque helper | Reads settings, plans, legacy cheques and V2 cheques |
| Logs | Logs page and tables | Reads most finance collections; can edit/delete selected owner records |
| Settings | Settings page and action factories | Manages users, operational assumptions, passwords and local theme |
| Reports | No active page | Residual `monthlyReports` subscriptions, actions and snapshots remain |
| Inventory | Absent | No SKU, product, stock movement or sale-line model exists |

# 4. What Is Done Well

- V2 uses stable IDs, integer paise, revisions, deterministic event IDs, transactions, allocation records and append-only ledger entries in `src/domain/vendorLedgerV2.ts`.
- Purchase, settlement, return and cheque V2 operations are transaction-backed in `src/store/vendorLedgerV2Repository.ts`.
- Cashout correction approval atomically updates the cashout, linked sales and request decision.
- Roles are enforced in Firestore rules, not only by hidden UI controls.
- IST date helpers are centralized and avoid most UTC/date-boundary errors.
- Shared UI primitives, semantic theme tokens and responsive layouts are actively reused.
- TypeScript strict mode is enabled.
- Static import analysis found all 95 non-test source files reachable and no static import cycles.
- No exact duplicate tracked files were found.

# 5. Critical Architectural Problems

## Client Credential In Build

Severity: Critical

Evidence:

- Potential secret found in `.env`.
- `src/shared/lib/firebase.ts` reads local-auth credentials through `VITE_*` variables.
- A value-presence check confirmed the credential appears in the current `dist` JavaScript. The deployment log records that build being released to the live Hosting channel.

Why it matters:

`VITE_*` values are shipped to every browser. The localhost hostname check stops automatic use on production but does not conceal the credential.

Future consequence:

Unauthorized login is possible if that credential remains valid.

Do NOT fix yet.

## Non-Atomic Cashout Creation

Severity: High

Evidence:

- `src/store/actions/createFinanceActions.ts` writes `dailyCashouts`, then separately rewrites `sales`.
- Deletion similarly deletes the cashout before separately synchronizing sales.

Why it matters:

Network failure or concurrent staff submissions can leave cashouts and daily sales inconsistent.

Future consequence:

Dashboards and historical reports can disagree with drawer records.

Do NOT fix yet.

## Cash Balance Rule Exists Only In UI

Severity: High

Evidence:

- `CashMovementForm.tsx` blocks transfers exceeding the displayed balance.
- `firestore.rules` validates positive amount and ownership but cannot verify available aggregate balance.

Why it matters:

An authenticated caller can bypass the form and create an excessive transfer.

Future consequence:

Negative or impossible holder balances can enter the source data.

Do NOT fix yet.

## Financial History Can Be Mutated Or Deleted

Severity: High

Evidence:

- Owner hard deletion is allowed for legacy sales, purchases, vendors, expenses, payments, loans, cashouts and transfers.
- Legacy cashout correction requests permit unrestricted owner updates in `firestore.rules`.
- Owner updates to `vendorsV2` require a revision increment but do not restrict financial fields.

Why it matters:

UI workflows are audited, but direct SDK calls can bypass those workflows.

Future consequence:

Historical records or audit evidence can be rewritten without compensating entries.

Do NOT fix yet.

## Owner-Generated Shared Metrics

Severity: High

Evidence:

- Only an active owner session derives and writes `workspaceMetrics` in `src/store/appStore.ts`.
- Other users consume that stored document.

Why it matters:

Staff writes do not immediately refresh shared metrics unless an owner is online. The entire snapshot is rewritten from client state.

Future consequence:

Cross-device figures can become stale, race between owners, or exceed Firestore's document-size limit as historical snapshots grow.

Do NOT fix yet.

## Inconsistent Historical Reporting Semantics

Severity: High

Evidence:

- Monthly `totalSales` excludes returns, while the latest-day summary subtracts returns.
- Completed-month margin estimates use current operational expense and margin settings.
- Historical liability snapshots store current loan/vendor balances.

Why it matters:

The same term can produce different figures, and old reports can change after current settings or liabilities change.

Future consequence:

Monthly comparisons and future P&L reports will not be reproducible.

Do NOT fix yet.

# 6. Data & Historical Integrity Risks

| Current implementation | Risk and example | Recommended future design |
|---|---|---|
| Legacy vendor and loan allocation uses normalized names | A rename or duplicate spelling can change which records are grouped | Stable party IDs plus explicit allocation records |
| Loan repayments do not store per-loan allocations | Deleting a loan recomputes FIFO and can reassign historical repayments | Immutable repayment allocations and reversal entries |
| Legacy vendor payments mutate purchase balances without storing allocations | A payment cannot safely be deleted or reconstructed | Payment-to-invoice/opening allocation records |
| V2 purchases store `vendorId` but no vendor-name snapshot | A future vendor rename changes historical labels | Immutable display snapshot or audited identity history |
| Client-provided ISO timestamps are accepted as strings | Device clock manipulation can alter ordering/audit times | Trusted server timestamps alongside business dates |
| Firestore reads use unchecked TypeScript assertions | Malformed production documents can pass compile-time checks | Versioned runtime validation at data boundaries |
| No general schema versioning or migration framework | Future shape changes require ad hoc compatibility logic | Explicit schema versions and idempotent migrations |
| Tracked backups and `server/omaxe.db` contain historical business data | Exposure depends on repository visibility | Preserve securely; repository visibility is not determined from current repository |
| Product/tax/stock snapshots | Not determined from current repository because these domains do not exist | Define snapshot requirements before inventory implementation |

# 7. Business Logic Problems

- `CashMovementForm` owns the available-balance rule; it should be a database-enforced domain invariant.
- `DailyCashoutForm` performs drawer, expected-cash and audit calculations. Shared domain helpers are used, but the displayed "Cash Difference" field currently shows expected cash rather than drawer difference.
- Monthly sales, returns and profit semantics differ between dashboard and workspace metric derivations.
- Settings calculates operational totals in the UI and recalculates them again in the action layer.
- Vendor Workspace contains substantial return, correction and cheque workflow logic inside one component.
- Business dates are IST-based, but there is no configurable closing time, closed-period lock or formal business-day status.
- V2 business rules are substantially better placed in the domain/repository layer than legacy rules.

# 8. Database/Data-Access Problems

- **Components accessing Firestore:** `LogsPage` directly queries `settingsAudit`.
- **Hooks accessing Firestore:** `useVendorLedgerV2` directly subscribes to every V2 collection.
- **Services:** `storeActions` and action factories mix validation, use cases and Firestore persistence.
- **Repository abstraction:** Only Vendor Ledger V2 has a clear repository.
- **Duplicate access:** `settingsAudit` is subscribed in `appStore` and queried again by `LogsPage`.
- **Duplicate logic:** Sales reconstruction exists in both batched and non-batched forms.
- Legacy and V2 subscriptions load entire collections. The Logs 7/15/30-day filter reduces displayed rows, not initial Firestore reads.
- `workspaceMetrics` duplicates derived financial data in one growing document.
- There are no API routes, server actions, Cloud Functions, Supabase calls, SQL runtime calls or fetch/axios data APIs.
- `server/omaxe.db` is an unreferenced protected historical SQLite file, not the active database.
- The V2 repository is the closest implementation to `UI -> use case -> repository -> database`; the rest is scattered between store, components and direct SDK calls.

# 9. Feature Coupling Problems

| Source | Target | Dependency | Risk |
|---|---|---|---|
| `AppWorkspace` | Every feature | Imports and wires all pages and actions | Central prop-heavy change hotspot |
| Register | Dashboard | Imports `SummaryCard` | Business component has incorrect ownership |
| Vendor Workspace | Directory/Register | Imports vendor directory and register forms | Internal feature boundaries are porous |
| Action Centre | Cashout | Imports cashout details modal | Approval presentation depends on source feature UI |
| Logs | Cashout | Imports correction and details components | Log changes can affect correction UI |
| Dashboard | Store/read model | Mixes raw data and `workspaceMetrics` | One page has two consistency models |
| Navigation | App state | Uses legacy key `vendor-preview` for live workspace | Naming and persistence compatibility are coupled |

No static circular import dependencies were found.

# 10. UI / Design-System Problems

- Generic shared components are properly located under `src/shared/ui`: buttons, cards, tabs, inputs, dialogs, badges, tables and selectors.
- `SummaryCard` is business-neutral in practice but remains owned by Dashboard while Register imports it.
- A scan found direct palette classes in 33 TSX files. Semantic tokens exist, but theme-specific gradients, shadows and status colors remain distributed.
- Changing core theme tokens is easy; fully changing visual language still has a broad feature-file blast radius.
- `select-field.tsx` is a 349-line custom control and needs focused accessibility scrutiny.
- State-based routing means no deep links, refreshable URLs, browser history or route-level loading boundaries.
- `menuConfig` defines `gradient`, `hoverClass` and `activeClass`, but `AppTopBar` does not consume them.
- The project uses shadcn-style composition, not a completely centralized shadcn design system.

# 11. Security / Authorization Problems

- Potential secret found in `.env`.
- Server-side role enforcement exists and disabled/unauthenticated users are denied.
- All active staff can read most users, loans, payments, expenses, sales and vendor records even when those pages are hidden.
- Stored capability flags cannot revoke the six default staff purchasing capabilities.
- The UI drops `purchasingCapabilities` from `currentUser`, so fine-grained permissions are not represented in feature rendering.
- Deleting a Firestore user profile does not delete the Firebase Authentication account.
- User deletion checks legacy references but not V2 `createdByUserId` references, allowing orphaned V2 actor IDs.
- Legacy owner updates/deletes and V2 vendor updates are broader than the audited UI workflows.
- Audit and transaction timestamps are client-controlled strings.
- Firebase client configuration itself is expected to be public; the local-auth credential is the actual concern.

# 12. Testing Problems

Existing tests include domain unit tests for cashout corrections, V2 identity/ledger/cutover, planner merging, approval normalization, dashboard metrics, log search, theme and date helpers. `tests/firestore.rules.test.ts` provides Firestore emulator integration coverage.

Missing or weak coverage:

- No component or end-to-end tests.
- No tests for legacy finance action atomicity or concurrent cashouts.
- No test proving Cash Movement cannot exceed a holder balance at the database boundary.
- No test preventing owner mutation of legacy correction history or V2 vendor financial fields.
- No tests for workspace metric staleness, multiple-owner races or document growth.
- No tests for loan/vendor name-based allocation recomputation.
- No auth test for partial account creation or profile/Auth deletion mismatch.
- No historical report reproducibility test after settings changes.
- No scale test covering years of records.

Tests were inspected but not executed because this was a strict read-only audit.

# 13. Large / Problematic Files

| File | Lines | Responsibilities | Concern |
|---|---:|---|---|
| `vendorLedgerV2.ts` | 939 | Types, validation, calculations, builders, lifecycle rules | Cohesive domain, but too many subdomains in one file |
| `firestore.rules` | 875 | Authorization and all legacy/V2 invariants | High-risk single security surface |
| `vendorLedgerV2Repository.ts` | 710 | Every V2 persistence workflow | Repository is becoming a service monolith |
| `firestore.rules.test.ts` | 638 | All rule integration tests | Size is justified, but scenario navigation is difficult |
| `createFinanceActions.ts` | 575 | Sales, expenses, purchases, payments, loans, cashouts, transfers, imports, deletes | Multiple unrelated finance domains |
| `AppWorkspace.tsx` | 499 | Routing, composition, approvals and action wiring | God composition component |
| `appStore.ts` | 464 | Auth, subscriptions, state, bootstrap and metrics sync | Mixed server state and session orchestration |
| `deriveWorkspaceMetrics.ts` | 433 | Dashboard, planner, liabilities, reports and cash snapshots | Multiple reporting domains coupled |
| `SettingsPage.tsx` | 371 | Users, password, theme and operations | Several unrelated settings domains |
| `select-field.tsx` | 349 | Select, search, floating positioning and keyboard behavior | Complex shared control |
| `ActionCenterPage.tsx` | 334 | Multiple approval types and dialogs | Will grow with each approval workflow |
| `DailyCashoutForm.tsx` | 315 | Form, modal workflow and financial calculations | UI and finance rules mixed |

# 14. Duplicate Logic

- `normalizeName` exists in both `app/uiHelpers.ts` and `store/storeShared.ts`.
- `daysInMonth` exists in three reporting/date modules.
- Cashout-to-sales aggregation is duplicated in `writeSalesSyncToBatch` and `syncSalesForDate`.
- Monthly filtering and summation exist independently in dashboard and workspace metrics.
- Rupee/paise display formatting is repeated across V2 components instead of using one formatter.
- Error-message extraction is repeated across nearly every form.
- Live Vendor Workspace and local preview repeat similar orchestration.
- White-card gradients, shadows and modal styling are repeated despite global semantic tokens.
- Removed Monthly Reports functionality still leaves subscription, action, state and snapshot calculations.

# 15. Future Feature Impact

| Feature | Reusable foundation | Main difficulty |
|---|---|---|
| Inventory management | V2 stable IDs, transactions, ledger pattern | No products, SKUs, purchase lines, sale lines or stock movement ledger |
| Product profitability | Aggregate sales and V2 purchases | No COGS, units, product snapshots or sale-item records |
| Vendor aging | V2 invoice dates and invoice states | Needs scalable queries and immutable aging rules; legacy vendors are name-based |
| Monthly P&L | Expense and sales records, monthly metadata | Sales/returns ambiguity, no COGS, mutable assumptions and no close snapshots |
| Employee attendance | Existing user IDs and roles | Needs separate permissions, schedules and immutable attendance events |
| AI forecasting | Historical daily sales dates | Current listeners load everything; data definitions and historical settings are inconsistent |
| Second store | `storeId` exists on some legacy types | `single-store` is hardcoded; users, rules, subscriptions, V2 and metrics are not store-scoped |

# 16. Change Blast Radius

| Request | Expected affected areas | Why |
|---|---|---|
| Global theme | `global.css`, shared UI, login/navigation and hardcoded feature classes | Tokens are centralized, but 33 TSX files contain direct colors |
| Gross-profit formula | Dashboard domain, workspace metrics, monthly metadata, docs and tests | Formula is duplicated and historical assumptions are mixed |
| New payment method | Legacy union, V2 settlement union, forms, logs, planner, rules and tests | Two payment models exist |
| New dashboard metric | Dashboard domain/hook/components; possibly workspace snapshot | Dashboard consumes both raw and snapshot sources |
| Inventory navigation | `Page`, menu config, `AppWorkspace`, storage compatibility | Navigation is centralized state, not routes |
| Second store | Nearly every type, query, rule, metric and form | Current runtime is explicitly single-store |
| Business-day closing time | Date helpers, cashout eligibility, logs, reports, forms and rules | Dates are strings without a close-period domain model |

# 17. Architectural Risk Matrix

| Area | Current State | Risk | Evidence |
|---|---|---|---|
| Feature isolation | Partially separated | Medium | Cross-feature imports and central `AppWorkspace` |
| Business logic | Mixed | High | Strong V2 domain but legacy/UI calculations |
| Database access | Partially centralized | High | Store actions plus direct page/hook Firestore access |
| Historical data | Mixed | High | V2 IDs; legacy names and current-setting reports |
| Financial integrity | Mixed | High | V2 transactions versus legacy mutation/non-atomic writes |
| Reporting | Fragile | High | Dual data sources and mutable assumptions |
| Design system | Moderate | Medium | Shared primitives plus widespread hardcoded classes |
| Authorization | Server-enforced but broad | High | Broad reads and rule-level owner bypasses |
| Audit logging | Partial | High | Strong V2 ledger; weak legacy create/update/delete history |
| Testing | Domain-focused | High | No UI/E2E/concurrency or key legacy action tests |
| Extensibility | Moderate for approvals/V2 | High elsewhere | No inventory model and hardcoded single store |
| Maintainability | Moderate | Medium-High | Several large coordinators and duplicate derivations |

# 18. Top Problems To Address First

1. Contain and rotate the client-visible local-auth credential.
2. Define canonical sales, returns, expense, profit and historical-report semantics.
3. Enforce financial invariants and audit immutability at the Firestore boundary.
4. Make related legacy writes atomic and eliminate destructive financial-history paths.
5. Establish a trustworthy, scalable reporting/read-model lifecycle independent of owner sessions.
6. Replace name-based loan/vendor allocation with stable relationships and allocation records.
7. Add runtime schema validation and explicit versioning at Firestore boundaries.
8. Bound subscriptions and queries before multi-year analytics are introduced.
9. Resolve user/Auth lifecycle and durable actor identity.
10. Establish inventory and multi-store foundations before adding those features.

# 19. Files I Should Send To Another Architect For Deeper Review

| File | Why |
|---|---|
| `src/app/App.tsx` | Application startup and top-level data composition |
| `src/app/AppWorkspace.tsx` | Page dispatch and feature coupling |
| `src/store/appStore.ts` | Auth, state, subscriptions and metric synchronization |
| `src/store/storeSubscriptions.ts` | Complete legacy read strategy |
| `src/store/storeActions.ts` | Root action composition and audit creation |
| `src/store/actions/createFinanceActions.ts` | Legacy financial write behavior |
| `src/store/actions/createCashoutCorrectionActions.ts` | Audited cashout correction workflow |
| `src/store/actions/createAuthActions.ts` | User creation/deletion and Auth lifecycle |
| `src/store/deriveWorkspaceMetrics.ts` | Shared reporting read model |
| `src/store/deriveCashMetrics.ts` | Holder cash and legacy identity rules |
| `src/store/vendorLedgerV2Repository.ts` | Transactional V2 persistence |
| `src/domain/financeTypes.ts` | Legacy financial schema |
| `src/domain/appTypes.ts` | Users, loans, cashouts and correction schema |
| `src/domain/workspaceMetrics.ts` | Denormalized reporting document |
| `src/domain/vendorLedgerV2.ts` | V2 domain model and invariants |
| `src/features/dashboard/domain/deriveMonthlyPerformance.ts` | Current dashboard formula definitions |
| `src/features/cash-movement/components/CashMovementForm.tsx` | UI-only balance enforcement |
| `src/shared/lib/firebase.ts` | Firebase and local-auth build boundary |
| `firestore.rules` | Actual authorization and integrity boundary |
| `tests/firestore.rules.test.ts` | Existing security guarantees and missing cases |
