# Combined Phase 4–5 plan — Register payments, cash accounting and Cashout

Status: **Revised proposal for review; not approved or implemented.** Updated 15 October 2026. Supersedes the initial proposal; its copy is retained as [initial revision](2026-10-15-cash-movement-expenses-cashout-plan-initial.md).

User decisions incorporated:
- Manual vendor payments and ordinary expenses belong in Register.
- Register payments use available counter cash, bank transfer or cheque.
- **Cash Movement stays separate, after Cashout, for staff transfers and bank deposits.**
- Financial posting and adjustments must be server-driven.
- Include missing vendor cash-payment integration with Expenses, drawer and Cashout.
- Include the Logs Cashout menu that disappears while moving the cursor.
- Plan first, incorporate additions, implement after approval, then add/run tests. No new checks, fixtures or test files are added now.

Accepted Batch 1–3 local work remains the baseline. No application code, production data/configuration, dependencies or runtime changes are authorised at this stage. Commit, push and deployment require separate authorisation. Loan mutations remain excluded.

## 1. Source findings and what was missing from the first plan

**Vendor cash integration was not included in the initial implementation scope. It is included in this revision.**

The current [Vendor Workspace](../../../src/features/vendor-workspace/components/VendorLedgerWorkspacePage.tsx) calls browser [createSettlementV2](../../../src/store/vendorLedgerV2Repository.ts). That transaction writes vendor settlement/state, vendor ledger/account, and optional invoice allocation/state. It does not create an Expenses/outflow link or adjust POS handover cash.

Current Expenses/ordinary Cashout outflow reads consume cashouts records. The [POS Cashout summary](../../../src/features/pos/data/posRepository.ts) does not join vendorSettlementsV2 into drawer outflows. Source inspection therefore confirms a missing integration consistent with the report.

The user's individual cash payments of14 October have **not** been reconciled against production records. Their amounts, IDs, funding and any later physical counts/closures are not yet confirmed. Do not call all historical cash payments drawer-funded, replay a payment, or deduct it from today's drawer.

**Logs behavior:** the user reports the Cashout action disappears as the cursor moves toward it. [DailyCashoutDataTable](../../../src/features/logs/components/DailyCashoutDataTable.tsx) uses a click-controlled Radix menu; [dropdown-menu](../../../src/shared/ui/dropdown-menu.tsx) portals its content. No explicit hover-leave dismissal was found. Exact runtime cause remains to be determined after approval: inspect cell/menu remounts during updates, open-state identity, focus/outside dismissal and layering. Do not present a guessed hover handler as the confirmed cause.

Register currently mounts only ExpenseForm. A unified payment entry/history and Register-based vendor payment/cheque issue are proposed capabilities, not existing screens. General expense cheque tracking is currently not the same implemented lifecycle as new V2 vendor cheques. Invoice-linked vendor cheque issue is also not supported by current CreateVendorChequeV2Input.

## 2. Final navigation and Register layout

### Register: create manual outgoing payments

Keep the Register menu, with a compact Payments & Expenses workspace:
- New Payment.
- Payment History.
- Cheques, visible/operable according to existing cheque permissions.

New Payment selects:
1. Ordinary expense.
2. Vendor payment.

Common fields: recipient/vendor, amount, payment method, notes, displayed actor/date and one confirmation/posting state. Category applies to an ordinary expense. Vendor/invoice allocation applies to a vendor payment. Cash amount availability is displayed before posting.

Payment methods:
- **Counter Cash:** actual current shared POS drawer. No new staff-held-cash expense option is added by default.
- **Bank Transfer:** recorded company bank outflow. Preserve existing supported electronic payment channels in the underlying records; any UPI/card choice is labelled as bank-funded, not counter cash.
- **Cheque:** record/issue through the configured cheque book and track status; no counter cash deduction.

