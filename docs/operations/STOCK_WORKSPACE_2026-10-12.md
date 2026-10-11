# Stock workspace implementation checkpoint — 2026-10-12

Status: implementation authorized by the user's exact `APPROVE IMPLEMENTATION`; integrated navigation, query, history and validation stages implemented locally. User visual acceptance and separately authorized deployment remain outstanding. Production records have not been migrated, deleted or rewritten. The live compatibility path remains `posSandboxes/test`.

## Scope and access

The `stock` navigation key now displays **Stock**. Its shared page header contains Current Stock, Receive Stock, Stock Audit and Stock History; narrow layouts show all four tabs in two rows. POS contains Billing, Dashboard and Bills. Vendor invoices, payments and balances remain in Vendor Workspace. Applied price changes still reach the owner's existing Action Centre.

| Capability | Owner | Manager | Billing |
| --- | --- | --- | --- |
| Filter/view Current Stock and recorded costs | Yes | Yes | Yes |
| Direct MRP/selling edit with reason | Yes | Yes | Yes |
| Receive stock, drafts and receipt details | Yes | Yes | Yes |
| Reverse submitted GRN | Yes | No | No |
| Physical count and posting | Yes | Yes | Yes |
| Full audit batch history UI | Yes | No | No |
| Stock History and source receipts/bills/counts | Yes | Yes | Yes |
| Private price-change review evidence / acknowledgement | Yes | No | No |
| Return/void approval details | All | Own requests | Own requests |

The existing UI and Rules restrictions are preserved. Stock History offers approval details explicitly and handles denied access without granting new read permissions. Staff can inspect an individual count's recorded reason without the owner batch-history UI. Quantity is read-only in Current Stock and is changed through the existing Stock Audit workflow.

The historical GRN MRP correction form and its repository writer are retired. Rules reject that correction type, including fabricated movement/event evidence. Historical correction arrays/events remain readable and GRN reversal remains supported. Entering the required prices on a new receipt is retained. Selling price cannot exceed MRP in Current Stock's existing server function or the GRN form/repository validation.

## Query and listener changes

| Surface | Previous behavior at starting HEAD | Implemented behavior |
| --- | --- | --- |
| Current Stock | Filter-first display; complete products and costs listeners once enabled; local 50-row pagination | No catalogue/cost query without a filter; server product pages of 50, then costs for only those IDs in batches of at most 30 |
| Product details | Selected row from catalogue and collapsed movement component | Fresh selected product and cost document listeners, stopped on close; no movement request until expanded |
| Product movement details | Product-wide movement listener; local paging | Reuses bounded history pager; collapse/close unmounts the history component |
| POS | Checkout dependencies and GRN receipt/vendor/config dependencies mounted at POS level | Held carts and fresh checkout config only during Billing; no GRN/audit mounting from POS |
| Receive Stock | Receipt-history listener on entry; vendor data shared from POS | No receipt-history query until History opens; 25-row filtered receipt pages; vendor catalogue requested only when opened, pages of 25; selected vendor fetched by ID |
| Duplicate invoice hint | Derived from limited receipt history | Debounced exact invoice reservation lookup, then linked purchase/receipt documents; includes receipts outside the history date/page |
| Audit history/details | Existing owner Logs feed; expanded batch loads all items | Stock audit history pages of 25; expanded items pages of 50; items requested only on View items. Existing owner Logs batch feed is retained |
| POS / owner's today-sales card | Broad bill-state feed and limited financial records; product catalogue dependency for stock alerts | Selected business-date bills/refunds read through bounded realtime pages of 100; bill states only for matching bill IDs in groups of 30; dashboard stock alert counts plus at most 5 negative and 5 zero-stock products |

The complete financial range is still loaded for exact dashboard totals. A limit is applied to each listener query, not used to silently truncate totals. Boundary changes discard and rebuild later pages. All range/state listeners unsubscribe when the consuming dashboard/card leaves. A busy financial day can therefore require multiple active bounded listeners; this is not constant-read aggregation.

