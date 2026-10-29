# Telegram sales alerts

Scope: daily POS net-sales milestones every INR 5,000, private `/today`, and a report for each completed daily cashout. Bot: `@StoreSalesAlertBot`. Business dates use Asia/Kolkata.

Deployment is isolated: `firebase.telegram.json` selects only the `telegram` codebase, prepared from three bot modules into `output/telegram-functions`. Its Node 22 package does not import or deploy any financial functions. The existing financial package and its runtime are unchanged. Google lists Node 20 decommissioning on 30 October 2026: https://docs.cloud.google.com/functions/docs/runtime-support . Node 22 selection uses Firebase's supported per-config runtime setting: https://firebase.google.com/docs/functions/manage-functions .

## Behaviour

- Read POS bills, bill states and approved refund events from the official live POS path `posSandboxes/test`. The legacy path name does not make these records disposable.
- Match POS net-sales accounting: active bill totals after discount less approved refunds dated today. Payment totals are net of refunds by method; average bill is before refunds, matching the existing dashboard.
- Report current committed totals at processing time. An extremely short-lived crossing reversed before processing may not generate an alert. Do not describe these notifications as a transaction-by-transaction historical audit.
- Activation snapshots current net sales as the baseline. Existing milestones are not replayed. Later days start at zero milestones. A refund does not lower the milestone high-water mark. A large sale produces one combined milestone message.
- `/today` includes POS net sales, bills, average bill, payment split, refunds, recorded cashout count and a check timestamp. It does not add declared cashout credit to POS sales.
- Cashout reports are sent after a new committed cashout with matching drawer-closure evidence, including late and historical closings with explicit labels. Multiple daily closings each show their own window. A revision generates a clearly labelled revised report. Review-only changes without a new revision do not send another report.
- A report separates declared credit, returns, inclusive cash paid out, expected cash, counted cash and shortage/excess. An unreconciled historical count never appears matched.
- No timers or midnight cron are required. Midnight rollover comes from the business-date key. No closing report is fabricated if staff have not recorded a cashout.

## Security and delivery

- One JSON Secret Manager secret, `ALPHAHUB_TELEGRAM`, contains `token`, `chatId` and a random `webhookSecret`.
- Local `.env.telegram.local` and prepared `.env.telegram.secret.json` are ignored by Git AND explicitly excluded from the Functions source archive. Never paste or log their contents.
- Webhook: HTTPS POST, constant-time Telegram secret-header verification, one allowlisted private chat AND matching sender ID. Group, foreign-user and stale pre-activation messages are ignored.
- An authenticated, active Firebase owner must enable the bot. Commands, sales events and delivery recheck that owner's current account status. Disabling that account or pausing the bot stops subsequent processing.
- `telegramControl`, `telegramDays`, `telegramOutbox` are server-only; existing default-deny Rules exclude all client reads/writes, including owners. No financial collection is mutated by the bot.
- Transactional milestone and command keys deduplicate concurrent events/replays. A delivery lease prevents concurrent sends. Successful deliveries retain their Telegram message ID.
- Confirmed Telegram rate-limit/server rejections retry with backoff and a finite attempt limit. A network timeout or crash after sending can leave acceptance unknown: mark `uncertain` and do not automatically resend. Telegram has no sendMessage idempotency key, so do not promise exactly-once delivery.
- Owner Settings > POS includes enable/pause, status refresh and a failed/unconfirmed-delivery count. Inspect server-only outbox records to resolve an uncertain delivery manually; do not bulk reset them to queued.
- A pause cancels queued delivery when it is next processed. An HTTP send already in flight may complete.

## Local validation (no real Telegram messages)

Unit tests:

```powershell
node --test functions/telegramSalesAlerts.test.js
```

Start the cached official Firestore emulator in a separate terminal on dedicated port 8189, project `demo-telegram-alerts`. Use Java 21 and the installed `cloud-firestore-emulator-v1.22.0.jar` with:

