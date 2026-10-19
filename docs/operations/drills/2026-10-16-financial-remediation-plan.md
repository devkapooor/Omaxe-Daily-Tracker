# Financial remediation and release plan — 16 October 2026

Status: **Proposed; awaiting implementation approval.** This document makes the requested fixes concrete. No application changes, production mutations, commit, push or deployment are part of this planning step. Existing approved Batches 1–5 and their uncommitted changes remain intact.

Evidence: [full financial report](2026-10-16-full-financial-testing.md), [143-scenario coverage matrix](2026-10-16-financial-coverage.md). Fresh browser results: 133 passed, 7 failed, 3 skipped. Four failures reproduce three application issues; three failure groups use obsolete UI/void contracts. The additional cheque race and deposit accessibility finding have separate recorded evidence. There are also 23 unresolved historical Rules contracts. Passing posting checks do not erase these failures.

## Agreed behavior retained

- Register owns outgoing vendor payments and expenses; POS owns billing and cash refunds. Cash Movement remains separate after Cashout.
- Server posting, actor/role checks, stale revisions, count locks and exactly-once operation recovery remain mandatory. No browser posting fallback.
- Staff operations do not wait for owner review. Review never posts a second payment, refund or price change.
- Cheques use the accepted compact table/icon UI: Issued before date, In progress on/after date, final Debited with no undo. Existing protected exception actions retain reason and typed CONFIRM.
- Preserve the accepted Cashout form, receipt formats, held carts, vendor/invoice allocations, stock/GRN/audit behavior and historical void visibility. Do not restore new voids.
- No historical balance reset, backfill or replay. In particular, do not deduct the 14 October cash vendor payments again: the owner reported already counting those manually.

## Stage 1 — privacy and shared-terminal safety

### FT-01 — P1: prevent staff bank-balance disclosure

**Confirmed impact.** Manager and billing clients directly read the synthetic owner bank balance from appMetadata/appSettings despite the owner-only panel. Rules allow whole-document staff reads; Firestore cannot redact individual fields. Evidence F45-12 remains a failure until resolved.

**Additional source finding.** deriveWorkspaceMetrics.ts:92–100 creates runningBalanceAfter and availability/deficit from the bank balance; that planner is stored in the staff-readable appMetadata/workspaceMetrics (Rules:891). A row amount plus running balance can reveal the opening balance. This second route is confirmed in source; add an independent emulator/browser reproduction before counting it as a tested exploit. Inspect other staff-readable sources, callable responses, caches and error messages for the same values. Inspect settingsAudit permissions too. Do not assume that hiding two fields completes the privacy boundary.

**Concrete design.**
1. Keep bankBalanceControl/main and the existing appMetadata/appSettings bank mirror owner-readable only. Preserve their paths, actual values, server revision/mismatch checks and atomic finance writers. Do not delete the mirror or initialise the bank again.
2. Add appMetadata/staffSettings and appMetadata/staffWorkspaceMetrics as explicitly allowlisted projections. Staff settings contain only the operational settings, notifications and announcements staff currently need. Staff metrics preserve required non-bank dashboard/register/cash-holder data; omit bank-derived planner balances and deficit signals. Cheque dates, face amounts and status remain available through their already-authorised source workflow. Do not replace hidden balances with a misleading zero or mark unknown funding as available.
3. Use authenticated owner-only publication in the existing Functions codebase to atomically save canonical settings plus the safe settings projection and audit identity. Accept only existing nonfinancial editable fields; reject bank fields and unrecognised fields. Publish the existing informational metrics cache through an allowlist that stores private/full and safe versions together. That cache remains informational; it must not become posting authority. No new scheduler, trigger or independent financial ledger.
4. Route owner and staff subscriptions to their respective documents; use explicit types so staff state cannot ingest bank-only fields. Preserve announcement delivery and other shared settings. Clear relevant in-memory/app-owned bank state on role change; do not wipe recovery journals, held carts or unrelated browser storage.
5. Deny staff reads of both original full documents, including collection/query paths; deny all direct writes to safe projections and to the newly server-owned publication paths. Review overlapping Rules branches. Owner bank display stays on Owner Dashboard.
6. Prepare a dry-run, owner-authorised publication of the initial safe projections from the current canonical documents. It copies approved configuration/derived views only, with no financial posting. Its production execution needs the separate release authorisation. Missing/stale/schema-incompatible projections show a visible unavailable/retry state and never fall back to private documents.