`storeSubscriptions.ts` and unrelated financial subscriptions were inspected and left unchanged. Genuine shared counter/session, financial metrics, owner configuration and Action Centre feeds remain. Owner Receive Stock reuses its existing configuration value; staff mount a scoped configuration document listener. Leaving Stock or an active tab unmounts its readers/listeners. One-shot requests already sent cannot be cancelled; late results are ignored. Concurrent identical reads are shared per authenticated UID; successful data is not cached between visits.

Current Stock refresh resets its cursor and rereads server data. Previous pages are fetched again; a return to a tab mounts a fresh server request. Snapshot time and manual Refresh make cross-terminal changes explicit. Open product details remain live. Checkout waits for a server config snapshot. History uses an explicit trusted-time upper boundary and retains already completed pages only during that open history view; Refresh or a filter change creates a fresh boundary and resets pagination. This is a timestamp boundary, not a Firestore transaction snapshot of all historical documents.

## History sources and ordering

- `stockMovements` is the canonical source for receipts, sales, mapped temporary-item deductions, sellable returns, physical-count/manual adjustments, GRN/void reversals and historical/current price corrections.
- `events` contributes only approved **damaged** return events, as bill-level rows with zero stock change. Sellable-return events are excluded because their stock movements already cover the event.
- `goodsReceipts`, `bills`, `stockAudits`, `stockAuditBatches`, `approvals` and owner-only `stockPriceChanges` are fetched by reference only when their details are opened. Historical GRN correction evidence remains accessible from its existing source records.
- Dated streams query `createdAt DESC, document ID DESC` with limits of 25. Merge buffers and per-stream cursors produce 25-row combined pages ordered by timestamp and deterministic source/ID tie-breaker. Keys are source kind plus document ID. Retry retains successfully fetched buffers and restores uncommitted emitted rows.
- Each Next operation performs at most four source-page requests. Sparse legacy scans can yield an empty page while Next is still available; that state is explained in the UI.
- A dated history query excludes documents with missing timestamps. Undated legacy inspection requires an exact product ID, scans bounded product-specific document-ID pages, and displays unavailable timestamps honestly. No historical repair/backfill is performed.
- Date inputs represent inclusive IST business dates and use a half-open UTC timestamp range. Filters are exact barcode/product ID and event type. Input debounce hides stale rows while a new identifier is being applied.

No independent stock ledger or duplicate audit write was introduced. A damaged return's product membership cannot be determined from its bill-level event. It is excluded from product-filtered results with an explicit explanation; the source can be opened where the role permits. Names, old/new prices, actor and reasons missing from movements are shown as unavailable or accessible in source details. Recorded receipt before/after prices and approval return-line IDs/quantities are displayed without inventing historical values.

## Firestore constraints and indexes

Standard Firestore queries cannot implement the prior unrestricted substring search or grouped case/whitespace vendor aliases without an indexed read model/search service or broad downloads. This implementation uses exact barcode (retaining leading zeros), normalized `searchName` prefix, and exact recorded vendor names. Vendor catalogue prefix matching is case sensitive. Existing records missing an ordered field are excluded by Firestore's ordered query semantics; no migration is attempted.

Quantity-range/name-prefix filters constrain the server order; the effective order is displayed. MRP is nested imported evidence; cost is in another collection and margin is derived. Those three sorts explicitly apply to the loaded page, as approved. No stock-wide quantity/value total is inferred from a page. Audit table search/sorts are also labelled as applying to its loaded server page. Stable cursor ordering includes document ID. A page exactly equal to its limit may require an additional empty request to establish exhaustion.

`firestore.indexes.json` has 65 definitions including the 3 pre-existing definitions. Added families cover vendor/barcode/quantity equality with allowed product ordering; name-prefix plus quantity range; active stock attention; active vendor/name; stock movement identifier/type/date and legacy ID ordering; receipt status/vendor/invoice/date combinations; audit batch/product name; and damaged-return event type/condition/date. Derived price/margin global indexes were not added. These composite indexes have not been deployed or verified ready in production. The emulator validates Rules/query behavior but does not prove production composite-index readiness. Additional indexes also affect write/index storage usage.