Vendor Workspace remains for vendor directory, invoices, balances, returns and source details. Its Pay/Record Payment buttons navigate to Register with vendor/invoice preselected. Remove its duplicate payment-entry and cheque-issue forms only after the Register replacements exist. Existing payment/source links remain available.

Cash Movement remains a separate menu for held cash after Cashout. Bank deposits and staff transfers stay there. It receives the stable-intent/recovery/server fixes but is not moved into Register.

POS billing and bill-linked returns keep their accepted Batch 1/3 screens. Their automatic refund outflows appear in Register history and Logs with the original bill link; a second manual refund/expense must not be posted from Register.

## 3. Phase 4 — unified Register and trusted payment posting

### Shared application/service design

Reuse existing form fields, validation concepts and business contracts. Share recipient/payment controls, busy state, operation receipts, recovery and source details. Keep specialised financial posting modules for expenses, vendor settlements, cheques and transfers.

A small set of callable APIs can dispatch explicit operation types to those modules, instead of a function per button. Example boundaries: post a Register payment; manage a payment/cheque decision; prepare/post/manage Cashout. Existing trusted checkout/refund/stock endpoints remain. This reduces duplicated wiring; it does not remove necessary financial rules or promise a particular final function count.

Only permitted intent goes from browser to server. Server derives authenticated UID/name/role, source records, balances, permissions, dates and calculated effects. Money is validated/calculated in integer paise; legacy rupee-facing fields retain their meaning.

One operation ID is bound to the actor and normalized intent. Same intent recovers its original source/result after refresh or lost acknowledgement; changed intent/actor rejects. Persist before dispatch, disable duplicate submission immediately and retain uncertain operations. No browser posting fallback.

### Ordinary expenses

- Staff cash/bank expenses post immediately under existing entry permissions; proposed owner review is informational, with no financial reapplication.
- Validate category, recipient, money, method, notes and cheque data on the server; reject forged recorder/approval fields and invalid/negative amounts. Preserve currently permitted zero expense policy unless changed before approval.
- Counter-cash expense requires available cash, open counter, membership and no live count lock. Atomically post its source and drawer debit; record counter reference/revision and required cashier logout-count effect.
- Bank transfer expense creates one bank-funded expense/book debit and does not touch POS cash.
- Cheque expense creates the source plus its scheduled/issued cheque evidence. Actual bank cash movement happens once on confirmed debit; a scheduled cheque is not labelled a completed cash/bank transfer.
- General expense cheque lifecycle is a proposed addition: reuse cheque book/status contracts while separating expense/vendor effects. Preserve existing lifecycle permissions; do not silently grant billing users owner-only cheque issue/debit powers.
- Automatic POS Refund entries remain exclusively owned by the return handler.
- New ordinary expense cancellation is proposed as an owner-authorised audited reversal, preserving original source evidence. Restore recorded cash only where the original effect and appropriate correction/refund action are proven. No invented restoration for historical unknown funding.

### Vendor payments — missing bridge included

For a valid counter-cash vendor payment, one trusted transaction must:
1. Derive actor and validate vendor, payable, optional invoice allocation, amount and source revisions.
2. Validate actual drawer availability, membership and count lock.
3. Post the settlement and permitted vendor/invoice effects.
4. Record one source-linked vendor-payment cash outflow visible in Register/Expenses and Logs.
5. Debit the shared drawer once, advance source/control revisions and record required cashier count evidence.
6. Persist the recoverable operation result.

If any component fails, none posts. A custom vendor-account payment remains supported within the current payable rules; it does not silently allocate to an invented invoice or enable unapproved advances/overpayment.

A vendor Bank Transfer uses the same vendor/invoice posting and recorded bank effect, leaving POS cash unchanged.

A vendor cheque is pending when issued/presented. Preserve the existing principle that vendor payable reduces on debit, not merely on issue. Add invoice-linked cheque reservation/allocation if an invoice is selected: reserve once at issue, post allocation once on debit, release on cancellation/bounce as applicable. This is an explicit new capability, not an already-existing allocation path. Account-level cheques remain supported.

