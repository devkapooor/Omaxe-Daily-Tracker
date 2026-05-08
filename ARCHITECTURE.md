# Architecture

## Hard Rule

These project documents must be updated whenever structure, navigation, data flow, storage, or implementation priorities change:

- `ARCHITECTURE.md`
- `PLAN.md`
- `TASK_QUEUE.md`
- `DATA_MODEL.md`
- `CALCULATIONS.md`
- any setup doc affected by the change

No feature, refactor, or cleanup is considered complete until the relevant docs above are brought in sync.

## Current Product Shape

Omaxe Daily Tracker is currently a single-store finance operations web app with:

- Firebase Authentication using email/password
- Firestore as the live data store
- React + Vite + TypeScript frontend
- Plain modular CSS, not Tailwind
- Owner/manager/billing role-based navigation
- A shared top navbar with grouped dropdown navigation
- Screen-specific forms for expense register, cashout register, purchase, vendors, loans, cash movement, and settings

This is no longer a browser-storage MVP. The current implementation is Firebase-first, with a one-time legacy browser-data import path.

## Current Stack

- Frontend: React 19 + Vite
- Language: TypeScript
- Auth: Firebase Authentication
- Database: Firestore
- Styling: modular plain CSS imported via `src/styles/global.css`
- Icons: `lucide-react`

## Current Source Hierarchy

```text
src/
  app/
    App.tsx
    uiHelpers.ts

  components/
    AppTopBar.tsx
    CashMovementForm.tsx
    CashoutForm.tsx
    DailyCashoutFinalSummaryPanel.tsx
    DailyCashoutForm.tsx
    DashboardRangeFilter.tsx
    DashboardTables.tsx
    LoadingScreen.tsx
    LoanForm.tsx
    LoginScreen.tsx
    MonthlyProjectionPanel.tsx
    PurchaseForm.tsx
    RecentCashoutList.tsx
    SearchableNameField.tsx
    SettingsPage.tsx
    VendorsPage.tsx
    ui/
      navbar1.tsx

  data/
    appStore.ts
    legacyLocalData.ts
    seedData.ts
    storeActions.ts
    storeShared.ts
    storeSubscriptions.ts

  domain/
    appTypes.ts
    financeCalculations.ts
    financeTypes.ts

  lib/
    firebase.ts

  styles/
    auth.css
    base.css
    dashboard.css
    forms.css
    global.css
    layout.css
    lists.css
    navigation.css
    responsive.css

  main.tsx
```

## Runtime Structure

### App Coordinator

[src/app/App.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/app/App.tsx:1)

- owns page selection state
- resolves role-restricted pages
- computes dashboard summaries
- wires store actions to UI forms
- renders screen-level components

### Shared UI Helpers

[src/app/uiHelpers.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/app/uiHelpers.ts:1)

- formatting helpers
- shared constants
- date helpers
- simple UI/domain glue helpers

### UI Layer

[src/components](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components:1) contains screen and form components.

[src/components/ui/navbar1.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components/ui/navbar1.tsx:1) contains the shared top navbar pattern with:

- desktop grouped dropdown menus
- mobile expandable menu
- current app palette and spacing conventions

### Data Layer

[src/data/appStore.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/appStore.ts:1) is now a coordinator hook.

Supporting modules:

- [storeShared.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeShared.ts:1)
  shared store types, constants, and helpers
- [storeSubscriptions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeSubscriptions.ts:1)
  Firestore listeners and collection hydration
- [storeActions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeActions.ts:1)
  auth actions, writes, imports, and persistence logic
- [legacyLocalData.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/legacyLocalData.ts:1)
  one-time import bridge from old browser storage

### Domain Layer

[src/domain/financeTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeTypes.ts:1)
and
[src/domain/appTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/appTypes.ts:1)

define the app’s core records and role/page types.

[src/domain/financeCalculations.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeCalculations.ts:1)
contains pure finance calculations where possible.

### Styling Layer

[src/styles/global.css](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/styles/global.css:1)
is now an entrypoint that imports focused CSS files:

- `base.css`
- `forms.css`
- `auth.css`
- `navigation.css`
- `layout.css`
- `dashboard.css`
- `lists.css`
- `responsive.css`

## Current Navigation Model

The app uses a single shared top navbar. Available destinations depend on role.

Owner:

- Dashboard
- Register
- Cashout
- Purchase
- Vendors
- Loans
- Cash Movement
- Settings

Manager/Billing:

- Register
- Cashout
- Purchase
- Vendors
- Cash Movement

Restricted pages are resolved back to `expense` inside the app coordinator.

## Current Data Flow

```text
Firebase auth state
  -> appStore subscriptions load Firestore collections
  -> current user profile resolves from users collection
  -> App.tsx computes visible page state and dashboard values
  -> form components submit drafts
  -> storeActions persist records to Firestore
  -> onSnapshot listeners refresh UI state
```

Legacy import flow:

```text
Old browser storage detected
  -> one-time import action available
  -> import writes old records into Firestore
  -> local legacy keys cleared
```

## Current Major Screens

- Login
- Dashboard
- Expense Register
- Cashout Register
- Purchase Entry
- Vendors
- Loans
- Cash Movement
- Settings

## Current Implementation Notes

- The app is not using Tailwind or shadcn as a project-wide UI system.
- The navbar component lives in `src/components/ui` for reuse, but it is adapted to the app’s current plain-CSS stack.
- Monthly fixed expense is currently hardcoded to `500000`.
- The app remains single-store only.

## Next Structural Guidance

When adding or refactoring features:

- prefer shared components over copy-pasted UI
- prefer focused files under `components/`, `data/`, and `styles/`
- keep `appStore.ts` as coordinator, not a new dumping ground
- update this file and related docs in the same change
