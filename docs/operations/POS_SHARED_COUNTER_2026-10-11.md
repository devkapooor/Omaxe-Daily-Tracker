# Shared POS counter and mandatory logout counts

Status: Committed as `b18fe7c` and deployed in v1.2.0 (`b93a4de`) on 2026-10-11 after user authorization. TypeScript/Vite, focused source lint, whitespace checks, credential-safe build inspection and Firebase Rules compilation (`deploy --dry-run`) passed. Rules released before Hosting; live HTML/JS/CSS hashes matched the release at 17:18 IST. Two-computer runtime acceptance remains pending.

## Approved operating policy

Two billing computers share one physical drawer and UPI/card terminal. Record one opening count when the shared counter starts, let authenticated staff join/resume without repeating counts, and require the app's logout action to save a full shared count before sign-out. Logout does not close the counter. Daily Cashout closes it, requiring a new opening count before further billing.

## Protection and Firebase preflight

Preserve existing bills, stock, refunds, reconciliations, cashouts and loan records. No automated production write, backfill, migration or deletion. Extend the shared ledger/cashier state only through deliberate authorized workflows. Existing financial formulas and Cashout amounts remain intact.

This uses Firestore transactions, Security Rules, Authentication and existing listeners. Spark-compatible; no additional service, composite index, scheduled task or function required. Remove routine full bill-history participant queries. Two existing document listeners provide the shared drawer and own cashier state; joining is a bounded transaction and can be skipped when the persisted session already matches.

## Server authority

- Counter session status/date/opening record live in the shared ledger. Rules validate dates against request.time in IST, authenticated identities, linked opening counts and session transitions. Billing requires an open counter with a server-validated count for the current IST day. A logout count after midnight satisfies that day's count requirement while the counter stays open; it does not cause a duplicate opening prompt on returning. Daily Cashout closure still requires a deliberate new counter opening.
- Login joins write only the caller's cashier state, bound to Firebase auth_time and the current counter opening. Joining cannot change money, checkpoints, reservations or reconciliation records. Older authentication cannot replace a newer login for the same staff ID; each staff member uses their own account. A join racing a count waits for the shared reservation feed instead of triggering repeated writes.
- A count reservation has a serverTimestamp start, authenticated owner/session, operation ID, count kind/date and captured revision. Rules expire it five minutes after the server start. One reservation wins atomically.
- Bills, financial refund approvals, daily Cashout and historical drawer repair respect the active reservation on the server. Count submission must own the exact live reservation and revision/date. Cancellation and owner recovery release it without changing financial values.
- Counts preserve immutable actual/expected/difference evidence; Rules validate calculations and the linked checkpoint/cashier writes. Add a server-recorded timestamp alongside the legacy ISO display timestamp for new count evidence.
- UI buttons/messages mirror server state; browser/session storage and browser wall-clock do not grant permissions. The trusted clock helps render expiry/date; request.time remains authoritative.

Firebase Authentication cannot require a cash count before a browser is closed or someone directly signs out through the authentication SDK. The approved app Logout workflow saves the server-validated count before sign-out. An abandoned counting reservation expires on the server; it never creates a fabricated count.

Opening is explicit through Open Counter in POS. Staff can access other permitted pages, including the prior day's Cashout after midnight, while the counter needs an opening count; billing is rejected on the server until the current-day counter requirements and cashier join are satisfied. Dashboard-only owners retain their existing count exemption. Owners who bill also receive logout counts. A cashier already active in the counter is routed through the logout count even when choosing Sign Out Instead from the opening screen.

## Bounded operations and review details

| Operation | Client document operations, before retries and Rules reads |
| --- | --- |
| Login / join when needed | Two reads, at most one cashier-state write; no count/receipt history query |
| Already joined session refresh | Existing ledger/own-cashier listeners; no join transaction when the state matches |
| Reserve a count | Two reads, one shared-ledger write |
| Save a count | Two reads, three atomic writes: immutable count, cashier state and shared ledger |
| Cancel/recover reservation | One read, at most one ledger write |
| Reservation expiry | No cleanup job or write; Rules compare request.time to the server start + five minutes |
| Daily Cashout closure | Counter closure is added to its existing ledger write |

Real billing also includes Rules-dependent reads, initial listener snapshots, document updates and transaction retries; no measured savings are claimed. A new date invalidates an unfinished prior-day count. An expired/released reservation requires a fresh reservation/count; old inputs cannot be submitted against a new revision. If count saving succeeds but Authentication sign-out fails, Retry Sign Out finishes without creating another count. Cancellation does not create a reconciliation.

Refreshing during a live own-session count reconstructs the counting workflow from the server reservation. Unsaved physical inputs must be entered again; no fabricated draft is recovered. A clock synchronization failure blocks the workflow gracefully and Retry Connection reuses the existing trusted-time service. The installed baseline remains intact; the first deliberate Open Counter after the paired release creates the new session without resetting balances or rewriting old count records.

The legacy login-policy pure helper remains only for old fixtures and is not used by the active boundary. Existing handover repository tests still describe the former login/logout API; they were not changed or run because tests were not requested. Runtime and two-computer authorization acceptance require a separately requested isolated verification pass, including updating those fixtures. Neither Rules compilation nor a TypeScript build demonstrates runtime authorization acceptance.

## Delivery

Update the boundary, repository, checkout/refund/closure paths and Rules together; document review gaps and make a focused checkpoint commit. TypeScript/build, lint, source review and Rules compilation are static checks. Do not add/run tests without user request. Local interaction with live-backed POS is avoided; mutation/runtime acceptance requires an isolated emulator review. Deploy Rules before compatible Hosting only after separate deployment authorization.