The linked Expenses/outflow entry is an immutable projection of the canonical vendor payment, created in the same operation, never an independently editable second payment. Vendor payments appear as cash/bank outflows but **not ordinary operating expenses**. A payable settlement must not count purchase cost twice in profit/cost reporting.

### Connected vendor writer replacements

Cash balances cannot rely on a protected payment while another browser writer can fabricate its payable/allocation/correction. Extend the trusted boundary to all active writers that change the same vendor financial state:
- Vendor creation with permitted opening payable.
- New non-GRN invoice/purchase posting if actually mounted; otherwise retire the dormant unsafe writer rather than advertise a new invoice-entry feature.
- Settlement corrections, staff request/reject/withdraw decisions.
- Vendor return creation/resolution where it affects credit/payable.
- Cheque creation and issue/present/debit/cancel/bounce.
- Shared vendor account/ledger/invoice/allocation effects.

Reuse the Batch 2 trusted GRN submission/reversal and their vendor links. Vendor stock-return inventory effects remain their existing documented workflow; do not add direct quantity overwrite. Preserve all existing role/approval restrictions.

No legacy activation/import or financial reclassification is executed. Dormant migration writers require a separately approved trusted migration, not an unsafe retained bypass.

## 4. Phase 4 — separate Cash Movement improvements

Cashout assigns counted cash to the recorded holder. Cash Movement then transfers that held cash to bank/CDM or another staff holder.

- Keep the existing screen and sender restrictions; billing may move only its own held cash.
- Use one stable intent rather than a fresh ID for each submit/retry.
- Server checks recorded availability, role and destination, then posts once under shared cash-control serialization.
- Recover original record/time after lost response. Changed actor/payload rejects.
- Transfers/deposits do not reduce POS drawer cash again or change sales/operating expenses.
- Keep records immutable and existing deliberate reverse-transfer behavior.
- Old records without verified recorder/intent metadata remain honest legacy evidence; no fabricated actor binding.

## 5. Phase 5 — trusted Cashout and reconciliation

Keep the two-step Cashout/counting interface, with server-derived components:
- Gross POS cash/UPI/card and supported electronic methods.
- Cash refunds.
- Ordinary counter-cash expenses.
- Counter-cash vendor payments.
- Other explicitly supported source-backed drawer effects.
- Expected drawer cash and physical denomination count.
- Counted cash assigned to its recorded holder.

Show bank-funded payments and cheque obligations in their appropriate bank/cheque breakdown, not as counter cash expenses. Retain declared non-POS credit sales as a separately labelled input with authenticated recorder evidence.

Replace editable aggregate Cash Expense on new closings with source-linked **Cash Paid Out** breakdown. Missing expenses/vendor payments are entered in Register rather than silently changing a closing total.

Use a dedicated server-created Cashout counting reservation, extending current shared five-minute lease types/status display. Billing, returns and new drawer outflows pause during live counting; existing login/logout/count workflows remain intact. Expiry/cancellation requires current authorised token; expired/stale counts need a fresh count.

Server independently validates role, trusted IST time/day, membership, source/control revisions and count. Atomically post Daily Cashout, closure, relevant sales effects, holder snapshot/assignment, closed/reset counter, control revision and recoverable result. Do not duplicate the assignment as a transfer.

Default permission/timing policy:
- Owner can close outside the staff window.
- Staff/manager Cashout remains23:55–00:20 IST unless changed before approval.
- Matched/short/excess is derived consistently.
- Proposed nonzero discrepancy reason is mandatory; an authorised close posts without waiting for owner approval and creates informational owner review.
- Current staff own-record correction eligibility is seven calendar days; current owner decision and staff request/withdraw restrictions remain.

Corrections move server-side with source revision, before/after evidence, reason and stable intent. Preserve original POS bills/refunds; change only authorised effective declarations/counts and their proper accounting effects. Never reopen/replay an old closure or remove drawer cash again. Reject stale decisions and unsupported negative held-cash consequences; preserve legitimate legacy correction behavior through an explicit source/basis adapter.

