# AlphaHub

Single-store finance operations app for the AlphaHub workflow.

## Current Scope

- Owner, manager, and billing login with Firebase Authentication
- Shared Firestore-backed live data across devices
- Owner dashboard with projections, balances, and summaries
- Directory management for vendors and parties
- Register workflows for expenses, vendor payments, purchases, and owner-only loan entries
- Cash movement tracking between staff holders and bank
- Daily cashout flow with drawer audit details
- Payment planner with cheque-based deduction schedule and manual planned payouts
- Owner-only logs workspace for sales, expenses, purchases, payments, loans, daily cashouts, transfers, and settings audit
- Owner-managed users, password updates, and projection settings
- Installable mobile Chrome PWA with standalone app-shell launch
- Graceful online-only offline screen for installed or cached launches

## Current Stack

- React 19
- Vite
- TypeScript
- Firebase Authentication
- Firestore
- Tailwind CSS v4
- Local shadcn-style UI primitives
- Web app manifest and service worker installability

## Navigation Model

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

`Register` currently contains:

- `Expenses`
- `Vendor Payments`
- `Purchases`
- `Loans` for owner only

## Mobile Install

- The app is installable from Chrome on supported mobile devices.
- Installed launches use standalone display mode like an app shell.
- This phase is PWA-only. True Android TWA packaging is intentionally deferred.
- The app remains online-only for business data and authentication.

## Local Scripts

```powershell
npm install
npm run dev
npm run build
npm run preview
```

## Root Files

These files stay at the repo root because the toolchain expects them there:

- `package.json` and `package-lock.json`: npm scripts and dependency locking
- `vite.config.ts`: Vite bundler config
- `tsconfig*.json`: TypeScript compiler config
- `eslint.config.js`: linting rules
- `firebase.json`, `.firebaserc`, `firestore.rules`: Firebase Hosting and Firestore config
- `components.json`: shadcn component alias config
- `index.html`: Vite app entry HTML

Everything else should generally live under `src/`, `public/`, or `docs/`.

## Local Auth Bypass

For local owner-only testing, the app can run with:

```text
VITE_LOCAL_AUTH_BYPASS=true
```

That bypass is for local development only and does not replace Firebase auth in the live app.

## Source Layout

```text
src/
  app/                 app shell and top-level workspace composition
  domain/              stable domain and finance types
  features/            feature modules grouped by workflow
  shared/
    lib/               shared infrastructure and utilities
    ui/                reusable UI primitives
  store/               Firestore-backed app store and actions
  styles/              global styling entrypoints
```

## Key Docs

- `docs/architecture/ARCHITECTURE.md`
- `docs/domain/DATA_MODEL.md`
- `docs/domain/CALCULATIONS.md`
- `docs/archive/DRILL.md`
- `docs/operations/TASK_QUEUE.md`
- `docs/operations/PLAN.md`
- `docs/setup/FIREBASE_SETUP.md`