**Likely affected files.** firestore.rules; functions/index.js and a narrowly scoped shared-view/settings publication module; src/store/storeSubscriptions.ts, storeShared.ts, appStore.ts, actions/createSettingsActions.ts, deriveWorkspaceMetrics.ts; src/domain/workspaceMetrics.ts; useDashboardMetrics.ts and OwnerBankBalance.tsx if their types/readiness need adjustment; new focused Rules/Functions/browser tests and release publication tooling.

**Compatibility/history.** Bank posting in financeOperations.js/registerPayments.js keeps the existing trusted balance and mirror contract. Production history is untouched. Old staff clients reading the old documents will receive PermissionDenied; old owner settings/cache writers must fail visibly and reload rather than diverge from the new projections. Prepare a coordinated hosting/Functions/Rules release and explicit installed-client update check. Previously downloaded private values cannot be remotely erased by Rules; clear application-owned state where controllable and verify role switching. No rollback may reopen staff bank reads or client financial posting.

**Acceptance.** Direct SDK reads/list/query attempts by manager, billing, disabled and unauthenticated clients reveal no owner bank amount through these routes; owner reads still succeed. A nonempty planner fixture proves bank reconstruction is unavailable. Forged settings/publication requests and direct writes reject without changes. Owner settings, staff notifications, announcements, Dashboard, bank-funded payments, cheque debit and deposits still work. Independent balance/revision checks, lost-acknowledgement recovery and bank mismatch rejection remain intact. Missing projection/offline/old-client behavior is explicit. Privacy changes do not grant any new role permission.

### FT-03 — P2: make Log out reliable and visible after refresh

**Impact/root cause.** A shared terminal can remain logged in after clicking Log out. AUTH-04 reproduced twice. CashierHandoverBoundary.tsx:93 silently returns for readiness/busy/error/joinError while the visible logout button remains usable. Instrument the exact failing branch before choosing the correction; it is not yet proven which guard fired.

**Fix/components.** CashierHandoverBoundary.tsx, its useCashierHandover state and App/layout logout wiring as required: retain the logout intent until validated state is ready, or present explicit readiness/recovery/error and retry. Preserve mandatory counts and unresolved operation recovery; do not implement a direct-signOut escape around them. Prevent repeated clicks from launching duplicate counts.

**History/compatibility.** No changes to count, cashier membership, cash or financial records except the already-required count workflow. Existing refresh/recovery semantics and remembered-account privacy remain.

**Acceptance.** Fresh and refreshed owner/manager/billing sessions either visibly enter the required count/recovery step or actually sign out (Auth UID null). Check closed/open counter, joining, unavailable clock/listener, active Cashout/count lease, pending checkout/refund/payout and account switching. No silently ignored click, duplicate count or skipped mandatory count. Complete AUTH-04 remembered-card, keyboard focus and account-switch steps; store no passwords.

## Stage 2 — source viewing and cheque usability

### FT-02 — P2: keep Logs receipt open

**Impact/root cause.** Refund source evidence disappears during inspection; B3-19 is blocked and F45-13 independently reproduced it. Table cell renderer identity changes during workspace ticks; RefundReceiptLink stores the popup state in a disposable cell. Verify unmount behavior while implementing.

**Fix/components.** LogDataTables.tsx, RefundReceiptLink.tsx, ResponsiveLogTable.tsx narrowly as required. Hold selection/loading/error/dialog state in a stable parent outside row cells; stabilise relevant column/callback identities. Reuse PosBillView/useReceiptDialog, lazy source reads and existing receipt format.

