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
- directory, register, cashout, cash movement, planner, logs, and settings workflows
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
    auth/
    cash-movement/
    cashout/
    dashboard/
    directory/
    logs/
    navigation/
    planner/
    register/
    settings/

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
- `features/dashboard`: owner dashboard summaries, projections, latest closed-day view, tables
- `features/directory`: vendor and party management
- `features/register`: expenses, vendor payments, purchases, loans, cheque helpers
- `features/cashout`: daily cashout workflow and drawer audit
- `features/cash-movement`: user-to-user and user-to-bank movement logging
- `features/planner`: cheque-based and manual payment planning against bank balance
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
- keeps users, settings, finance records, planner entries, logs, and `workspaceMetrics` live

## Current Navigation Model

Owner sees:

- `Dashboard`
- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Payment Planner`
- `Logs`
- `Settings`

Manager sees:

- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Payment Planner`
- `Settings`

Billing sees:

- `Directory`
- `Register`
- `Cashout`
- `Cash Movement`
- `Settings`

Internal page ids still use:

- `dashboard`
- `directory`
- `expense` for the `Register` workspace
- `cashout`
- `movement`
- `planner`
- `logs`
- `settings`

Restricted page access resolves back to `expense`.

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
- Dashboard, planner, pending-cash, and monthly-report summary cards now read from Firestore-backed `appMetadata/workspaceMetrics` instead of recomputing primary finance summaries inside page components.
- `Payment Planner` uses live expense/payment cheque data plus manual planned payments, but it does not change cashout or cash-movement balances.
- `Cash Movement` remains separate from `Cashout` and separate from the removed shift-handover experiment.
- Active cash ownership now uses Firebase user IDs end to end for cashouts, transfers, balance cards, and transfer logs.
- Legacy slot fields such as `recordedByHolder`, `from`, and `toPerson` are compatibility-only fields for older documents and are not written by new runtime flows.
- The live workspace migration on `2026-06-05` mapped all resolvable legacy cashouts and cash transfers onto user IDs, so unresolved legacy cash should no longer appear in normal operations.
- The shared metrics snapshot is still generated by the app client because there is no Cloud Functions layer in this repo. Firestore is the shared read source for those summaries across devices.
- Stable releases are now tracked with Git tags and operational docs under `docs/operations/`.