## 6. One accounting effect, consistent views

Expected drawer =
counted opening/checkpoint + subsequent cash sales − cash refunds − ordinary drawer expenses − vendor drawer payments ± authorised drawer corrections.

All postings after that checkpoint/window are source-bound. Refund/vendor/expense display projections are not subtracted a second time. Holder assignment occurs once on closing; post-close transfers act on held cash only.

Bank figures are recorded bookkeeping, not a bank integration or live statement verification. Bank transfers/deposits and debited cheques update the book once; pending cheques remain scheduled commitments. Define an owner-confirmed bank baseline/version boundary before activation; do not replay old payments against an already-current bank amount. Changes to the financial bank baseline must use an owner-authenticated audited server operation; unrelated settings remain outside this work.

Register history and Logs display all relevant source kinds with date/time, business date, method, vendor/payee, category/type, amount, funding source, actor, status and source reference. Cash Movement entries stay created in Cash Movement and visible in Logs; Register may show a read-only related link, not a second posting.

Reuse canonical records plus strictly linked projections where existing consumers require them. No second independent financial ledger. Preserve existing collection paths, historical record values and sandbox boundaries. Legacy unavailable funding/actor fields say Not recorded.

Illustration, not a test fixture: opening₹1,000 + cash sales₹500 − cash refund₹90 − ordinary drawer expense₹50 − vendor cash payment₹200 = expected drawer₹1,160. Matched Cashout assigns₹1,160 to its holder. A subsequent₹300 bank deposit in Cash Movement leaves held cash₹860. Each effect occurs once.

## 7. Logs Cashout details — explicit UI fix

- Add an always-visible eye/View action on Cashout rows and phone cards. Viewing must not depend on hover or reaching a floating menu.
- Open the existing Cashout details popup read-only.
- Keep authorised Edit/other actions in a click-controlled menu whose state stays stable while the cursor moves or subscriptions update the table.
- Inspect/remedy remount identity, stable callbacks, portal layering and focus/outside-dismissal behavior; do not guess that CSS alone is the cause.
- Reuse project dialog conventions, keyboard access, Escape/close focus restoration and short-screen scrolling with accessible footer actions.
- Do not grant staff new Logs/edit/delete permissions or make closed Cashouts deletable.

This issue is reported by the user and supported by source inspection of its entry path; runtime reproduction/root-cause confirmation is deferred until approved implementation.

## 8. Handling the14 October report safely

Include a read-only reconciliation work item for the reported payments: identify settlement/state, vendor/invoice ledger, amount/date/method/actor evidence, any outflow link, drawer counts/closures and original cash source.

Distinguish:
- Missing display/projection only.
- Missing drawer/bank bookkeeping effect.
- Cashout physical count already reflecting the real payment.
- Missing or ambiguous historical funding.

Produce a concrete report/proposed correction tied to the original IDs. Do not resubmit the vendor settlement, debit today's drawer for old cash already paid, recompute saved Cashouts automatically, or fabricate old funding/actor metadata.

Any production historical repair requires separate explicit approval of that concrete correction. This implementation proposal fixes new posting and prepares the historical report; it does not authorise repair of14 October records. If corrected visibility is later approved, link to the original payment and mark historical provenance/cash-effect status honestly.

## 9. Components and files expected to change