```text
--host 127.0.0.1 --port 8189 --project_id demo-telegram-alerts --single_project_mode true --single_project_mode_error true
```

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8189'
$env:RUN_TELEGRAM_EMULATOR_TESTS='true'
node --test --test-force-exit --test-timeout=90000 functions/telegramSalesAlerts.integration.test.js
```

Tests reject other hosts, never initialize the production project, and stub all Telegram traffic. They cover independent accounting, exact thresholds, jumps, refunds/recrossings, concurrent/repeated events, IST rollover, baseline, webhook authentication, owner revocation, cashout revisions, delivery retries/ambiguity and client Rule attacks.

The explicit Node test-runner exit option closes retained Firebase SDK handles only after the tests finish; the timeout still fails unfinished tests.

## Production release checkpoint

Local implementation approval is not release approval. Do not deploy, enable APIs, register the production webhook or enable the control until the release checkpoint is approved.

1. Confirm the selected project is `alphahub-f137b` and recheck the current shared-workspace diff. Blaze was verified during setup; no plan change is required. Review any concurrent financial work before building the frontend from this checkout.
2. Read-only preflight existing Cloud Functions/Cloud Run, Artifact Registry, Cloud Build, Eventarc, Pub/Sub and Secret Manager services, event-trigger region compatibility with the actual Firestore location, and service-account permissions. Review incremental usage/billing; no claim of zero cost. Stop for a decision if a required service/permission is unavailable.
3. Run `npm --prefix functions run prepare:telegram` and `npm --prefix functions run build:telegram`. These prepare the existing token/chat ID and random webhook secret locally, plus the separate six-file Node 22 source package. Run `npm --prefix output/telegram-functions ci --ignore-scripts` so local function discovery has the pinned SDK dependencies. The dedicated predeploy hooks repeat source preparation and dependency installation. No credentials are displayed. Verify both private files with `git check-ignore` before upload.
4. After release approval, create the production secret from the private data file, using the official CLI without token arguments:

```powershell
firebase functions:secrets:set ALPHAHUB_TELEGRAM --data-file functions/.env.telegram.secret.json --config firebase.telegram.json --project alphahub-f137b
```

5. Deploy ONLY the new `telegram` codebase with its separate config. It exports exactly seven bot functions and cannot redeploy the financial codebase. Confirm the packaged source excludes every local credential file:

```powershell
firebase deploy --config firebase.telegram.json --only functions:telegram --project alphahub-f137b
```

6. Build/review the isolated owner page with `npx vite build --config vite.telegram.config.ts`, explicitly disabling local bypass/emulators and blanking local bypass credentials. If the current full app is not the exact live release, use `node functions/scripts/deployTelegramControl.js --deploy` to add only the dedicated HTML/assets to the latest live Hosting manifest/config. It checks for concurrent Hosting releases before publishing and preserves all original file hashes. The main Vite build also includes this page so future normal Hosting releases retain it. No Firestore Rules/index deployment is needed for the bot's server-only collections and single-field queries.
7. As the owner, open `/telegram-settings.html` (or Settings > POS after the full frontend's next reviewed release) and enable. This validates bot identity, registers the fixed project webhook and private command menu, and atomically saves today's baseline. A one-time admin bootstrap may invoke the same tested configure handler using the existing project-owner CLI credential and the uniquely matching active Firebase owner profile. Such a bootstrap must derive its clock from a fresh Firestore server read time, not the workstation clock. Never activate by hand-editing financial data.
8. In the allowlisted Telegram private chat, run `/today` and compare to POS for that exact date. Observe the next real milestone/cashout. Do not manufacture bills, refunds or closings in production for testing. Record Not Run until each live acceptance observation actually occurs.

Rollback: pause Telegram in owner Settings first. Queued deliveries cancel without changing financial records. Keep delivery records for audit. If needed remove only the seven new functions; remove or clear the bot webhook separately using the existing server secret. Never restore database backups or reset the POS to roll back notifications.

## Validation checkpoint — 24 October 2026 IST

| Check | Status | Evidence |
| --- | --- | --- |
| Telegram unit + isolated integration/Rules checks | PASS | Final run: 28 tests, 28 pass, zero fail/cancel/skip; dedicated demo project on 8189, no real Telegram requests. |
| Existing Functions unit regression | PASS | 21 tests passed. Other financial emulator suites were intentionally skipped without their dedicated fixtures; this is not full finance acceptance. |
| Frontend production build | PASS | `npm run build`; existing large-chunk warning remains. |
| Changed settings components lint and TypeScript | PASS | Focused ESLint, `tsc -b`, and production build. |
| Settings UI | PASS, isolated | Actual component rendered at 390px; enable and pause transitions verified with a synthetic Functions adapter. Screenshot: `output/playwright/telegram-settings-card.png`. This is not production activation evidence. |
| Credential packaging | PASS | Firebase CLI's actual source enumeration for the final isolated package includes six source files, zero credential files/node_modules, and no bot token in source. Both private files also pass `git check-ignore`; the frontend bundle contains no bot token. |
| Functions export registration | PASS | The generated Node 22 package loads exactly seven bot Gen2 exports in `asia-south1`; credentials bind only to delivery, webhook and owner configuration. No financial exports are included. Local tests used Node 24; the deployed Node 22 runtime remains a release smoke check. |
| Existing cloud services | PASS | Read-only API check: Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Eventarc and Pub/Sub enabled. Firestore location: `asia-south1`. |
| Secret Manager | NEEDS RELEASE DECISION | Read-only service check returned DISABLED. Enable only as part of approved production setup. |
| Production deploy, webhook registration, `/today` acceptance and real milestone/cashout delivery | NOT RUN | Awaiting release checkpoint; no production financial records changed. |

Attempt history: the initial 15-case emulator run passed. An expanded run completed its 18 assertions but retained SDK handles and was interrupted before runner completion; do not count it as a completed pass. The final 28-case run above completed with the documented force-exit/timeout options. The first visual fixture failed because its SDK alias was incomplete; that fixture was corrected before the successful UI check. No production traffic was used in either fixture.

## Production release — 25 October 2026 IST

The user explicitly instructed: "complete it, deploy it". This supersedes the pending release decision above.

- Secret Manager enabled; `ALPHAHUB_TELEGRAM` version 1 created from the private file. The default runtime service account received access to this secret through the official Firebase deployment flow. No secret value was printed or put in source.
- Seven bot-only Node 22 Gen2 functions deployed to `asia-south1`, codebase `telegram`. Existing financial functions, their runtime/dependencies, Rules, indexes and financial records were not changed.
- The bot-only lockfile is `functions/telegram-package-lock.json`. A compatible audit patch moved body-parser to 1.20.9 before activation, resolving the high-severity compressed-request DoS advisory. No forced major SDK upgrade was applied. Moderate upstream SDK audit findings remain maintenance work; this is not a claim of a clean dependency audit.
- The installed CLI did not serialize the SDK's JSON-secret parameter correctly. The adapter now uses a plain secret parameter plus JSON parsing. An additional protocol regression test passed: 11 current unit tests plus the previously completed 18 isolated integration/Rules cases. Production endpoint checks rejected invalid webhook secrets (403) and anonymous owner-control calls (401).
- Hosting owner controls: https://alphahub-f137b.web.app/telegram-settings.html . New version `sites/alphahub-f137b/versions/5b021aabc2989d6d` extends base `sites/alphahub-f137b/versions/d7b3434185c1809c`. Server manifests verified all 10 original paths retain exactly their original hashes; only three dedicated owner-page files were added. The main dashboard still serves `/assets/index-hk0Gxhw8.js`. The new unauthenticated owner-page login gate rendered with zero console errors.
- The regular whole-app build was not deployed because its committed baseline did not exactly match the live website. The new main build includes both entry pages for later reviewed releases and passes TypeScript/Vite validation.
- Activation used the existing authenticated project owner's uniquely matching active Firebase owner profile and the tested configure handler. Its baseline and timestamps used a fresh Firestore server read time with monotonic elapsed time. No old milestones were replayed.
- The registered webhook is `https://asia-south1-alphahub-f137b.cloudfunctions.net/telegramSalesWebhook`. Telegram confirmed it is configured, with zero pending updates and no webhook error. Incoming commands remain restricted to the already configured private Telegram sender/chat.
- A notification-only startup outbox record was delivered by the actual Firestore trigger and Cloud Run sender; status `sent`, Telegram message ID 8. No direct sender shortcut or financial mutation was used for this end-to-end check.
- Live `/today` user acceptance and first natural milestone/cashout observations are tracked below. Do not invent bills/refunds/cashouts to close those observations.

