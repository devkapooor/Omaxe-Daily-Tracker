# Action Centre Phase 3 — 11 October 2026

Status: Committed as `e225cde`; all three Action Centre phases deployed in v1.2.0 on 2026-10-11 after user authorization. User visual/runtime acceptance remains pending. The sections below retain the original implementation-checkpoint evidence.

## Scope and protection

Complete owner pending coverage and sidebar/page counts across all six types; share pending feeds; load completed history on demand with cursor pagination; retain source-detail caching. No production repair, migration, financial decision or automated mutation. Existing write handlers, audit shapes, Rules and loan behavior remain unchanged.

## Firebase preflight and billing design

- No new Firebase service, Blaze-dependent operation, summary writer, background job or composite index. Use existing single-field equality and timestamp indexes.
- Owner POS approval and handover feeds become pending-only with no limit. Move them to the workspace so the sidebar and list share one subscription each. This adds owner pending reads while other pages are open; it is the explicit cost of a continuously current badge. Staff do not get these listeners.
- Owner cashout corrections become pending-only. Preserve staff own-request access; load owner own-request history in Cashout Corrections and bounded date-range audit history in Logs when their views open.
- Vendor pending corrections/returns remain shared. Scope vendor workspace data/history to that page and vendor names to pages that display them. Fetch an individual payment state on opening its details rather than subscribing to all payment states for Action Centre.
- Completed Action Centre history is fetched by bounded timestamp cursor pages only after History opens. Reuse successful pages/buffers when switching tabs or filtering. Reviewed records use reviewedAt, which all existing decision writers record; automatically matched handovers use createdAt. The matched-handover stream scans bounded createdAt chunks and discards other statuses to avoid a new compound index. No document-name range is added to queries.
- Historical search/type/requester filters apply to loaded history. Load More retrieves the next chronological page. Explicit Refresh includes decisions made elsewhere; it is not a background history listener.
- Counts are unavailable while any required pending feed is loading or failed, rather than presenting a partial count as complete.

## Delivery

Build/TypeScript, focused lint, source/whitespace checks and local HTTP at one implementation milestone. Do not add/run tests or use browser automation. Record a focused checkpoint commit; keep separate Current Stock changes untouched. Review all three phases locally before any deployment request. Actual production read savings are not claimed without measurement.

## Read paths after implementation

| View / role | Shared Action Centre and vendor listeners | History/detail reads |
| --- | --- | --- |
| Owner, other pages | Vendor config + pending cashout, vendor correction, vendor return, POS approval and handover feeds: six listeners | No Action Centre history or detail reads |
| Owner, Action Centre Pending | Same six feeds + vendor names; sidebar/list use the same arrays | POS preview: two documents initially; a newer bill revision reuses the immutable receipt and reads its state once. Payment preview: one document per source/revision. Cached reopening uses no extra source reads. Explicit Refresh rereads the source. |
| Owner, Action Centre History | No extra history listener | Up to 25 merged history entries per click, fetched in 10-document source chunks. At most 10 chunks / 100 returned documents per click; six initial streams when vendor ledger is enabled. Buffered rows are reused. Empty queries may still incur minimum read charges. |
| Owner, Vendor Workspace | Same six shared feeds + the nine existing workspace data/history feeds scoped to that page | Completed correction/return feeds are disjoint from the shared pending feeds. Merge by ID during status transitions. |
| Staff, other pages | No Action Centre POS/handover/vendor pending listeners; existing own cashout-request feed remains | No Action Centre history access. Other app finance/POS listeners remain outside this phase. |
| Staff, Vendor Workspace | Existing config and nine workspace feeds, plus own cashout requests | Existing staff vendor and own-correction views are retained. |

The prior owner vendor/cashout setup kept eleven related listeners global, with three additional POS/handover listeners on Action Centre. Listener counts are structural evidence, not billed-read measurements: document volumes, active owner pages, request changes, reconnects and empty-query charges affect actual usage. The general finance/store subscriptions are not redesigned here.

Cashout owner Corrections loads its own requests only while that panel is mounted. Logs loads correction audit records only for the selected date range while Daily Cashouts is open. Its existing UTC date-key behavior is preserved. These compatibility reads prevent loss of historical views after the owner shared cashout feed becomes pending-only.

## Paging and review behavior

- Pending queries have no date/record limit. Both counts wait for all required feeds, and show unavailable/loading instead of a partial numeric result.
- Timestamp cursors use complete document snapshots, including implicit document identity for equal timestamps. No explicit document-name range or composite query is introduced.
- The pager merges reviewedAt streams with matched handover createdAt history. Sparse matched history is scanned in bounded chunks; known newer results may render using the raw timestamp cursor boundary. A sparse page may contain fewer than 25 entries; Load More continues without restarting the scan.
- Successful source buffers/cursors survive a failed read. Retry reads the failed/unfilled streams and restores any entries merged during the interrupted page. History filters and tab switches do not restart queries. Refresh resets the history session; a successful decision queues invalidation if a history read is already in flight.
- Current decision writers always record reviewedAt; matched handovers use their creation time. This phase does not backfill records or invent absent audit timestamps.
- Vendor payment state is fetched/cached on opening a pending correction. Revision/value mismatches or a missing state block approval; existing write-time transaction checks remain unchanged. Future outdated vendor closures get a vendor-specific reason; old historical reasons remain recognized without rewriting records.
- All six types retain Phase 2 detail panels and confirmations. Financial write functions, Rules, indexes, loan data and notification settings are unchanged.

## Verification

Production build (TypeScript and Vite) and focused ESLint passed, including the cache refinements. The final POS outdated-result history invalidation also passed focused lint. Git whitespace/source review and local HTTP checks passed. The existing large-bundle warning remains. Automated tests, browser interactions, production decisions and mutations were not performed; visual/runtime acceptance and actual billed usage are not claimed as verified.
