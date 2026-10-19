# Combined Phase 4–5 plan — Register payments, cash accounting and Cashout

Status: **Implementation approved by owner on 15 October 2026 IST; in progress.** Owner clarifications incorporated. Approval does not authorise commit, push, deployment or historical production repair. See [implementation checkpoint](2026-10-15-register-cashout-implementation.md). Supersedes the initial proposal; its copy is retained as [initial revision](2026-10-15-cash-movement-expenses-cashout-plan-initial.md).

User decisions incorporated:
- Manual vendor payments and ordinary expenses belong in Register.
- Register payments use available counter cash, bank transfer or cheque.
- **Cash Movement stays separate, after Cashout, for staff transfers and bank deposits.**
- Financial posting and adjustments must be server-driven.
- Include missing vendor cash-payment integration with Expenses, drawer and Cashout.
- Replace the Logs Cashout menu with visible View, Edit and Delete icons, preserving role/source restrictions and requiring typed CONFIRM before any edit/delete executes.
- New cheques start Issued; on the cheque date show Presented automatically. Owner confirms whether debit occurred; only a confirmed debit reduces bank book balance.
- Owner confirms the reported 14 October vendor cash payments were already manually deducted during Cashout; no repeat cash deduction is authorised.
- Plan first, incorporate additions, implement after approval, then add/run tests. No new checks, fixtures or test files are added now.

Accepted Batch 1–3 local work remains the baseline. No application code, production data/configuration, dependencies or runtime changes are authorised at this stage. Commit, push and deployment require separate authorisation. Loan mutations remain excluded.

## 1. Source findings and what was missing from the first plan

**Vendor cash integration was not included in the initial implementation scope. It is included in this revision.**

The current [Vendor Workspace](../../../src/features/vendor-workspace/components/VendorLedgerWorkspacePage.tsx) calls browser [createSettlementV2](../../../src/store/vendorLedgerV2Repository.ts). That transaction writes vendor settlement/state, vendor ledger/account, and optional invoice allocation/state. It does not create an Expenses/outflow link or adjust POS handover cash.

Current Expenses/ordinary Cashout outflow reads consume cashouts records. The [POS Cashout summary](../../../src/features/pos/data/posRepository.ts) does not join vendorSettlementsV2 into drawer outflows. Source inspection therefore confirms a missing integration consistent with the report.

The user's individual cash payments of14 October have **not** been reconciled against production records. Owner now confirms these payments were manually deducted during Cashout. Their amounts, IDs and the exact linked closing still require read-only identification. Do not call all historical cash payments drawer-funded, replay a payment, or deduct it from today's drawer.

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
- Cheque expense creates its source and cheque directly as Issued. Actual bank cash movement happens once on confirmed debit; issuing/presenting a cheque is not a completed bank debit.
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

A vendor cheque is pending when issued/presented. Preserve the current source behavior that vendor payable reduces on debit, not merely on issue; do not apply older planning semantics or rewrite historical payable events. Add invoice-linked cheque reservation/allocation if an invoice is selected: reserve once at issue, post allocation once on debit, release on an authorised cancellation/bounce where applicable. This is an explicit new capability, not an already-existing allocation path. Account-level cheques remain supported.

### Simplified cheque interaction — owner clarification

- Saving a new cheque creates Issued directly; no routine Draft, Issue or Present buttons. Reuse existing cheque-book/number/vendor or expense/amount/date fields and permissions.
- On or after its cheque date in IST, show Presented automatically, unless already debited/cancelled/bounced. This is an app date-based stage, not proof of actual bank presentation. The server derives the effective stage from trusted time and materialises it idempotently on an authenticated read/action; the browser cannot advance financial state. No exact-midnight background persistence or scheduler is assumed. Existing stored status consumers need this adapter so they agree.
- Routine owner action is “Did this cheque get debited?” with Yes / Not yet. Yes atomically records the one bank-book debit and relevant expense/vendor/invoice effects. Not yet leaves it unpaid/pending; it neither cancels the cheque nor restores/changes balances. No duplicate debit on retry.
- Remove the numerous routine lifecycle buttons. Retain an owner-only exception path for legitimate cancellation/bounce/correction and legacy source details; these must not become ordinary staff choices or disappear without a safe replacement.
- Keep pending cheque commitments distinct from actual bank balance. Legacy tracking-only cheques remain tracking-only; showing a due stage must never activate an old financial effect.

