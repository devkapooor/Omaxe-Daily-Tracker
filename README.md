# AlphaHub

Single-store finance operations app for the AlphaHub workflow.

## Production Data Safety Rule

Existing production financial records must never be modified, deleted, migrated, backfilled, or replaced as a side effect of development, testing, deployment, or an upgrade. Production verification is read-only. Any test that writes data must use the Firebase Emulator Suite or clearly isolated non-production data.

Only a deliberate action by an authorized user through an approved live financial workflow may change a production record. Every future upgrade must document and verify that it preserves existing production data before implementation begins.

## Current Baseline

- First stable release tag: `v1.0.0` (historical baseline, not the latest feature snapshot)
- Live Hosting URL: `https://alphahub-f137b.web.app`
- Repository: https://github.com/devkapooor/Omaxe-Daily-Tracker (primary branch: `main`)

## Current Scope

- Owner, manager, and billing login with Firebase Authentication
- Shared Firestore-backed live data across devices
- Owner dashboard with T/T-1/T-2 performance, comparisons, trend, coverage and projections
- Owner Action Centre for cashout corrections, vendor payment corrections and return decisions
- Vendor Workspace for vendor profiles, purchases, separate payments, invoices, returns, corrections, cheques and balances
- Party Directory for people; Register for expenses and owner loan entry/repayment
- Cash movement tracking between real staff user accounts and bank
- Daily cashout flow with drawer audit details
- Shared financial summaries retain read-only legacy cheque metrics for compatibility
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

`Register` currently contains:

- `Expenses`
- `Loans` (Loan Taken and Loan Repayment) for owner only

The Directory navigation label is `Party Directory`. Vendor creation is available only from the Vendor Workspace modal.

## Mobile Install

- The app is installable from Chrome on supported mobile devices.
- Installed launches use standalone display mode like an app shell.
- This phase is PWA-only. True Android TWA packaging is intentionally deferred.
- The app remains online-only for business data and authentication.

## Cash Ownership Model

- Active cash ownership is user-account based, not slot based.
- New daily cashouts save `recordedByUserId`.
- New cash transfers save `fromUserId` and `toUserId`.
- Pending counter cash is derived from cashout and transfer history, not from stored slot snapshots.
- Legacy slot fields remain in Firestore only as compatibility fields for older records.
- As of `2026-06-05`, the live legacy cash records were migrated onto user IDs and unresolved legacy cash balances were cleared from the active workspace.

## Local Scripts

Use Node.js with npm and the locked dependency versions. Configure a local `.env` from `.env.example` with the intended Firebase web-project settings before starting the app. A local URL can still point at production; financial mutation tests must use an isolated project or the emulator.

```powershell
npm ci
npm run dev
npm test
npx eslint src tests
npm run build
npm run preview -- --host 127.0.0.1
```

`npm run test:rules` uses the `demo-alphahub` Firestore emulator and requires Java and Firebase CLI. See [Firebase setup](docs/setup/FIREBASE_SETUP.md) and the [QA checklist](docs/operations/QA_CHECKLIST.md). No Cloud Function or Blaze service is needed.

## Root Files

These files stay at the repo root because the toolchain expects them there:

- `package.json` and `package-lock.json`: npm scripts and dependency locking
- `vite.config.ts`: Vite bundler config
- `tsconfig*.json`: TypeScript compiler config
- `eslint.config.js`: linting rules
- `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`: Firebase Hosting and Firestore config
- `components.json`: shadcn component alias config
- `index.html`: Vite app entry HTML

Source, PWA assets, documentation and rules tests live under `src/`, `public/`, `docs/` and `tests/`. Protected historical records in `docs/backups/` and `server/omaxe.db` are retained; they are not cleanup targets or the active application database.

## Local Auth Bypass

Optional automatic sign-in is controlled by:

```text
VITE_LOCAL_AUTH_BYPASS=false
VITE_LOCAL_AUTH_EMAIL=
VITE_LOCAL_AUTH_PASSWORD=
```

When explicitly enabled on localhost/127.0.0.1, this still authenticates against the configured Firebase project. Leave it disabled for ordinary use. Every `VITE_*` value is client-visible; never include real passwords in build inputs or release artifacts. Do not commit local environment files. Cleanup does not change existing `.env` values.

## Source Layout

```text
src/
  app/                 app shell and top-level workspace composition
  config/              application constants
  domain/              stable domain and finance types
  features/            workflows, including vendor-workspace
  shared/
    lib/               shared infrastructure and utilities
    ui/                reusable UI primitives
  store/               Firestore-backed app store and actions
  styles/              global styling entrypoints
```

## Key Docs

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Data model](docs/domain/DATA_MODEL.md), [calculations](docs/domain/CALCULATIONS.md), and [vendor ledger](docs/domain/VENDOR_LEDGER.md)
- [Roadmap and task queue](docs/operations/ROADMAP.md)
- [QA checklist](docs/operations/QA_CHECKLIST.md)
- [Version log](docs/operations/VERSION_LOG.md), [release process](docs/operations/RELEASE_PROCESS.md), and [rollback](docs/operations/ROLLBACK.md)
- [Firebase setup](docs/setup/FIREBASE_SETUP.md)
- [Historical drill report](<docs/archive/Drill Report.md>) and [vendor implementation archive](docs/archive/PURCHASE_VENDOR_CHEQUE_IMPLEMENTATION_2026-10-01.md)
- [Cleanup audit and retained-file risks](docs/archive/PROJECT_CLEANUP_AUDIT_2026-10-01.md)

## Release Management

- Stable versions are tagged in Git using semantic version tags such as `v1.0.0`.
- Every stable release gets an entry in `docs/operations/VERSION_LOG.md`.
- Rollbacks should redeploy a tagged stable version instead of rewriting `main`.
- Commit small verified changes; ask for deployment confirmation separately. Never deploy rules or mutate financial data merely to clean up the repository.

