# Architecture

## Hard Rule

If navigation, auth flow, storage behavior, source structure, installability, or derived summary logic changes, update this file with the matching docs in the same pass.

## Current Product Shape

AlphaHub is a Firebase-first, single-store operations app with:

- email/password login
- owner-created staff accounts
- live Firestore subscriptions
- role-based page access
- compact desktop sidebar plus mobile drawer navigation
- Dashboard, Action Centre, POS, Vendor Workspace, Party Directory, Register, Cashout, Cash Movement, Logs and Settings
- POS Billing, Dashboard, Bills, GRN, and Stock Audit workflows
- remembered-account sign-in with password entry and password-reset flow
- installable PWA packaging for Chrome/mobile standalone launch
- online-only offline handling for cached or installed opens

## Current Source Hierarchy

```text
public/
  manifest.webmanifest
  offline.html
  sw.js
  icon.svg
  icon-maskable.svg

src/
  app/
    App.tsx
    AppWorkspace.tsx
    uiHelpers.ts

  domain/
    appTypes.ts
    financeTypes.ts
    workspaceMetrics.ts

  features/
    action-center/
    auth/
    cash-movement/
    cashout/
    dashboard/
    directory/
    logs/
    navigation/
    pos/
    register/
    settings/
    vendor-workspace/

  shared/
    lib/
      firebase.ts
      utils.ts
    ui/
      ...

  store/
    actions/
      createAuthActions.ts
      createFinanceActions.ts
      createSettingsActions.ts
    appStore.ts
    deriveWorkspaceMetrics.ts
    legacyLocalData.ts
    seedData.ts
    storeActions.ts
    storeShared.ts
    storeSubscriptions.ts
    vendorLedgerV2Repository.ts

  styles/
    global.css
```

## Runtime Responsibilities

### App Shell

`src/app/App.tsx`

- resolves authentication, offline, loading, and workspace-access states
- holds the persisted active page
- wires the store into the workspace shell

`src/app/AppWorkspace.tsx`

- renders the authenticated workspace
- maps page state to feature screens
- owns top-level toasts and legacy-import messaging

### Shared App Helpers

`src/app/uiHelpers.ts`

- IST date and display formatting helpers
- page-access resolution for non-owner roles
- user-name resolution and cash-display helpers
- shared payment mode and category constants

### Feature Ownership

- `features/navigation`: desktop sidebar, mobile drawer, menu config, page titles
- `features/pos`: barcode billing, stock deduction and bill history; GRN stock receipts/vendor payables; physical stock audits; drawer reconciliation and POS reporting. POS persistence is under the existing `posSandboxes/test` Firestore path, whose name does not mean its business records are disposable.
- `features/dashboard`: month-scoped performance, sales mix, projections, trend, recording coverage and current financial-position cards
- `features/action-center`: owner review adapters for cashout corrections, settlement corrections and vendor returns
- `features/directory`: Party Directory and the reusable V2 vendor list/details modal
- `features/register`: expense/owner-loan workspace plus reusable V2 purchase/payment forms and cheque helpers
- `features/vendor-workspace`: production vendor workspace, guarded subscription, activation planner and local preview
- `features/cashout`: daily cashout workflow and drawer audit
- `features/cash-movement`: user-to-user and user-to-bank movement logging
- `features/logs`: owner-only audit and record history
- `features/settings`: user management, password updates, projection settings
- `features/auth`: login, loading, and offline-only auth/system screens

### Store Layer

`src/store/appStore.ts`

- owns the local app state
- connects auth lifecycle, access verification, and subscriptions
- reconciles Firestore-backed derived workspace metrics into `appMetadata/workspaceMetrics`
- exposes stable reads plus store actions

`src/store/deriveWorkspaceMetrics.ts`

- derives shared dashboard, planner, pending-cash, and monthly-report read models
- keeps business summaries deterministic before they are written back to Firestore metadata

`src/store/storeActions.ts` and `src/store/actions/*`