Count aggregations scan matching index entries, and queries with multiple range fields can incur index-entry reads. Bounded result pages do not promise a fixed billed read count. Tests assert SDK query bounds and returned documents, not Firebase billing. No measured production read savings are claimed. Page views add no stock/financial writes.

## Authority, services and retained limitations

Project documentation records the existing Firebase Blaze plan and deployed authenticated price functions. This change introduces no additional hosted service or callable, and preserves server-authoritative price posting/review. Existing GRN, physical-count, checkout, held-cart and return posting still use browser Firestore transactions protected by Rules; they are not described as server-authoritative. Moving them to trusted server posting remains a separate approval/design exercise, including independent computation, role checks and idempotency. Their posting algorithms were not migrated here.

Existing GRN reversal clears the current cost if it still belongs to that receipt. It does not reconstruct a prior cost; Current Stock shows Not Recorded and a later audit requires a supplied cost. This was exercised and preserved. Saved GRN drafts persist; unsaved GRN/count forms retain their existing unmount behavior. Billing's active cart, customer/discount and payment draft are now held above POS so entering Stock does not discard them; logout/user change discards this in-memory draft. No new storage or automatic financial write is involved.

## Validation and review

- `npx eslint src`: passed.
- `npm run test`: 24 files / 137 source tests passed, including merged paging failures/retries/ties, query order planning and POS draft preservation.
- `npm run build`: passed; existing bundle-size warning remains.
- `git diff --check`: passed.
- Isolated Firestore emulator: 85 Rules/repository tests passed across Stock workspace, price Rules, POS repository and existing Rules suites. Existing stale counter fixtures now use actual reservations, timestamps and joined-counter fields; counter Rules were not weakened.
- Existing server price handler emulator integration: 11 tests passed, including all staff roles, stale/concurrent edits, idempotency, owner-only review and selling-price ceiling.
- Synthetic browser review uses only `demo-stock-review` at loopback ports. Exercised filter-first stock, next/previous server pages, direct Edit, rejected excessive selling price, valid price save/attribution, history paging/source/approval details, GRN draft resume/post/view/reverse, physical count and owner audit history/items, cart retention/hold/resume and checkout, staff edit attribution, hidden staff audit-history/reversal actions, and owner price review acknowledgement. Desktop and 390px mobile artifacts are under `output/playwright/`.
- Checkout produced the synthetic receipt and updated the shared drawer; native print automation was interrupted by the browser print dialog. Subsequent preview suppresses physical printing only in an ignored test harness; the application receipt implementation is unchanged. Physical printer acceptance is not claimed.

User visual approval, any real-device installed-app acceptance, and production index/Rules/hosting deployment remain pending. The isolated preview and artifacts are review aids, not a production deployment.

## Changed file map

- Navigation/root wiring: `menuConfig.tsx`, `AppWorkspace.tsx`, new `StockWorkspacePage.tsx`.
- Stock UI/data: Current Stock, fresh product details, new receive/audit/history/source/controls components, repositories, query plan/date/merge helpers and server-page hooks.
- POS: `PosPage.tsx`, `PosGoodsReceipt.tsx`, `PosDashboard.tsx`, sandbox/dashboard hooks, new draft store and dashboard repository; retired correction/broad-read helpers in `posRepository.ts`.
- Shared audit presentation: `StockAuditLogTable.tsx` reuses the existing responsive table with lazy bounded detail loading. An optional comparator override in `ResponsiveLogTable.tsx` supplies the audit table's page sorting functions; defaults for other tables are unchanged. Three synthetic audits confirmed ascending/descending date order in browser review.
- Rules/indexes, focused source/emulator tests and these current-state documents. No Functions posting source, vendor posting repository, Cashout logic, held-cart/return algorithms, or global store subscription rewrite is included.