The linked Expenses/outflow entry is an immutable projection of the canonical vendor payment, created in the same operation, never an independently editable second payment. Vendor payments appear as cash/bank outflows but **not ordinary operating expenses**. Paying an existing stock invoice settles that payable; it is not a second purchase or another operating cost. For example, a ₹1,000 stock invoice followed by its ₹1,000 payment is one ₹1,000 purchase and one settlement, not ₹2,000 of costs. This classification prevents a new duplicate cost; it does not assert that current reports already double-count invoice cost. Current monthly metrics separately track purchases, vendor payments and an estimated sales-margin figure. Do not redesign profit/cost-of-goods recognition in this phase or treat unsold inventory as an automatic operating expense.

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

## 7. Logs Cashout details — visible actions and double protection

- Replace the three-dot menu on Cashout rows and phone cards with always-visible, accessible View (eye), Edit (pencil), and Delete (trash) actions. The old menu is removed once all authorised actions have replacements.
- View opens the existing read-only details popup directly.
- Edit opens the permitted correction workflow. Before the edit/decision is committed, show a separate confirmation popup with an initially blank text box. Require the exact uppercase text CONFIRM and an explicit OK action; never prefill it or execute merely when the text is entered. Closing/cancelling changes nothing.
- Delete first shows the specific record, financial consequences and whether the operation is eligible. A separate initially blank confirmation popup requires exact CONFIRM plus OK before execution. No deletion runs when the icon is clicked.
- Double protection means role/source eligibility and all existing approval requirements, followed by explicit typed confirmation. Typed confirmation never grants permissions, bypasses owner approval, or makes a closed/posted financial source hard-deletable. Where deletion is prohibited, show the action disabled with an explanation; use the existing authorised audited correction/reversal path instead. Preserve history and actor/reason evidence.
- Server validates authorisation, source revision and allowed action when execution occurs. Disable duplicate submission and reuse the same operation receipt/recovery. An edit or delete that requires owner approval stays pending until approved.
- Reuse project dialog conventions, keyboard access, focus restoration, short-screen scrolling and accessible labels/tooltips. No hover-dependent action menu remains.

The reported disappearing menu cause is not yet proven; replacing the menu addresses the interaction path without claiming an unverified root cause. No application changes are authorised until implementation approval.

## 8. Handling the14 October report safely

**Owner clarification: the 14 October cash vendor payments were already manually deducted during Cashout. Treat this as a preservation constraint; do not debit those payments again.**

Include a read-only reconciliation work item to identify the original settlements and the closing where the deduction was entered: settlement/state, vendor/invoice ledger, amount/date/method/actor evidence, outflow link, manual Cash Expense component, physical count and closure. Link visibility to existing settlement evidence only in a separately approved historical correction; do not invent another payment.

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
| Cheques | useChequeDetails.ts; ChequeDetailsModal.tsx; current ChequeRegister logic; domain/vendorLedgerV2.ts | Direct Issued creation, trusted due-date Presented adapter, owner debit Yes/Not yet, bank debit once, exception-only lifecycle controls, general expense cheques and optional invoice allocation. |
| Vendor Workspace | VendorLedgerWorkspacePage.tsx; OpenInvoicesV2.tsx; VendorDirectoryV2.tsx; useVendorLedgerV2.ts | Register deep links instead of duplicate payment/issue forms; preserve balances/invoices/returns/corrections; trusted financial adapters. |
| Cash Movement | CashMovementForm.tsx | Remains separate, post-Cashout held cash; immediate submit guard, original-result recovery and accurate recorder/balances. |
| Cashout | CashoutPage.tsx; DailyCashoutForm.tsx; CashoutCorrectionForm.tsx; CashoutCorrectionPanel.tsx; DailyCashoutDetailsModal.tsx | Trusted paid-out breakdown including vendors, counting lease, server close/corrections/recovery and source-linked details. |
| Logs | DailyCashoutDataTable.tsx; DailyCashoutLogTab.tsx; ResponsiveLogTable.tsx; dropdown-menu.tsx only if root cause requires it; LogDataTables.tsx | Visible View/Edit/Delete icons, no action menu, blank typed-CONFIRM dialogs, existing eligibility/approval controls, payment/expense/funding/source display. |
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

