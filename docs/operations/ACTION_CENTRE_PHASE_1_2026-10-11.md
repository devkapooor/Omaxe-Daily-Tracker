# Action Centre Phase 1 — 11 October 2026

Status: Phase 1 implemented locally; user visual review pending; not deployed.

## Scope

- Combine existing cashout corrections, vendor payment corrections, vendor returns, POS void/return requests and handover reviews into one pending list, oldest first.
- Separate Pending and History tabs; fixed header/filter bar with a scrollable list.
- Filter existing loaded data by request type, requester and search text. Use consistent labels and status badges.
- Move scheduled blocking notification editing to owner-only Settings → Staff Notifications.

## Firebase and data preflight

Phase 1 is a client presentation change using the existing Firestore collections, subscriptions, settings save action and approval/review repositories. It adds no Firebase service, index, background job, summary document or subscription, and requires no Blaze-dependent capability.

Existing POS and handover listeners will have one owner in the Action Centre page. Pending/History tab switches and local filtering must not create additional subscriptions or writes. Notification settings continue to use the existing app-settings write and settings audit action on explicit Save.

The implementation preserves existing financial transactions, approval checks, stock/refund effects, handover acknowledgement behavior, Firestore Rules and staff access. No production writes, financial actions or browser interaction are used for implementation validation.

## Later phases

Phase 2 adds consistent source-detail previews and decision confirmations. Phase 3 addresses pending-query completeness, accurate global counts, history pagination and read reduction. Phase 1 history remains bounded by the existing source queries; the sidebar badge still uses the existing correction queue.

## Validation and review

- Production build/TypeScript and focused ESLint passed. The release build disables local auto-login and emulator connections; local development configuration is preserved.
- Git whitespace checks passed. The local server responded with HTTP 200.
- Source review confirmed financial repositories, Firestore Rules and collection query definitions are unchanged. The prior POS/handover wrapper components were retired after their presentation and actions moved into the unified list.
- The auxiliary source hook mounts the same POS approval listener and the same reconciliation subscription once per Action Centre visit; its effect is independent of filters and the active tab. Reconciliation retains its existing recent and pending listeners. No extra backend subscription is added for the page count or requester names.
- Pending combines all currently loaded sources and sorts oldest first. History combines the existing bounded histories and sorts by decision time; record loading and pending coverage remain subject to the Phase 3 query work.
- Automated tests and browser interaction were not performed. No production record, notification setting or financial decision was changed during validation.
- Review locally: Action Centre → Pending/History; filter by request type/requester/search; inspect fixed bars and scrolling; Settings → Staff Notifications. Source details and uniform decision confirmations remain Phase 2.
- A focused local checkpoint commit is required before review. This phase does not deploy or commit the separate pending Current Stock upgrades.
