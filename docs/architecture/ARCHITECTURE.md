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
- cash-holder assignment helpers
- shared payment mode and category constants

### Feature Ownership

- `features/navigation`: desktop sidebar, mobile drawer, menu config, page titles
- `features/dashboard`: owner dashboard summaries, projections, latest closed-day view, tables
- `features/directory`: vendor and party management
- `features/register`: expenses, vendor payments, purchases, loans, cheque helpers
- `features/cashout`: daily cashout workflow and drawer audit
- `features/cash-movement`: holder-to-holder and holder-to-bank movement logging
- `features/planner`: cheque-based and manual payment planning against bank balance
- `features/logs`: owner-only audit and record history
- `features/settings`: user management, password updates, projection settings
- `features/auth`: login, loading, and offline-only auth/system screens

### Store Layer

`src/store/appStore.ts`

- owns the local app state
- connects auth lifecycle, access verification, and subscriptions
- exposes stable reads plus store actions

`src/store/storeActions.ts` and `src/store/actions/*`

- compose auth, finance, and settings write paths
- keep Firestore write concerns out of the feature UI components

`src/store/storeSubscriptions.ts`

- hydrates Firestore collections and metadata into local state
- keeps users, settings, finance records, planner entries, and logs live

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
  -> App resolves current user and allowed page
  -> AppWorkspace renders feature screen
  -> feature forms submit drafts through store actions
  -> Firestore writes complete
  -> subscriptions refresh the live UI
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
- `Payment Planner` uses live expense/payment cheque data plus manual planned payments, but it does not change cashout or cash-movement balances.
- `Cash Movement` remains separate from `Cashout` and separate from the removed shift-handover experiment.
- Stable releases are now tracked with Git tags and operational docs under `docs/operations/`.
