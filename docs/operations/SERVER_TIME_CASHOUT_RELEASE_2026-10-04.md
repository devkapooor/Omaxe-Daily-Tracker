# Trusted server time and Cashout window release — 2026-10-04

Status: Implemented, validated, deployed to `alphahub-f137b`; user reports the release looks fine for now.
Hosting: https://alphahub-f137b.web.app
Function: `getServerTime`, callable, `asia-south1`, Node.js 20.

## Scope

- Added an authenticated callable server clock. The client samples it at workspace verification, then refreshes every five minutes and on focus/visibility recovery. Business timestamps and IST date defaults now derive from that synchronized clock, with a 15-minute freshness limit; Firestore Rules use `request.time` for the Cashout write boundary.
- Staff and managers may access Cashout from 23:55 through 00:20 Asia/Kolkata. The app hides the navigation entry outside the window and Firestore Rules independently deny staff cashout writes and staff correction requests outside it. Owners remain unrestricted.
- Added owner-managed Action Centre schedules for up to 25 blocking notices. Notices target billing and/or manager roles, use IST trigger times, and require acknowledgement while the browser is open. Acknowledgement is remembered per user/browser for the IST day.
- Staff and manager sign-ins land on POS by default; owner sign-in continues to restore the preferred page.
- Preserved historical cashout records. No financial data migration or production-record rewrite was performed.
- Included the previously approved System Audit = Cash Sales Recorded behavior.

## Validation

- `npx eslint src tests` passed.
- `npm test`: 18 files, 106 tests passed.
- `npm run test:rules`: 2 files, 51 Firestore Rules tests passed in the emulator.
- `npm run build` passed; Vite emitted the existing large-chunk advisory.
- `node --check functions/index.js` and `git diff --check` passed.
- Deployment target was verified as `alphahub-f137b`. Hosting and Firestore Rules releases completed; Firebase lists `getServerTime` as deployed. An unauthenticated HTTP probe returned 401, as expected for this signed-in callable; an authenticated production browser session was not available for automated verification.

## Deployment notes and follow-up

- The first Functions deployment attempt hit Firebase CLI's 10-second discovery timeout. Retrying with `FUNCTIONS_DISCOVERY_TIMEOUT=60000` successfully created the function.
- The deploy command then returned a cleanup-policy warning after the successful function create. No Artifact Registry retention/deletion policy was applied; decide separately whether to keep build images and for how long.
- The function is on Node.js 20. Upgrade its runtime to Node.js 22 before Node.js 20's scheduled 2026-10-30 decommission date.
- Manual review: the user said everything looked fine for now. Future manual review should verify Cashout at both IST window boundaries and test a scheduled notice with a staff account.
