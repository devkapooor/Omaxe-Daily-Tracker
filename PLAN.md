# Omaxe Daily Tracker - Current Plan

## Hard Rule

Whenever auth flow, navigation, data structure, storage rules, or UI architecture changes, update:

- `PLAN.md`
- `ARCHITECTURE.md`
- `DRILL.md`
- any other doc that becomes stale because of the change

Documentation sync is part of the definition of done.

## Current Goal

Maintain and extend a single-store finance operations app that now runs on:

- React + Vite + TypeScript
- Firebase Authentication
- Firestore
- Tailwind CSS v4
- shadcn-style shared UI primitives in `src/components/ui`

The app is already live and Firebase-first. Current work is about:

- keeping finance workflows compact and dependable
- making role-based user management simpler for the owner
- preserving cross-device consistency
- keeping the codebase easier to change as screens grow

## Current Product Scope

The app currently supports:

- login with Firebase email/password
- owner-created user accounts from `Settings`
- owner / manager / billing role-based access
- dashboard summaries and monthly projection
- expense register entry
- daily cashout register entry
- purchase entry
- vendor directory management
- loans entry
- cash movement tracking
- password update for all signed-in users
- account directory, create user, disable/restore, and settings audit for the owner
- one-time legacy browser-data import into Firebase

## Current Product Rules

- Public signup is removed.
- The owner creates staff accounts directly from `Settings`.
- New staff accounts are active immediately after creation.
- `Pending Requests` and `Launch Cleanup` are not part of the live product anymore.
- The app remains single-store only.

## Current Code Shape

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
    storeActions.ts
    storeShared.ts
    storeSubscriptions.ts
    legacyLocalData.ts
    seedData.ts
  domain/
    appTypes.ts
    financeCalculations.ts
    financeTypes.ts
  lib/
    firebase.ts
    utils.ts
  styles/
    global.css
```

## Current UI Direction

The app should stay:

- operational first, not marketing-heavy
- compact enough to show more information on one screen
- warm neutral with green/blue accents
- shared-component based
- mobile-safe but owner-optimized on desktop

Important current UI choices:

- fixed hover-gradient top bar
- reusable glow background wrapper
- login hero with animated `AlphaHub`
- no custom per-page CSS files; utility-first Tailwind classes are the main styling layer

## Current Engineering Priorities

### Priority 1: Workflow Reliability

- keep every finance write flow stable across desktop and mobile
- preserve linked updates between forms, summaries, and registers
- keep Firestore rules aligned with the product rules

### Priority 2: Owner Administration

- keep owner-created account flow simple
- maintain clean role restrictions
- keep settings audit meaningful

### Priority 3: Maintainability

- continue splitting oversized files when a stable seam exists
- keep `App.tsx` focused on orchestration
- keep derived calculations in hooks or pure helpers instead of growing render files

### Priority 4: Documentation Accuracy

- reflect real auth flow, not old signup-approval behavior
- reflect the Tailwind/shadcn-style structure
- keep QA drill steps aligned with the live product

## Recent Structural Change

To make future changes easier:

- dashboard and summary derivations were moved out of `App.tsx` into `src/app/useDashboardMetrics.ts`

This is the preferred direction for future splits:

- calculation-heavy logic into hooks or pure modules
- app-shell rendering kept in `App.tsx`
- screen-specific behavior kept close to the screen component

## Out Of Scope

- multi-store support
- full accounting ledger
- payroll or attendance
- inventory management
- GST/tax module
- Cloud Functions dependent flows unless explicitly requested

## Expectation For Future Changes

All future work should preserve these habits:

- shared UI primitives over repeated markup
- owner-managed user creation, not public signup
- focused hooks/helpers for derived data
- Firebase-first persistence
- documentation updated in the same change
