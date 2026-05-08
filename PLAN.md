# Omaxe Daily Tracker - Current Plan

## Hard Rule

Whenever the code structure, navigation, storage model, or delivery plan changes, update:

- `PLAN.md`
- `ARCHITECTURE.md`
- `TASK_QUEUE.md`
- related docs such as `DATA_MODEL.md`, `CALCULATIONS.md`, and setup docs

This is mandatory. Documentation sync is part of the definition of done.

## Current Goal

Maintain and extend a single-store finance operations app that already runs on:

- React + Vite + TypeScript
- Firebase Authentication
- Firestore
- shared component-based UI
- modular CSS

The current work is no longer about scaffolding the MVP. It is about:

- tightening the structure
- improving navigation and workflows
- filling missing finance screens and controls
- keeping docs in lockstep with implementation

## Current Product Scope

The app currently supports:

- login with Firebase email/password
- role-based access
- dashboard summaries and monthly projection
- expense register entry flow
- daily cashout register flow
- purchase entry
- vendor directory management
- loans entry
- cash movement tracking
- settings/user management
- one-time legacy local-data import

## Current Code Structure

```text
src/
  app/
    App.tsx
    uiHelpers.ts
  components/
    ...
    ui/
      navbar1.tsx
  data/
    appStore.ts
    storeActions.ts
    storeShared.ts
    storeSubscriptions.ts
    legacyLocalData.ts
    seedData.ts
  domain/
    appTypes.ts
    financeTypes.ts
    financeCalculations.ts
  lib/
    firebase.ts
  styles/
    global.css
    base.css
    forms.css
    auth.css
    navigation.css
    layout.css
    dashboard.css
    lists.css
    responsive.css
```

## Current UI Direction

The app should stay:

- operational, not marketing-like
- compact and quick to scan
- green/neutral in palette
- shared-component oriented
- mobile-aware but usable on desktop first for owners/managers

The current navbar has already been upgraded to a grouped dropdown pattern and should remain shared.

## Current Planning Priorities

### Priority 1: Complete Current Core Flows

- finish any missing finance entry surface that users still need
- improve validation and user feedback
- keep owner/manager/billing access rules clean

### Priority 2: Reporting And Data Confidence

- improve register/report views
- add export flows
- add data quality checks around incomplete or suspicious entries

### Priority 3: Change Safety

- add tests where the logic risk is meaningful
- protect derived summaries and projections
- prevent structural regressions during refactors

### Priority 4: Documentation Discipline

- keep hierarchy and responsibilities documented
- reflect shared component moves and data-layer splits
- update task queue with real current state, not stale MVP notes

## Current High-Level Work Breakdown

### App Shell And Navigation

- `App.tsx` coordinates page routing and screen composition
- `AppTopBar.tsx` delegates to shared `ui/navbar1.tsx`
- top navigation is shared and should remain the single source of truth

### Data Layer

- `appStore.ts` coordinates auth state, subscriptions, and actions
- `storeSubscriptions.ts` owns Firestore reads
- `storeActions.ts` owns Firestore writes and auth-side mutations
- `storeShared.ts` owns helper types/constants/utilities

### Styling Layer

- `global.css` is only the import hub
- focused CSS files should continue to absorb area-specific changes

## Out-Of-Scope For The Current Stage

- multi-store support
- full accounting ledger
- GST/tax workflows
- inventory system
- payroll/attendance
- backend replacement away from Firebase unless explicitly requested

## Immediate Expectation For Future Changes

All future work should preserve these habits:

- shared components instead of repeated markup
- area-specific style files instead of growing one giant stylesheet
- data actions and subscriptions kept separate
- documentation updated in the same change
