# Firebase Setup

## Hard Rule

If auth setup, first-user bootstrap, Firestore collections, or rules expectations change, update this file with the main architecture docs.

## Setup Steps

These steps are for a new isolated project. Never rerun bootstrap, seed, activation or import operations against the live production project during maintenance.

1. Create a Firebase project.
2. Enable `Authentication -> Email/Password`.
3. Create Firestore in production mode.
4. Copy `.env.example` to `.env` and fill in the Firebase web config.
5. Deploy `firestore.rules`.
6. Create the first auth user in Firebase Authentication.
7. Provision its matching owner profile through a trusted Firebase administration path before normal use. Do not relax rules to bootstrap a live project.

## First User Bootstrap

The client retains first-owner bootstrap code for an empty users collection, but deployed rules and workspace access checks govern whether it can run. Do not rely on it to bypass owner permissions. On a new isolated project, explicitly provision the initial profile matching the Authentication UID.

After that:

- use `Settings` to create `manager` and `billing` users
- do not use a public signup flow because the live product no longer supports it
- any Firebase auth user without a matching Firestore user profile should be treated as invalid workspace access

## Current Live Expectations

- auth is Firebase email/password only
- users are created from inside the app by the owner
- finance writes go straight to Firestore
- app settings live under `appMetadata/appSettings`
- shared searchable names live under `appMetadata/nameDirectory`
- manual planner payments are stored in Firestore and subscribe live with the rest of the workspace data

## Main Collections And Metadata

- `users`
- `stores`
- `sales`
- `purchases`
- `cashouts`
- `payments`
- `loans`
- `dailyCashouts`
- `cashTransfers`
- `plannedPayments`
- `settingsAudit`
- `appMetadata/appSettings`
- `appMetadata/nameDirectory`
- `appMetadata/workspaceMetrics`
- `cashoutCorrectionRequests`
- `appMetadata/vendorLedgerV2Config` and guarded V2 collections documented in [Data Model](../domain/DATA_MODEL.md)

## Deployment Notes

- If a feature introduces a new Firestore collection or metadata document, deploy matching `firestore.rules` before or with the app deploy.
- Hosting deploys alone are not enough when data access rules have changed.
- Stable production releases should be tagged before major deployments.
- Deploy only with explicit confirmation. This cleanup requires no rules/index changes, production activation or data writes.
- Existing client transactions, Authentication, Firestore and Hosting remain Spark-compatible; there is no deployed Functions requirement.

## Local Testing Note

The optional local automatic sign-in settings are:

```text
VITE_LOCAL_AUTH_BYPASS=false
VITE_LOCAL_AUTH_EMAIL=
VITE_LOCAL_AUTH_PASSWORD=
```

These default to disabled/empty. Enabled loopback sign-in still authenticates to the configured Firebase project. VITE-prefixed values are included in browser code: never include real passwords in release build inputs. Existing local .env files are not changed by cleanup.

Run npm run test:rules against its configured demo-alphahub emulator project. Java and Firebase CLI must be available; missing prerequisites are Blocked, not passing tests. Follow the [QA checklist](../operations/QA_CHECKLIST.md); all mutation scenarios require isolated data.

## Relevant Files

- `src/shared/lib/firebase.ts`
- `src/store/appStore.ts`
- `src/store/storeActions.ts`
- `src/store/storeSubscriptions.ts`
- `firestore.rules`
