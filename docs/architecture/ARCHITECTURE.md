# Architecture

## Hard Rule

If navigation, auth flow, storage behavior, source structure, installability, or derived summary logic changes, update this file together with the matching docs.

## Current Product Shape

AlphaHub is a Firebase-first, single-store operations app with:

- email/password login
- owner-created staff accounts
- live Firestore subscriptions
- role-based page access
- compact operations-first UI
- shared directory, register, cashout, movement, logs, and settings surfaces
- installable PWA packaging for Chrome/mobile standalone launch
- online-only offline handling for cached or installed opens

## Current Source Hierarchy

```text
public/
  icon-maskable.svg
  icon.svg
  manifest.webmanifest
  offline.html
  sw.js

src/
  app/
    App.tsx
    uiHelpers.ts
    useDashboardMetrics.ts

  components/
    AppTopBar.tsx
    CashMovementForm.tsx
    ChequeDetailsModal.tsx
    DailyCashoutDetailsModal.tsx
    DailyCashoutFinalSummaryPanel.tsx
    DailyCashoutForm.tsx
    DashboardRangeFilter.tsx
    DashboardTables.tsx
    DirectoryPage.tsx
    ExpenseForm.tsx
    LoadingScreen.tsx
    LoanForm.tsx
    LoanLedger.tsx
    LoanRepaymentForm.tsx
    LoginScreen.tsx
    LogsPage.tsx
    MonthlyProjectionPanel.tsx
    OfflineScreen.tsx
    PurchaseForm.tsx
    SearchableSelect.tsx
    SettingsPage.tsx
    SummaryCard.tsx
    VendorPaymentForm.tsx
    useChequeDetails.ts
    navigation/
      menuConfig.tsx
    ui/
      accordion.tsx
      background-components.tsx
      badge.tsx
      button.tsx
      card.tsx
      field-label.tsx
      hover-gradient-nav-bar.tsx
      input.tsx
      mobile-drawer-nav.tsx
      morph-loading.tsx
      native-select.tsx
      navigation-menu.tsx
      section-heading.tsx
      sheet.tsx
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
    financeTypes.ts

  lib/
    firebase.ts
    utils.ts

  styles/
    global.css
```

## Main Runtime Roles

### App Coordinator

`src/app/App.tsx`

- resolves login, loading, page shell, and offline states
- holds the active page in local storage
- wires forms to store actions
- shows top-level toasts and legacy-import banner
- keeps page rendering orchestration in one place

### Derived Dashboard Logic

`src/app/useDashboardMetrics.ts`

- builds directory options
- computes dashboard sales and expense totals
- computes latest closed-day summary
- computes pending cash balances and bank total
- computes vendor outstanding and open loan totals
- keeps summary math out of the render tree

### Shared App Helpers

`src/app/uiHelpers.ts`

- IST date helpers
- display formatting helpers
- role-based page resolution
- cash-holder assignment helpers
- shared payment mode and category constants

## Main Screen Ownership

### Navigation Shell

- `src/features/navigation/components/AppTopBar.tsx`
- `src/features/navigation/config/menuConfig.tsx`

These own the current grouped desktop/mobile navigation experience.

### Dashboard Surface

- `DashboardRangeFilter.tsx`
- `MonthlyProjectionPanel.tsx`
- `DailyCashoutFinalSummaryPanel.tsx`
- `DashboardTables.tsx`
- `SummaryCard.tsx`

### Directory Surface

`DirectoryPage.tsx`

- vendor directory tab
- party directory tab
- owner-only opening outstanding editing

### Register Surface

- `ExpenseForm.tsx`
- `VendorPaymentForm.tsx`
- `PurchaseForm.tsx`
- `LoanForm.tsx`
- `LoanRepaymentForm.tsx`
- `ChequeDetailsModal.tsx`
- `useChequeDetails.ts`

`useChequeDetails.ts` removes duplicated cheque-state logic from expense and payment forms.

### Cashout Surface

- `DailyCashoutForm.tsx`
- `DailyCashoutDetailsModal.tsx`

### Movement Surface

- `CashMovementForm.tsx`

### Logs Surface

`LogsPage.tsx`

- sales
- expenses
- purchases
- payments
- loans
- daily cashouts
- cash transfers
- settings audit

### Settings Surface

`SettingsPage.tsx`

- owner user creation
- owner user deletion
- projection settings
- password updates

### Offline Surface

`OfflineScreen.tsx`

- installed and cached launches show a clear online-required state when internet is unavailable
- no shadow business data or queued writes are attempted

## Data Layer

### Store Coordinator

`src/store/appStore.ts`

- owns local state
- wires subscriptions
- exposes store reads and actions
- retries access verification when the network returns

### Writes And Side Effects

`src/store/storeActions.ts`

- sign-in and sign-out
- owner-created user flow
- expense, purchase, loan, cashout, transfer, and payment writes
- vendor and party directory writes
- operational settings writes
- legacy data import

### Live Subscriptions

`src/store/storeSubscriptions.ts`

- hydrates Firestore collections into local state
- keeps app settings, directories, and finance records live

## Installability Layer

- `public/manifest.webmanifest` defines install metadata
- `public/sw.js` provides conservative app-shell caching for installability
- `public/offline.html` is the browser-level fallback for fully offline navigation
- `src/main.tsx` registers the service worker in production
- the app does not attempt offline business-data sync or queued writes

## Current Navigation Rules

Owner:

- `dashboard`
- `directory`
- `expense`
- `cashout`
- `movement`
- `logs`
- `settings`

Manager and billing:

- `directory`
- `expense`
- `cashout`
- `movement`
- `settings`

Restricted page access resolves back to `expense`.

## Current Data Flow

```text
Firebase auth state
  -> appStore resolves current user
  -> Firestore subscriptions hydrate collections
  -> App.tsx selects visible page
  -> useDashboardMetrics derives summaries
  -> form components submit drafts
  -> storeActions persist records
  -> subscriptions refresh live UI
```

Offline or installed launch behavior:

```text
App opened without internet
  -> service worker may serve cached shell or offline.html
  -> App.tsx shows explicit online-required screen
  -> no local shadow data or queued writes are attempted
```

## Current File-Splitting Assessment

Recent clean splits:

- shared cheque state moved into `useChequeDetails.ts`
- shared summary card moved into `SummaryCard.tsx`
- offline fallback UI isolated in `OfflineScreen.tsx`
- dashboard metrics already live in `useDashboardMetrics.ts`

Next likely seams, only if growth continues:

- split `LogsPage.tsx` by tab section
- split `DirectoryPage.tsx` by vendor vs party blocks
- consider lazy loading or chunking if bundle growth becomes a release concern

