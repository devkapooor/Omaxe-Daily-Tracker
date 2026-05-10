# Firebase Setup

## Hard Rule

If authentication flow, setup steps, storage behavior, or related file structure changes, update this file together with the main planning docs.

1. Create a Firebase project and enable `Authentication -> Email/Password`.
2. Create a Firestore database in production mode.
3. Copy `.env.example` to `.env` and fill in your Firebase web app values.
4. Create the first auth user in the Firebase Authentication console.
5. Sign in once with that user. The app will auto-create the first Firestore profile as `owner`.
6. Deploy [firestore.rules](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/firestore.rules) to protect the data.

After the owner logs in, use the Settings screen to create manager and billing accounts.

Current live setup expectations:

- user creation happens only from `Settings`
- no public signup flow is used
- monthly operational expense is stored in `appMetadata/appSettings`
- purchases, vendor payments, and daily cashouts all write live Firestore records that feed dashboard totals

The app can import any old browser-only data one time into Firebase, then it clears the legacy local storage keys.

Relevant current implementation files:

- [src/lib/firebase.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/lib/firebase.ts:1)
- [src/data/appStore.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/appStore.ts:1)
- [src/data/storeActions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeActions.ts:1)
- [src/data/storeSubscriptions.ts](/c:/Users/devka/OneDrive/Desktop/Codex Projects/Omaxe Daily Tracker/src/data/storeSubscriptions.ts:1)
