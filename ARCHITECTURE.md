# Architecture

## Hard Rule

These docs must be updated whenever auth flow, navigation, storage rules, data flow, or source structure changes:

- `ARCHITECTURE.md`
- `PLAN.md`
- `DRILL.md`
- any other impacted setup or behavior doc

No feature or refactor is complete until the relevant docs match reality.

## Current Product Shape

Omaxe Daily Tracker is a single-store finance operations web app with:

- Firebase Authentication using email/password
- Firestore as the live shared database
- React 19 + Vite + TypeScript frontend
- Tailwind CSS v4 with shadcn-style shared UI primitives
- Owner / manager / billing role-based navigation
- A fixed top navigation bar shared across the app
- Owner-created staff accounts from `Settings`

The app is no longer using public signup or owner approval queues. It is Firebase-first, with a one-time import bridge for legacy browser data.

## Current Stack

- Frontend: React 19 + Vite
- Language: TypeScript
- Auth: Firebase Authentication
- Database: Firestore
- Styling: Tailwind CSS v4 via `src/styles/global.css`
- UI primitives: local shadcn-style components under `src/components/ui`
- Animation: `framer-motion`
- Icons: `lucide-react`

## Current Source Hierarchy

```text
src/
  app/
    App.tsx
    uiHelpers.ts
    useDashboardMetrics.ts

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
    SettingsPage.tsx
    VendorsPage.tsx
    ui/
      background-components.tsx
      badge.tsx
      button.tsx
      card.tsx
      field-label.tsx
      hover-gradient-nav-bar.tsx
      input.tsx
      native-select.tsx
      section-heading.tsx
      tabs.tsx
      textarea.tsx
      typewriter-effect.tsx

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
    utils.ts

  styles/
    global.css

  main.tsx
```

## Runtime Structure

### App Coordinator

[src/app/App.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/app/App.tsx:1)

- owns page selection state
- resolves role-restricted pages
- wires store actions to screen components
- owns login/loading/app shell transitions
- shows shared toasts and legacy-import banner

### Derived Dashboard Logic

[src/app/useDashboardMetrics.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/app/useDashboardMetrics.ts:1)

- computes dashboard totals
- computes pending cash balances
- computes daily final summary
- derives directory options and recent expense slices
- keeps calculation-heavy logic out of `App.tsx`

### Shared UI Helpers

[src/app/uiHelpers.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/app/uiHelpers.ts:1)

- formatting helpers
- date helpers
- role/page helpers
- cash-holder assignment helpers
- shared UI constants such as categories and fixed expense

### UI Layer

[src/components](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components:1) contains screen and form components.

Important current screens:

- `LoginScreen.tsx`
  login-only start screen with animated `AlphaHub` hero
- `SettingsPage.tsx`
  owner-only create-user form, account directory, password update, and settings audit
- `CashMovementForm.tsx`
  transfer flow driven by dynamic user-to-holder labels

Important shared UI:

- [hover-gradient-nav-bar.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components/ui/hover-gradient-nav-bar.tsx:1)
  fixed top navigation
- [background-components.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components/ui/background-components.tsx:1)
  full-app glow background wrapper
- [typewriter-effect.tsx](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/components/ui/typewriter-effect.tsx:1)
  animated login hero text

### Data Layer

[src/data/appStore.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/appStore.ts:1) is the coordinator hook.

Supporting modules:

- [storeShared.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeShared.ts:1)
  shared store types, constants, and helpers
- [storeSubscriptions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeSubscriptions.ts:1)
  Firestore listeners and collection hydration
- [storeActions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeActions.ts:1)
  auth actions, writes, owner-created user flow, imports, and persistence logic
- [legacyLocalData.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/legacyLocalData.ts:1)
  one-time import bridge from the old browser-storage version

### Domain Layer

[src/domain/financeTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeTypes.ts:1)
and
[src/domain/appTypes.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/appTypes.ts:1)

define the core finance records, user profile shape, page types, cash-holder model, and settings audit records.

[src/domain/financeCalculations.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/domain/financeCalculations.ts:1)
holds pure calculation helpers where applicable.

### Styling Layer

[src/styles/global.css](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/styles/global.css:1)

- imports Tailwind CSS
- defines the theme tokens and radii
- sets global base styles
- acts as the single styling entrypoint

There is no longer a multi-file authored CSS layer for screens and layout.

## Current Navigation Model

The app uses one shared fixed top bar. Available destinations depend on role.

Owner:

- Dashboard
- Loans
- Register
- Cashout
- Purchase
- Vendors
- Cash Movement
- Settings

Manager and Billing:

- Register
- Cashout
- Purchase
- Vendors
- Cash Movement
- Settings

Restricted pages resolve back to `expense` inside the app coordinator.

## Current Auth And User Management Model

- Login is email/password only.
- Public signup is removed.
- The owner creates staff accounts from `Settings`.
- New staff users are created through a secondary Firebase auth session so the owner is not signed out during creation.
- New staff profiles are written to Firestore immediately with:
  - `disabled: false`
  - `approvalStatus: 'approved'`
- Owner can later disable or restore non-owner users from the account directory.
- All signed-in roles can update their own password in `Settings`.

## Current Data Flow

```text
Firebase auth state
  -> appStore verifies user access
  -> Firestore subscriptions hydrate collections
  -> current user resolves from users collection
  -> App.tsx chooses visible page and wires actions
  -> useDashboardMetrics derives cross-screen summaries
  -> form components submit drafts
  -> storeActions persist records to Firestore
  -> onSnapshot listeners refresh UI state
```

Legacy import flow:

```text
Legacy browser data detected
  -> owner/import-capable session triggers import
  -> legacy records are written into Firestore
  -> local legacy keys are cleared
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

## Current Firestore / Rules Notes

- `users` creation is owner-only at the rules layer.
- Public signup request creation is no longer allowed.
- Core operational collections remain staff-readable and staff-writable when the user is active.
- The app still uses a single Firestore database and a single default store record.

## Maintenance Notes

- `App.tsx` was the longest file and has been partially reduced by extracting `useDashboardMetrics.ts`.
- Future large-file splits should keep following stable seams:
  - derived calculations into hooks
  - pure transforms into helpers
  - UI fragments into dedicated components

## Guidance For Future Changes

- prefer shared primitives over screen-specific one-offs
- keep auth/product rules consistent across UI, store actions, and Firestore rules
- keep the app shell thin and orchestration-focused
- update this file and the QA drill whenever product behavior changes
