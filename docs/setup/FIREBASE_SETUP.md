# Firebase Setup

## Hard Rule

If auth setup, first-user bootstrap, or storage behavior changes, update this file with the main architecture docs.

## Setup Steps

1. Create a Firebase project.
2. Enable `Authentication -> Email/Password`.
3. Create Firestore in production mode.
4. Copy `.env.example` to `.env` and fill in the Firebase web config.
5. Deploy `firestore.rules`.
6. Create the first auth user in Firebase Authentication.
7. Sign in once with that first user.

## First User Bootstrap

On first successful login, the app creates the initial Firestore profile as the `owner`.

After that:

- use `Settings` to create `manager` and `billing` users
- do not use a public signup flow because the live product no longer supports it

## Current Live Expectations

- auth is Firebase email/password only
- users are created from inside the app by the owner
- finance writes go straight to Firestore
- app settings live under `appMetadata/appSettings`
- shared searchable names live under `appMetadata/nameDirectory`
- vendor catalog fallback data may live under `appMetadata/vendorCatalog` if direct vendor writes are permission-blocked

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