| Area | Components/files | Change |
|---|---|---|
| Register | RegisterPage.tsx; ExpenseForm.tsx; VendorSettlementFormV2.tsx; shared payment controls/history/recovery component | One manual expense/vendor payment entry, counter/bank/cheque methods, source-linked history and summary cards. |
| Cheques | useChequeDetails.ts; ChequeDetailsModal.tsx; current ChequeRegister logic; domain/vendorLedgerV2.ts | Register issue flow, general expense cheque support, optional invoice reservation/allocation, protected lifecycle and source evidence. |
| Vendor Workspace | VendorLedgerWorkspacePage.tsx; OpenInvoicesV2.tsx; VendorDirectoryV2.tsx; useVendorLedgerV2.ts | Register deep links instead of duplicate payment/issue forms; preserve balances/invoices/returns/corrections; trusted financial adapters. |
| Cash Movement | CashMovementForm.tsx | Remains separate, post-Cashout held cash; immediate submit guard, original-result recovery and accurate recorder/balances. |
| Cashout | CashoutPage.tsx; DailyCashoutForm.tsx; CashoutCorrectionForm.tsx; CashoutCorrectionPanel.tsx; DailyCashoutDetailsModal.tsx | Trusted paid-out breakdown including vendors, counting lease, server close/corrections/recovery and source-linked details. |
| Logs | DailyCashoutDataTable.tsx; DailyCashoutLogTab.tsx; ResponsiveLogTable.tsx; dropdown-menu.tsx only if root cause requires it; LogDataTables.tsx | Persistent eye/View action, stable menu, payment/expense/funding/source display. |
| Action Centre | ActionCenterPage.tsx; ActionCentreDetailsPanel.tsx; source/entry/approval hooks and focused details | Informational posted payment/expense/discrepancy review; existing correction/return/price approvals retained. |
| Finance calculations | deriveCashMetrics.ts; deriveWorkspaceMetrics.ts; relevant vendor/monthly/dashboard consumers; cashoutCorrections.ts; cashoutSales.ts; refundAccounting.ts | Vendor outflow classification, single debit, bank/cheque/holder consistency; vendor payments/refunds excluded from ordinary operating-cost duplication. |
| Client/service adapters | App.tsx; AppWorkspace.tsx; appStore.ts; createFinanceActions.ts; createCashoutCorrectionActions.ts; vendorLedgerV2Repository.ts; focused trusted payment/cashout adapters | Callable intent routing, Register navigation context, no browser financial posting fallback. |
| Counter | cashierHandover.ts; cashierHandoverRepository.ts; counter status display | Explicit Cashout reservation purpose/status and safe release; preserve accepted billing/refund/count behavior. |
| Server | index.js; cashBalance.js; modular Register/vendor/expense/cheque/Cashout/correction handlers | Authenticated source-backed posting, atomic financial effects, actor/intent binding and recovery; bank baseline authority. |
| Types/security/data loading | appTypes.ts; financeTypes.ts; vendorLedgerV2.ts; firestore.rules; firestore.indexes.json if required; scoped finance/vendor source hooks | Additive source/amount/revision metadata; cut over every overlapping writer; bounded pages/active-owner feeds and point-loaded details. |
| Settings, financial field only | Existing bank-balance setting adapter/audit and its server owner command, if that setting controls the baseline | No direct browser mutation of the financial bank baseline. General settings/announcements remain outside scope. |

Expected touchpoints are not permission for unrelated refactoring. Loan mutations, broad settings/navigation redesign, stock workspace changes and dependency/runtime upgrades remain excluded.

## 10. Rules cutover, compatibility and cost

Deny equivalent client writes only after every legitimate financial writer has a trusted replacement: ordinary expenses, vendor settlements/states/ledger/invoice allocations and relevant opening/return/cheque writers, Cashout/sales/control/closure transitions and correction/review decisions. Inspect overlapping Rules and dormant import/manual writers. Preserve existing roles, read access, GRN links, count/join/release operations and Batch 1–3 protections. No unsafe old-client fallback; show explicit reload/recovery behavior.

Keep existing rupee/paise external contracts and immutable source IDs. Cash vendor payment linked outflow is not an ordinary operating-cost expense; cheque issue is not a completed debit; correction is not payment again. Legacy cheques marked tracking-only stay tracking-only.

Server balance reconstruction may still need historical source reads. Use real bounded cursor pages and shared revision/control coordination; page limits do not guarantee low total reads. No balance-opening migration, app-wide listener rewrite or measured read savings are claimed.