Release attempt history: the first CLI attempt stopped at a stale authentication token before creating functions; refreshing the existing login fixed it. A subsequent noninteractive attempt required the intended retry-policy acknowledgement (`--force`), followed by the secret-parameter compatibility fix. First-time Eventarc agent permission propagation delayed five trigger creations; its service-agent role was verified present and the retry succeeded. Two owner-page drafts failed at upload-response parsing and were not released; after using the CLI's streaming response mode, the additive Hosting release completed. All seven functions were then successfully updated with the patched dependency package before activation.

| Live acceptance observation at release close | Status |
| --- | --- |
| All seven bot functions deployed and active on Node 22 | PASS |
| Owner control page HTTP/render, anonymous login gate, original Hosting manifest preservation | PASS |
| Invalid webhook secret / anonymous owner-control rejection | PASS (403 / 401) |
| Configured Telegram webhook, no pending updates/errors | PASS |
| Actual Firestore outbox trigger → Cloud Run → Telegram private-chat startup message | PASS, message 8 |
| Real user-issued `/today` through Telegram | PASS — user confirmed "yes its working"; live command replies recorded as sent, Telegram message IDs 11 and 13. No incoming update was fabricated. |
| First natural INR 5,000 milestone / completed cashout after activation | NOT RUN; no artificial production bill/refund/cashout created |