Use the existing regional Node20 Functions backend. Last recorded14 October preflight was Blaze; reconfirm service prerequisites read-only before implementation. No billing change or new scheduled infrastructure is proposed. Automatic cheque due-stage presentation uses trusted date evaluation on access, not a newly assumed scheduled function. Compute/source reads/linked writes/logs add usage; no measured rupee cost is supplied.

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
- The 14 October payments were already manually deducted during Cashout; no repeat cash debit or automatic historical repair.

User additions can change these before approval.

## 12. Delivery order

1. **Now:** review this revised full plan, components, scope expansion and policies. Documentation only; no new checks/tests/fixtures or application changes.
2. **After explicit implementation approval:** implement the unified Register and vendor/expense/cheque posting bridge; separate Cash Movement recovery; trusted Cashout/corrections; connected financial writer/Rules replacement; visible Logs View/Edit/Delete actions with typed confirmation.
3. **After implementation:** add/update and run isolated tests/regression work, preserving original failures and explaining superseded browser-write contracts. Detailed checks/scenarios are deliberately not added to this planning document.
4. Present local UI/evidence for review. Commit, push, deployment and any historical production correction each require their own explicit authorisation.

Helpers remain hidden; no disruptive extra PowerShell/CMD windows.


## 13. Read-only local cash-total inspection — 15 October 2026 IST

User reported net cash sales ₹360, original bills ₹540, Cashout recorded cash ₹540, and system audit/expected drawer ₹1,360. A separately requested worker inspected current demo emulator records read-only, without resetting fixtures, changing application code, or running tests. Three finalized cash bills total 54,000 paise; two completed cash refunds total 18,000 paise; opening counted cash is 100,000 paise. Net collections are 36,000 paise and expected drawer is 136,000 paise. Both refunds have linked expense evidence and owner review did not post another financial effect. No Cashout has been completed. These records reconcile; they do not establish what happened to production vendor payments on 14 October.

Confirmed presentation issue: Cashout initializes payment fields from gross collections but labels cash generically as “Cash Sale Recorded”; its explanatory text calls the displayed totals net. Dashboard displays net sales. System audit/expected drawer lack a visible opening/count reconciliation.

Include in the pending implementation: explicitly label gross collections before refunds, cash refunds, net collections, opening/latest count balance, vendor cash payouts, other cash payouts, and expected drawer. Display the reconciliation opening/count balance + subsequent gross cash collections − cash refunds − vendor cash payouts − other drawer payouts = expected drawer. Use matching period/counter boundaries and source revisions; identify the latest count boundary so earlier payments are not deducted twice. Preserve original bill/receipt values. Show System Audit and Expected Drawer as the same cash basis when they are identical, with distinct labels only where the values represent different calculations. Correct the gross/net explanatory text. This is a proposed UI/accounting presentation change, not an authorization to implement or rewrite records.

Evidence: [records](../../../output/playwright/2026-10-14-refund-batch3/cash-totals-readonly-1792013160828.json) and [findings](../../../output/playwright/2026-10-14-refund-batch3/cash-totals-findings-1792013232340.json). Scope remains planning only pending approval.
