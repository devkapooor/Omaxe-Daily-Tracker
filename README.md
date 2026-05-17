# Omaxe Daily Tracker

Single-store finance operations app for the Omaxe workflow.

## Current Scope

- Owner, manager, and billing login with Firebase Authentication
- Shared Firestore-backed live data across devices
- Owner dashboard with projections, balances, and summaries
- Directory management for vendors and parties
- Register workflows for expenses, vendor payments, purchases, and owner-only loan entries
- Daily cashout flow with drawer audit details
- Cash movement tracking between holders and bank
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
- `Logs`
- `Settings`

Manager and billing see:

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

## Local Auth Bypass

For local owner-only testing, the app can run with:

```text
VITE_LOCAL_AUTH_BYPASS=true
```

That bypass is for local development only and does not replace Firebase auth in the live app.

## Key Docs

- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `CALCULATIONS.md`
- `DRILL.md`
- `TASK_QUEUE.md`
- `PLAN.md`
- `FIREBASE_SETUP.md`