Use the existing regional Node20 Functions backend. Last recorded14 October preflight was Blaze; reconfirm service prerequisites read-only before implementation. No billing change or new scheduled infrastructure is proposed. Compute/source reads/linked writes/logs add usage; no measured rupee cost is supplied.

## 11. Policy defaults and remaining additions

Confirmed: Register for ordinary/vendor outgoing payments; Cash Movement separate after Cashout; server-driven posting; linked cash vendor effects and Logs View fix included.

Proposed defaults:
- Active staff permitted cash/bank payments post immediately with owner informational review; existing correction approvals remain.
- Register Cash payments use counter cash, not staff-held cash; held cash is handled in Cash Movement.
- Cheque lifecycle permissions remain as currently authorised. Any broader staff issue/debit permission needs an explicit role decision.
- Bank transfer is recorded bookkeeping, not execution through a bank API.
- Staff Cashout time window and seven-day own-record correction policy stay unchanged.
- Nonzero closing discrepancy needs a reason and owner notification, without waiting for an approval.
- New ordinary-expense cancellation is audited and owner-controlled; protected vendor/refund outflows are corrected through their own source workflow.
- Loans remain excluded. POS billing/returns remain in their accepted bill-context flow.
- No automatic14 October historical cash repair.

User additions can change these before approval.

## 12. Delivery order

1. **Now:** review this revised full plan, components, scope expansion and policies. Documentation only; no new checks/tests/fixtures or application changes.
2. **After explicit implementation approval:** implement the unified Register and vendor/expense/cheque posting bridge; separate Cash Movement recovery; trusted Cashout/corrections; connected financial writer/Rules replacement; persistent Logs View/menu behavior.
3. **After implementation:** add/update and run isolated tests/regression work, preserving original failures and explaining superseded browser-write contracts. Detailed checks/scenarios are deliberately not added to this planning document.
4. Present local UI/evidence for review. Commit, push, deployment and any historical production correction each require their own explicit authorisation.

Helpers remain hidden; no disruptive extra PowerShell/CMD windows.


## 13. Read-only local cash-total inspection — 15 October 2026 IST

User reported net cash sales ₹360, original bills ₹540, Cashout recorded cash ₹540, and system audit/expected drawer ₹1,360. A separately requested worker inspected current demo emulator records read-only, without resetting fixtures, changing application code, or running tests. Three finalized cash bills total 54,000 paise; two completed cash refunds total 18,000 paise; opening counted cash is 100,000 paise. Net collections are 36,000 paise and expected drawer is 136,000 paise. Both refunds have linked expense evidence and owner review did not post another financial effect. No Cashout has been completed. These records reconcile; they do not establish what happened to production vendor payments on 14 October.

Confirmed presentation issue: Cashout initializes payment fields from gross collections but labels cash generically as “Cash Sale Recorded”; its explanatory text calls the displayed totals net. Dashboard displays net sales. System audit/expected drawer lack a visible opening/count reconciliation.

Include in the pending implementation: explicitly label gross collections before refunds, cash refunds, net collections, opening/latest count balance, vendor cash payouts, other cash payouts, and expected drawer. Display the reconciliation opening/count balance + subsequent gross cash collections − cash refunds − vendor cash payouts − other drawer payouts = expected drawer. Use matching period/counter boundaries and source revisions; identify the latest count boundary so earlier payments are not deducted twice. Preserve original bill/receipt values. Show System Audit and Expected Drawer as the same cash basis when they are identical, with distinct labels only where the values represent different calculations. Correct the gross/net explanatory text. This is a proposed UI/accounting presentation change, not an authorization to implement or rewrite records.

Evidence: [records](../../../output/playwright/2026-10-14-refund-batch3/cash-totals-readonly-1792013160828.json) and [findings](../../../output/playwright/2026-10-14-refund-batch3/cash-totals-findings-1792013232340.json). Scope remains planning only pending approval.