**History/compatibility.** Read-only fix; no record or receipt rewrite, no standing bill listener, no duplicate source fetch.

**Acceptance.** Keep the popup open through multiple real workspace ticks and a live table update on desktop and phone (at least 30 seconds); test source-row filtering/pagination while open, loading/error/retry, Close/Escape and focus restoration. F45-13 and the entire B3-19 connected Cashout/correction/receipt workflow must pass. Confirm zero business writes from viewing.

### FT-04 — P2: remove the due-cheque confirmation race

**Impact/root cause.** Opening Cancel immediately for an issued cheque dated today captures an old revision; automatic presentation changes it during confirmation. User receives source revision stale. Server correctly refuses; no double debit occurred. RegisterCheques.tsx:40–43 and :51–83 show the race.

**Fix/components.** RegisterCheques.tsx and financeRepository.ts only if a narrow fresh-read helper is needed. Expose per-row presentation readiness/retry before enabling decisions. On confirmation, verify current source identity/revision. If it changed, explain what changed and require fresh confirmation; never silently submit a changed payload under the old operation ID or weaken server stale checks. Keep detail-eye/action icons and final Debited behavior.

**History/compatibility.** No rewritten cheque/payment history or automatic debit. Existing issued/presented and terminal statuses retain their meaning; preserved sources/allocations and exactly-once financial effects remain.

**Acceptance.** Controlled due-presentation versus cancel, debit and bounce races across independent contexts; unchanged records for stale/rejected actions, understandable renewed confirmation, one successful posting with correct revision, unchanged cash drawer, correct bank/payable effects and no post-debit undo. Future cancellation and ordinary due debit continue passing. Double-click/network-loss recovery remains safe.

### FT-05 — P3: label the bank deposit method clearly

**Impact/root cause.** CashMovementForm.tsx nests two controls under To; the second accessible name is Select an option. This caused ambiguous keyboard/test selection. Real deposit/recovery passed with the corrected current locator.

**Fix/components.** Separate destination and Bank deposit method labels/IDs in CashMovementForm.tsx and its existing field wrapper if necessary. Preserve values, compact phone layout and server payload.

**Acceptance.** Distinct accessible names, keyboard selection and phone layout; bank-counter/CDM deposit options as currently supported; the actual supported deposit routes retain independent holder/bank/drawer reconciliation and exactly-once lost-response recovery. No posting/history behavior changes.

## Stage 3 — unblock coverage and reconcile tests

These are not additional confirmed production financial defects.

1. **AUTH-06 environment blocker.** createAuthActions.ts:58–59 creates secondary Auth without connecting it to the local emulator. The outbound guard correctly blocks account creation. Reuse the explicit emulator configuration from shared/lib/firebase.ts for secondary instances before any Auth call; fail closed in drill mode. Keep production endpoint behavior, real profile/role gates and cleanup unchanged. Verify owner staff creation, restricted-role denial, profile creation and primary-session retention with real local Auth. Do not disable the network guard or mock success.
2. **23 historical Rules failures.** Classify each exact failed contract in the preserved inventory. Replace retired positive client-posting expectations with specific denied-write assertions plus equivalent positive business outcomes through authenticated trusted callables. Update stale count-quote/custom-database fixtures to the approved API. Preserve independent source/stock/cash/actor/allocation invariants and permitted client count/read workflows. No catch-any-error assertions, skipped-to-green cases or relaxed Rules. Retain original failures and map every replacement by ID.
3. **Obsolete browser contracts.** Map the old owner-void scenarios to explicit new-void rejection, repeated-SKU return coverage and historical void viewing. Replace the old expense-cheque overlay expectation with the accepted Register cheque controls/confirmation/focus coverage. Reconcile the report's case-versus-failure-group counts explicitly; never count removed tests as successful execution.
4. **Rules complexity.** Record which negative probes reach the 1000-expression limit. Verify relevant legitimate paths without that failure. Optimise only the affected branch if required for correctness; avoid a general Rules rewrite and retain every authority fence.
5. **Timed gaps.** Execute the actual elapsed reservation-expiry variant and the real IST midnight shared-counter transition in isolated data. Preserve synthetic boundary tests as supporting evidence, not substitutes. If a real-time window cannot be observed, keep it Not Run and make the release decision explicit.

