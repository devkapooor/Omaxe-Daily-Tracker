# QA Checklist

This is the current checklist, consolidated from CURRENT_DRILL_PLAN and the archived DRILL template. Record results as Pass, Fail, or Blocked; an unexecuted scenario is not a pass. Historical reports remain in docs/archive.

## Environment and evidence

- Production financial records, loans, party balances, and existing backups are protected. Production checks are read-only; all writes, auth-account changes, settings changes, imports and activation tests require emulators or isolated non-production data.
- Loan data, calculations, workflows, permissions, and loan-specific UI are strictly out of scope; stop and ask before any task or shared refactor could affect them.
- A local Vite URL does not imply an isolated database: inspect the configured project before any test. Automatic local sign-in uses real Firebase credentials and is not an emulator.
- Use owner, manager, billing, disabled, and unauthenticated fixtures, plus isolated vendor and party fixtures. Never create test records in production.
- Record commit, timestamp, environment/project, role, scenario, observed result, severity, and evidence path. Redact credentials and business data.
- Prefer terminal validation and responsive-CSS inspection. Browser debugging/automation is not part of cleanup; manual visual checks can be recorded separately.
- Repository scripts: npm test; npx eslint src tests; npm run build; npm run test:rules. Rules tests explicitly target demo-alphahub and require an available Java runtime and Firebase CLI.
- Serve the build on loopback with npm run preview -- --host 127.0.0.1. An HTTP check validates the shell and asset URLs, not authenticated financial workflows.

## Authentication and navigation

- Verify Firebase email/password sign-in, sign-out, password updates, profile validation, disabled/deleted-user denial, and restricted-page fallback.
- Returning remembered accounts appear as user cards; selecting one focuses the password field. Verify switching account, fallback email sign-in, forgot-password response, and dark mode on the login screen.
- Owner sees POS, Dashboard, Action Centre, Vendor Workspace, Party Directory, Register, Cashout, Cash Movement, Logs and Settings.
- Manager sees POS, Vendor Workspace, Party Directory, Register, Cashout, Cash Movement and Settings.
- Billing sees POS, Vendor Workspace, Party Directory, Register, Cashout, Cash Movement and Settings.
- Owner creates staff accounts from Settings without losing the owner's session. Non-owner settings remain restricted.
- Verify active menu state, collapsed sidebar, fluid mobile drawer, keyboard focus, modal close controls and disabled/loading/error/empty states.
- Refresh/reopen preserves valid navigation. The internal vendor-preview key must continue to open Vendor Workspace after the folder rename.
- A stale saved `planner` page key falls back to Dashboard and never renders a removed route.
- Use shared responsive layouts at narrow and wide widths. Do not introduce device-model branches or separate mobile implementations.

## Dashboard

- T, T-1 and T-2 consistently control sales, expenses, net after recorded expenses, cash collected, sales mix, comparisons, trend, coverage and outlook.
- Validate monthly totals against isolated sales, expense and daily cashout source records, including missing dates and preceding-month zero values.
- Current-month projections and completed-month actuals remain distinct; margin results are estimates from configured settings.
- Verify break-even zero-margin/unavailable states, remaining daily requirement, and neutral recording coverage without assumed working days.
- Current loan/vendor summary values do not change with the month selector. Do not infer that the dashboard's legacy vendor metric equals V2 account totals; see CALCULATIONS.
- Do not restore removed holder balances, bank-transfer totals, latest closed-day panel or detailed dashboard tables.

## Vendor Workspace and Party Directory

- Verify stable vendor-ID selection, search across profile fields/aliases, active status, compact rows and the view-only details modal.
- Add Vendor opens the existing modal and creates a zero-opening vendor. Party Directory contains people only; adding/renaming a party preserves its approved financial behavior.
- Validate purchase invoice-number uniqueness and source/ledger/projection atomicity, retry behavior and activation-date boundaries.
- The invoice payment shortcut opens a separate reviewed payment form. Test full/partial invoice-linked payments, custom-payment caps, overpayment/concurrency rejection, and separate vendor/invoice balances.
- Test staff settlement correction request, own pending withdrawal, duplicate-pending protection, owner approve/reject/direct edit, stale revisions, reasons, allocation adjustment and immutable original records.
- Test pending returns, accepted full/partial vendor credit, rejection reason, and unsupported cash-refund rejection. Expired goods are returned for ledger settlement; replacements are not part of the workflow. No return changes Cash Movement, bank or loan records.
- Validate new cheque leaves 1120-1199, number normalization/uniqueness, lifecycle permissions, stale revisions, pending visibility and exactly-once debit posting.
- Domain reservation-release tests must cover cancel/bounce retries and unrelated allocations. Do not claim the live cheque UI implements invoice reservation or legacy workbook import unless separately verified.
- Confirm existing legacy cheque data remains read-only in compatibility records and no duplicated financial posting.
- Test all-vendor activation, zero-vendor activation and rollback only in the emulator. Disabled initialized ledgers must not be reinitialized.
- Preserve the [approved vendor rules and remaining gaps](../domain/VENDOR_LEDGER.md).

