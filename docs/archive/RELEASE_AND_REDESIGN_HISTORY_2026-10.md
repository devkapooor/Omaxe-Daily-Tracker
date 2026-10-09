# Release and UI redesign history — October 2026

This note consolidates the useful record from five retired POS and UI checkpoint documents dated 2026-10-03 and 2026-10-04. It is historical evidence, not a current operating procedure or a fresh production verification. The original documents remain recoverable from Git history.

## POS release and stock restoration — 2026-10-03

- The initial POS test release was recorded at source commit `28c588b` on Firebase project/site `alphahub-f137b`. The release report records Hosting, Firestore rules, and product-search indexes deployed; the approved opening-stock CSV import completed with 6,069 products and 6,069 cost records, including 379 negative and 3,294 zero opening quantities.
- The approved CSV checksum recorded at the time was `e234dae109bc90988879e5af6789d90e0b4be59bb90f93d0cffb0dbaa521a65b`. The same report says the completed import must not be repeated over current stock.
- A separate POS dashboard and stock-restoration checkpoint records dashboard release commit `21a65d1`, restoration after an interrupted import/reset, and successful completion from the same approved CSV. The dashboard excluded voided bills and reported refund amounts by refund date/method, independently of the Bills page display limit.
- Historical verification included barcode checkout, payment/change, held-cart, receipt, void approval, and stock restoration scenarios. The reports noted that physical scanner/printer hardware was not tested.
- Important later clarification: `posSandboxes/test` is a path name, not permission to treat the contents as disposable. The current POS README warns that the collection contains actual counter sales. Do not reset, reimport, or delete records based on the older “test-only” wording in the original release note.

## App-wide redesign checkpoint — 2026-10-04

- The checkpoint covered shared shell/navigation, themes and scrollbars, Dashboard and POS checkout presentation, responsive/shared UI primitives, and removal of the Payment Planner route/actions.
- Phase 1 records the user's local approval of navigation, light/dark appearance and Dashboard, with the original top spacing retained. The Payment Planner remained removed. The standing safeguard was to keep loan data, calculations, workflows, permissions, and loan-specific UI out of scope.
- Phase 2A records local approval of the Action Centre layout and shared card spacing, with loan-specific screens excluded. Its “next” instructions to proceed to Logs and Settings are historical; later Phase 2B/2C checkpoints and the shared-layout 3A–3C closeout record those subsequent phases.
- The checkpoint documents report local tests, lint, and builds passing at their respective dates, and explicitly state that those redesign checkpoints did not deploy or mutate production data. Their test counts and deployment statements are historical, not current readiness evidence.
- The original checkpoint also noted local `output/` and `.playwright-cli/` artifacts. Those artifacts were not part of this consolidation and must not be removed without a separate retention decision.

## Record status

The standalone notes were removed from the working documentation tree after consolidation. Their original contents remain in Git history. For current behavior and release status, use the root README and the current Architecture, Roadmap, QA Checklist, and Version Log.