Likely test files: tests/drill/financeFollowup.spec.cjs, remaining.spec.cjs, refund.spec.cjs, checkout.spec.cjs, advanced.spec.cjs, resilience.spec.cjs and focused current finance/legacy/refund Rules suites; functions/financePosting.integration.test.js plus shared-view tests. Preserve all Batch 1–5 regression tests and original artifacts. Update drill.md and the dated execution/coverage report after each batch.

## Blocked / manual / release-only work

- B3-19 is blocked by FT-02; remaining remembered-account steps by FT-03; secondary account creation by the Auth emulator setup. They become runnable after their specific fixes.
- Installed Android Chrome PWA update/cache behavior, physical scanner and receipt printer require manual checks. A headless browser screenshot is not acceptance for these.
- No production correction of 14 October payments. If reconciliation is requested later, begin read-only and compare the already-recorded manual deduction before proposing any adjustment.
- Production callable availability, indexes/Rules, bank initialization/mirror consistency and safe-projection publication need a read-only release preflight and a separately authorised release action. Emulator success does not prove deployed configuration.
- Loan mutations remain excluded. No loan behavior change or new loan fixture.
- Existing owner-browser-derived informational metrics are an architecture limitation, not a trusted financial ledger. This plan removes confidential fields from staff projections; a full server-derived reporting migration is separate scope. Existing tested posting authority is retained.
- Reuse existing Node 20 Functions and Firestore services. No dependency upgrades, billing-plan change, scheduler or new service proposed. Safe-projection publication adds bounded document writes/callable invocations; staff switches one settings/metrics listener for another rather than adding catalogue listeners. Quantify actual use during tests; do not promise measured cloud savings or a rupee cost without evidence.

## Validation and completion gates

1. Obtain implementation approval for this plan. Suggested first batch: **FT-01 and FT-03**, then FT-02/04/05, then remaining test contracts/coverage. This prioritises confidential data and shared-terminal safety while keeping fixes reviewable.
2. Implement locally, preserve existing working changes and failure artifacts. Use focused regression checks after each cohesive stage; full milestone validation once the fixes are integrated.
3. Prove exact demo Auth/Firestore/Functions isolation and block nonlocal traffic before every mutation batch. Separate browser contexts, independent integer-paise expectations, explicit IST dates, source/actor/revision/balance snapshots and exactly-once assertions. No production tests or loans.
4. Run updated Rules/emulator tests, Functions integration tests, domain tests and the complete current browser matrix; include preserved checkout attacks, 200-line checkout, stock/receiving/audit/reversal, returns, holds, counter locks, Register/vendor payments, cash/bank/cheque/deposit/transfer/Cashout and review-after-continued-billing. Retain errors/traces/screenshots for failures.
5. Run npx eslint src, relevant test lint, npm run build and git diff --check at the meaningful integrated milestone using installed tooling/hidden Windows processes. If launcher workarounds are needed, record the equivalent commands honestly. No dependency upgrade.
6. Present local UI for owner review: bank privacy by role, logout/count/recovery, stable Logs receipt, cheque ready/confirm/error state and deposit labels. Recheck approved Cashout/Register/Cheques layouts. No extra visible terminal windows.
7. Produce a new dated evidence report with distinct Pass/Fail/Blocked/Not Run counts, changed files, original-to-replacement test mapping, remaining risks and deployment status. Any unresolved privacy/authority/financial invariant blocks release. Report remaining manual/timed limits explicitly rather than claiming full acceptance.
8. Only after evidence and UI acceptance: prepare the exact release manifest/order, old-client handling, initial projection dry-run and safe rollback constraints. **Commit, push and deployment require separate explicit authorisation.** No production data repair is bundled into release.