- compose auth, finance, and settings write paths
- keep Firestore write concerns out of the feature UI components

`src/store/storeSubscriptions.ts`

- hydrates Firestore collections and metadata into local state
- keeps users, settings, finance records, legacy planned-payment records, logs, and `workspaceMetrics` live

`src/store/vendorLedgerV2Repository.ts` owns guarded V2 transactions. The workspace-level `useVendorLedgerV2` subscription is shared with Action Centre and Vendor Workspace rather than adding one listener per page.

## Current Navigation Model

Owner sees:

- `Dashboard`
- `Action Centre`
- `Vendor Workspace`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Logs`
- `Settings`

Manager sees:

- `Vendor Workspace`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Settings`

Billing sees:

- `Vendor Workspace`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Settings`

Internal page ids still use:

- `dashboard`
- `actions` for Action Centre
- `vendor-preview` for Vendor Workspace (retained for persisted navigation compatibility)
- `directory`
- `expense` for the `Register` workspace
- `cashout`
- `movement`
- `logs`
- `settings`

Restricted page access resolves back to `expense`.

The Directory label is Party Directory. Register mounts expenses and owner-only Loan Taken/Loan Repayment. The source-folder rename does not change page IDs, roles or stored navigation.

## Data Flow

```text
Firebase auth state
  -> access verification against users/{uid}
  -> Firestore subscriptions hydrate collections
  -> app derives shared workspace metrics and writes appMetadata/workspaceMetrics when source records change
  -> App resolves current user and allowed page
  -> AppWorkspace renders feature screens from Firestore collections + workspaceMetrics snapshots
  -> feature forms submit drafts through store actions
  -> Firestore writes complete
  -> subscriptions refresh source records and shared read models
```

Offline or installed launch behavior:

```text
App opened without internet
  -> cached shell or offline fallback may load
  -> auth/workspace verification cannot complete
  -> app shows explicit online-required state
  -> no local shadow data or queued writes are attempted
```

## Current Design Notes

- The app is intentionally single-store and does not implement multi-store routing.
- Monthly Dashboard performance uses the shared pure deriveMonthlyPerformance helper over subscribed source records; settings, liabilities and cash summaries still use workspaceMetrics. Retained monthly-report/table fields are compatibility data, not active dashboard panels.
- The Payment Planner route and its screen actions have been removed. Historical `plannedPayments`, `currentBankBalance`, and `workspaceMetrics.planner` data remain in the shared model for compatibility and audit; no active screen writes them.
- `Cash Movement` remains separate from `Cashout` and separate from the removed shift-handover experiment.
- Active cash ownership now uses Firebase user IDs end to end for cashouts, transfers, balance cards, and transfer logs.
- Legacy slot fields such as `recordedByHolder`, `from`, and `toPerson` are compatibility-only fields for older documents and are not written by new runtime flows.
- The live workspace migration on `2026-06-05` mapped all resolvable legacy cashouts and cash transfers onto user IDs, so unresolved legacy cash should no longer appear in normal operations.
- The shared metrics snapshot is generated by the app client; no Cloud Function currently derives these summaries. Firestore is the shared read source across devices.
- `functions/index.js` exports the authenticated `getServerTime` callable used to synchronize the client clock for cashout controls. This is separate from the client-generated shared metrics snapshot above.
- Stable releases are now tracked with Git tags and operational docs under `docs/operations/`.
- V2 domain helpers and guarded repository transactions are connected to Vendor Workspace. Configuration is read from Firestore; this documentation makes no claim about a current production flag value.
- The disabled owner view still needs the cutover planner and local fixture preview. These are reachable components, not obsolete code.
- VendorDirectoryV2, PurchaseFormV2, OpenInvoicesV2 and VendorSettlementFormV2 are reused by production and preview workflows.
- V2 source records, append-only audit events and transaction-updated projections are distinct from preserved V1 history. See [Vendor Ledger](../domain/VENDOR_LEDGER.md) for current contracts and deferred requirements.
