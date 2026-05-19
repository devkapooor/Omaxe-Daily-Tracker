# Firebase Setup

## Hard Rule

If auth setup, first-user bootstrap, Firestore collections, or rules expectations change, update this file with the main architecture docs.

## Setup Steps

1. Create a Firebase project.
2. Enable `Authentication -> Email/Password`.
3. Create Firestore in production mode.
4. Copy `.env.example` to `.env` and fill in the Firebase web config.
5. Deploy `firestore.rules`.
6. Create the first auth user in Firebase Authentication.
7. Sign in once with that first user so the app can bootstrap the first owner profile.

## First User Bootstrap

On first successful login, if the `users` collection is empty, the app creates the initial Firestore profile as the `owner`.

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

## Deployment Notes

- If a feature introduces a new Firestore collection or metadata document, deploy matching `firestore.rules` before or with the app deploy.
- Hosting deploys alone are not enough when data access rules have changed.
- Stable production releases should be tagged before major deployments.

## Local Testing Note

For local owner-only testing, the app can run with:

```text
VITE_LOCAL_AUTH_BYPASS=true
```

That is a local developer convenience, not the live auth model.

## Relevant Files

- `src/shared/lib/firebase.ts`
- `src/store/appStore.ts`
- `src/store/storeActions.ts`
- `src/store/storeSubscriptions.ts`
- `firestore.rules`