## Register, cashout and cash movement

- Register contains Expenses and owner-only Loan Taken/Loan Repayment. Vendor purchases/payments belong in Vendor Workspace.
- Check expense validation, cheque details and logs. Cancelling a cheque-details modal must not save.
- With emulator fixtures only, confirm existing loan creation/repayment, oldest-open-loan allocation, overpayment rejection and protected permissions; cleanup must not change their calculations.
- Daily cashout confirmation cancellation does not save. Validate denomination totals, expected cash, matched/cash-less/cash-more status, particulars and linked daily sales.
- Staff may request eligible own-record corrections within seven IST calendar days. Owner edits remain audited; source date and identity stay fixed.
- Test duplicate request, withdrawal, approval, rejection, stale closure, revision increment, source preservation and linked-sales resynchronization.
- Cash Movement person-to-person/person-to-bank entries update the correct user IDs and bank total. Legacy unmatched identities stay in review rather than being silently reassigned.
- Verify cashout drawer correction deltas in holder balances, including legitimate negative results; no hidden balancing entry may be introduced.

## Action Centre, logs and settings

- Only owner can review all requests and approve/reject; staff read only permitted own correction requests.
- Pending actions sort oldest first; latest 20 completed decisions sort newest first; badge updates on every decision/withdrawal.
- Before/proposed values and cash-impact warnings are complete; stale requests cannot be approved. Close as Outdated records its fixed reason without financial changes.
- Returns and V2 settlement corrections retain source-specific actions and permissions. Direct owner edit and reviewed cashout history remain in Logs, without pending approval buttons.
- Logs default to seven IST calendar days and provide 15/30/90/custom ranges, date/name search, sorting, column visibility and pagination.
- Cover all Logs tabs: sales, expenses, purchases, payments, loans, daily cashouts, transfers and settings audit. Range filtering must not truncate shared financial calculations.
- Verify owner projection settings and settings audit, and role-appropriate password changes. Sales logs remain read-only.

## POS billing, stock, and drawer

- Scan/add multiple products; confirm latest additions remain visible, duplicate barcode scans increase quantity, search clears after add, and quantity/removal/discount/payment totals stay consistent.
- Verify finalizing a bill atomically records the bill and stock deduction; canceled/failed checkout must not deduct stock. Use emulator or isolated non-production fixtures only.
- Verify one billing field handles barcode scans and product-name search; unknown barcodes block checkout until a product is created/resolved, new products start at zero stock, and unresolved held-cart lines cannot be finalized.
- Bills loads the newest seven records first; Load more fetches older records incrementally and the loaded list remains scrollable. Verify search and pagination do not duplicate or skip records.
- GRN supports multiple existing/new catalog products, received quantity, editable MRP and cost, line totals, draft/partial/full receipt handling, invoice payable linking, and safe reversal/correction. Confirm only submitted receipt quantities affect stock and the invoice payable matches the full invoice.
- Stock Audit supports multiple scanned items, a unique audit ID, before/physical/delta quantities and rupee impact, confirmation before reconciliation, expandable audit history, and concurrent distinct audits without silent overwrite. Use isolated fixtures; do not reconcile production stock as a test.
- Staff login/logout reconciliations gate billing where required; owners are exempt from those count prompts and can initialize the shared drawer. Discrepancy records remain visible for owner review. Do not fabricate or overwrite counts.
- On an isolated test announcement, verify active-session notice, expiry/dismissal, and displayed `Ctrl+Shift+R` guidance. Do not publish test announcements to production.

## Persistence, PWA and reporting

- In an isolated environment, create and refresh vendor, party, expense, purchase, payment, loan/repayment, cashout, transfer, plan and audit fixtures; verify subscription updates in another client.
- If manual visual verification is performed, cover desktop/mobile navigation, modal focus and responsive layout using the same components.
- For an approved manual PWA drill, check Chrome install eligibility, standalone launch, valid saved page, online-required offline message and recovery. No offline financial write queue is supported.
- Record failures, blocked prerequisites, sync/installability observations and readiness in a dated archive report. Do not overwrite the historical Drill Report.
