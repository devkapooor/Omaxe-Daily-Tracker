# Combined Phase 4–5 plan: Cash Movement, Expenses and Cashout

Status: **Proposed for user review. Not approved or implemented.** Prepared 15 October 2026 from the current working tree. This document proposes application changes; it does not authorise them.

User instruction: combine both phases in one plan, identify affected components so additions can be discussed, implement only after approval, and run tests afterwards. **No new checks, test scenarios, fixtures or test files are being added during planning. No tests are run for this proposal.**

The accepted local Batch 1–3 implementation remains the baseline. Preserve all unrelated working changes. Commit, push, deployment, dependency/runtime upgrades, production configuration changes and production mutations remain outside this approval.

References: [original remediation findings](2026-10-13-remediation-plan.md), [accepted Batch 3 checkpoint](2026-10-14-refund-batch3.md). Git baseline remains main/be3654c, application v1.5.2, with the existing uncommitted remediation work. No applicable root/ancestor or docs AGENTS.md was found during this planning pass.

## 1. Outcome and scope

One coherent cash workflow:

1. Staff record an expense against its actual funding source.
2. The server posts the expense and the corresponding cash effect once.
3. Cashout independently derives the drawer position and records the physical count.
4. Counted cash becomes held cash for the existing recorded holder.
5. Cash Movement transfers that held cash to another staff member or bank once.
6. Owner review and permitted corrections retain traceable source evidence.

Phase 4 closes AH-FIN-03 duplicate Cash Movement and AH-SEC-05 unsafe expense creation, with recorder attribution from AH-GAP-01. Phase 5 finishes the remaining Cashout reconciliation work in AH-FIN-02 and replaces its browser posting/correction authority within this scoped workflow. This targeted Cashout server replacement is an explicit part of this proposal, rather than a claim that the entire finance application becomes trusted.

AH-FIN-04 new stock-audit IST dates were already addressed in Batch 2. Batch 3 already introduced gross/net refund accounting, protected refund expenses and refund-aware Cashout evidence. Reuse those changes; do not redo them or alter historical values.

No vendor invoice/allocation/return/cheque migration, loan mutation, app-wide subscription rewrite, global bank-setting redesign, retrospective cleanup or independent replacement financial ledger is included.

## 2. Current source findings

| Existing component or writer | Current behavior relevant to this plan |
|---|---|
| [CashMovementForm](../../../src/features/cash-movement/components/CashMovementForm.tsx) | Keeps existing person/bank/CDM choices and sender restrictions, but has no immediate submit lock or persistent intent. |
| [saveCashTransfer](../../../src/store/actions/createFinanceActions.ts) | Creates a new operation ID on every invocation, so one double-click can become two legitimate server requests. |
| [createCashTransfer](../../../functions/index.js), [cashBalance](../../../functions/cashBalance.js) | Already server-posted with shared control serialization. An existing ID returns without actor/intent comparison, and the outer response uses a new timestamp. Balances are reconstructed from Cashouts and transfers; ordinary cash expenses are not attributed to a holder. |
| [ExpenseForm](../../../src/features/register/components/ExpenseForm.tsx), saveCashout | Browser creates an ordinary cashouts document, supplies approvedBy text and does not record a cash funding source. Billing entries say Pending approval even though money is already posted and no expense approval queue exists. paidTo currently comes from category; there is no separate payee input in this form. |
| [DailyCashoutForm](../../../src/features/cashout/components/DailyCashoutForm.tsx) | Refund-aware POS components exist, but Cash Expense and Credit Sale remain editable. Browser supplies a financial snapshot and physical count. |
| saveDailyCashoutEntry, [cashout correction actions](../../../src/store/actions/createCashoutCorrectionActions.ts) | Closing, holder snapshots, sales sync and correction decisions remain browser-owned. Staff request their own corrections within seven calendar days; owners apply/approve corrections. |
| [Rules](../../../firestore.rules) | Transfers are already denied to clients. Ordinary expenses, sales, daily Cashouts, correction requests and linked control transitions still have client write branches. Shared-counter close also has an existing client transition. |
| [Cashout time window](../../../src/features/cashout/domain/cashoutWindow.ts) | Staff access is 23:55–00:20 IST; owner is not restricted by that window. Current Rules also apply that window to staff correction submission/withdrawal. Preserve by default. |
| derivePendingCash, deriveWorkspaceMetrics, Logs | Holder balances, expense totals and saved Cashout views consume different sources. A drawer refund must not also reduce a staff holder's cash, and a new ordinary drawer expense must not be deducted again at closing. |

These are source/discovery findings. No new reproduction or passing result is claimed here.

## 3. Phase 4 — Cash Movement and ordinary Expenses

### Cash Movement

- Preserve the current From, To, bank/CDM, Amount and Notes flow.
- Acquire an immediate submit guard; show Saving while posting.
- Create one stable intent ID before dispatch. Persist the actor and original intent for retry/refresh/recovery.
- Reuse the existing server endpoint with a stricter contract: authenticated recorder UID/name/role, valid permitted sender/destination, integer-paise money, sufficient recorded held cash and canonical source state.
- Billing can transfer only its own held cash. Manager/owner retain their existing permitted sender selection. No drawer-to-person withdrawal option is silently added to this form.
- Bind a new operation to actor and normalized intent. Same actor/intent recovers the original record and timestamp; changed actor/payload rejects. A recovered committed result must not require the old balance to still be available.
- A genuinely new transfer receives a new ID. A lost acknowledgement never creates a replacement transfer automatically.
- For old transfers without immutable recorder metadata, do not guess actor identity or manufacture new replay metadata. Explain unavailable recovery evidence and preserve the original record.
- Cash Movement records remain immutable; reversal is a separately deliberate transfer, as the existing UI already requires.

### Ordinary Expenses

- Replace browser posting with authenticated server posting.
- Keep category, payment mode, notes and cheque details. Propose two-decimal input; retain the current nonnegative policy, including zero, unless the user changes it.
- Validate money, category/payment mode, field lengths, cheque details, role and date on the server. Do not trust supplied approvedBy or recorder fields.
- New records retain existing rupee amount fields for compatibility, with explicit additive paise/actor/revision/source metadata. Never reinterpret an old rupee amount as paise.
- Proposed ordinary-expense policy: **all active staff post immediately; owner receives an informational review item.** Mark Reviewed records acknowledgement and cannot reapply or undo money. Replace misleading Pending approval labels on new records.
- For Cash, add **Paid from: POS shared drawer / staff-held cash**. Billing may use a joined drawer or its own held cash; manager/owner may select an authorised holder. The server enforces the source permission and available recorded cash.
- Drawer-funded cash expense: post the expense and drawer debit atomically; bind counter/source references, advance the ledger revision and preserve count locks. Mark the handling staff as needing the normal logout count.
- Holder-funded expense: post the expense and holder debit once under the same cash control used by transfers/closings. It does not change POS drawer cash.
- Bank/cheque entries retain their recorded bookkeeping semantics; they do not become POS cash outflows. This application does not execute a bank payment or certify a live bank balance. No new cheque-clearing lifecycle is implied.
- Keep automatic POS Refund expenses exclusively owned by the Batch 3 return handler. Ordinary expense actions cannot create, edit, cancel or review them as ordinary expenses.
- Proposed replacement for deleting a new expense: owner-only audited cancellation, retaining the original source and recording the authorised reversal/correction separately. Automatic restoration requires a proven original funding effect. Historical unknown funding must not produce an invented cash credit. This is a visible policy change requiring approval, not an already-existing cancellation feature.
- A new general expense-edit form or real payee field is optional; neither currently exists in ExpenseForm. Add them to scope only if requested before approval.

## 4. Phase 5 — trusted Cashout and corrections

### New Cashout

Keep the existing two-step screen and denomination layout, with these changes:

- Load a trusted server summary for the selected counter/business day and closing window.
- Show POS cash/UPI/card, returns, source-linked expenses and expected drawer cash as derived values. Retain manual credit sales as a clearly labelled **declared, non-POS component**, with recorder evidence; do not represent it as independently verified POS revenue.
- Replace free Cash Expense adjustments on new closings with actual source-linked expense records. Users record a missing expense in Register instead of silently altering the Cashout total.
- Physical denomination counts and paise change remain entered by staff. The server calculates the counted total.
- Use a dedicated server-created Cashout counting reservation before physical counting. Reuse the current five-minute shared-counter lease model and explicitly extend its purpose/types/UI for Cashout. Checkout/refund operations already block live reservations irrespective of kind; preserve those restrictions and existing login/logout workflows.
- Cancel releases only the authorised reservation. Expiry requires a fresh count. An uncertain committed close is recovered by its original operation ID, not resubmitted as a new closing.
- Server checks current membership, trusted IST time, permitted closing day, count token, source/control revisions and all canonical financial components.
- Atomically post Daily Cashout, drawer closure, day sales effects, holder snapshot/assignment, counter reset/closure, control revision and recoverable result.
- Closing removes counted cash from the shared drawer and assigns it to the existing recorded holder once. It does not also create a duplicate cash transfer.
- Preserve owner availability and staff 23:55–00:20 IST availability unless the user requests a change.
- Proposed discrepancy policy: show matched/short/excess, require a reason when nonzero, allow an authorised staff close immediately and notify the owner afterward. Review acknowledgement has no financial effect and does not block the next day's operation.

### Corrections

- Preserve owner direct correction, staff own-record requests, owner approval/rejection and staff withdrawal.
- Preserve seven-calendar-day staff eligibility and the current staff time window. These are separate from the proposed informational expense/discrepancy review.
- Move request creation/decisions and financial corrections behind trusted endpoints with real actor, source revision and a stable operation ID.
- Preserve immutable POS bill/refund sources. Derived POS values cannot be silently overwritten; legitimate non-POS declarations and count corrections require explicit before/after evidence and reason.
- Apply the authorised effect to the Cashout, relevant sales/holder accounting and audit record atomically. Never replay an old drawer closure, reopen its counter or remove physical cash again.
- Reject a stale decision. A correction that would spend already-transferred holder cash cannot silently create an unsupported negative balance; it needs an explicit resolution.
- Historical Cashouts retain their recorded basis. Existing legitimate corrections remain available through a documented legacy adapter and before/after evidence; no bulk recalculation or guessed funding attribution.
- New drawer-closing Cashouts remain undeletable, as they are today. Inventory and preserve any permitted legacy deletion through a source-backed audited server path; do not blanket-deny it without a replacement or an explicit reviewed restriction.

## 5. Cash accounting shared by both phases

New expense funding distinguishes the POS drawer, held cash and noncash bookkeeping. Every source has one recorded financial effect.

- Drawer expectation uses the counted opening/checkpoint, subsequent cash sales, cash refunds and proven drawer outflows.
- Batch 3 refunds are already in the ledger; their visible expense must not subtract them a second time.
- A new ledger-applied drawer expense is also excluded from any second subtraction in the closing formula.
- A holder-funded expense reduces that holder's cash only and remains an operating expense in reports.
- POS refunds remain excluded from operating expenses while visible as cash outflows.
- A transfer from holder to bank reduces held cash and increases the recorded bank-deposit total; it does not change sales.
- Keep existing collection paths and sandbox boundaries. Stable operation receipts are control metadata, not a second independent ledger.

Illustration of the proposed behavior, not a test fixture: opening drawer ₹1,000 + cash sales ₹500 − cash refund ₹90 − drawer expense ₹50 = expected drawer ₹1,360. A matched Cashout assigns ₹1,360 to its holder. A subsequent ₹300 bank deposit leaves that holder ₹1,060. The refund and expense are each counted once.

Legacy records lack funding metadata. Do not infer it from the recorder's name, date or category. Define a source-backed activation boundary using the existing trusted drawer count; pre-boundary expenses are not replayed into the new ledger. Preserve and label historical recorded accounting. Any unresolved expense in a mixed transition window is shown explicitly and requires a reviewed source/baseline decision, rather than inventing a debit/credit or rewriting history.

Vendor payments remain in Vendor Workspace. Existing vendor balances/allocations continue unchanged. No blanket assumption assigns every cash vendor payment to the POS drawer. If drawer-funded vendor payments are required, their trusted funding/posting operation must be added explicitly to this plan before approval; an unprotected vendor write cannot be treated as proof of a trusted drawer debit.

## 6. Components and files expected to change

| Area | Expected files/components | Visible or architectural change |
|---|---|---|
| Cash Movement | CashMovementForm.tsx | Save state, one intent, recovery, real recorder and clearer held-cash balance. |
| Expense entry | ExpenseForm.tsx; useChequeDetails.ts; ChequeDetailsModal.tsx | Paid-from choice for cash, posting/recovery state, truthful review status, cheque validation/cancel behavior. Reuse accessible project dialog conventions for this affected popup. |
| Cashout entry | CashoutPage.tsx; DailyCashoutForm.tsx | Trusted summary, source-linked outflow breakdown, server counting reservation, reason for discrepancy, recovery. |
| Cashout details/corrections | DailyCashoutDetailsModal.tsx; CashoutCorrectionForm.tsx; CashoutCorrectionPanel.tsx | Original/effective values, funding/source evidence, permitted editable declarations/counts, trusted correction decisions and usable responsive dialogs. |
| Action Centre | ActionCenterPage.tsx; ActionCentreDetailsPanel.tsx; actionCentreEntries.ts; approvalItems.ts; useActionCentreSources.ts; focused expense/discrepancy detail component if needed | Proposed informational expense/discrepancy items; preserve existing Cashout correction approvals, price review and return review. |
| Logs | LogDataTables.tsx; DailyCashoutDataTable.tsx; DailyCashoutLogTab.tsx | Recorder UID/name, source, review/cancellation/correction evidence and closing basis; existing source views reused. |
| App/store adapters | App.tsx; AppWorkspace.tsx; appStore.ts; createFinanceActions.ts; createCashoutCorrectionActions.ts; affected action types | Replace financial browser writes with callable adapters and stable intent contracts. Remove old writer/fallback paths only after replacements exist. |
| Financial calculations/types | appTypes.ts; financeTypes.ts; cashoutCorrections.ts; cashoutSales.ts; deriveCashMetrics.ts; deriveWorkspaceMetrics.ts; relevant monthly/dashboard consumers | Funding classification, paise-safe calculations, holder/closing/operating-expense compatibility. No unrelated dashboard redesign. |
| Shared counter | cashierHandover.ts; cashierHandoverRepository.ts; affected counter status display | Add explicit Cashout reservation purpose and safe release/status handling. Preserve mandatory login/logout counts and existing trusted checkout/refund/stock behavior. |
| Server | index.js; cashBalance.js; focused new cash-transfer, expense, Cashout and correction handlers/policy modules | Identity/intent binding, trusted source calculations, atomic effects, current permissions and original-result recovery. Reuse existing Node20 Functions backend. |
| Client finance service | Focused financeRepository/recovery helper and boundary, names finalised during implementation | Persist one unresolved financial intent per applicable actor/workflow; visible recover action; no production fallback. |
| Rules/indexes | firestore.rules; firestore.indexes.json if a new feed/query requires one | Deny equivalent financial writes only after every legitimate writer is replaced. Scope compound indexes to actual new queries/feeds. |
| Subscriptions | Existing finance adapters and owner Action Centre source hooks; storeSubscriptions.ts only if required for a new dependency | Reuse existing feeds, bounded owner-review queries and point-loaded details. No app-wide listener rewrite. |

The table describes expected touchpoints, not permission to refactor every file. No Stock workspace redesign, new POS tabs, vendor/loan mutation or broad settings changes are proposed.

## 7. Rules cutover, compatibility and operating cost

Inventory includes dormant saveSales, sales-sync/legacy-delete/import paths as well as mounted forms. They cannot remain a bypass after closing moves server-side. Preserve actual supported manual declarations through an explicit trusted adapter; retire dormant unsafe import paths without claiming a new migration tool.

Cut over ordinary expense writes, Daily Cashout, affected sales/control/closure transitions and correction requests/decisions after their authorised replacements exist. Keep staff read access and existing role restrictions. Inspect overlapping allow branches. Preserve legitimate count/join/release/handover operations and all Batch 1–3 source protections. Old clients fail closed with a reload/recovery message; no unsafe browser-posting fallback.

Keep rupee-facing legacy fields, additive paise/version/source metadata, existing IDs and historical receipt/source links. No production backfill, reclassification, migration, deletion or financial repair is authorised by this proposal.

Existing balance reconstruction reads growing history. Initially reuse its documented compatibility semantics on the server, with bounded cursor queries and shared control/revision coordination across all replaced balance writers. Bounded page size does not mean bounded total reads. Do not introduce a trusted opening-balance migration/read model or claim read savings without separate approval/evidence.

Latest recorded preflight (14 October) established Blaze and Node20. Reuse the existing regional Functions service; no new scheduled service, dependency/runtime upgrade or billing change. Additional compute, reads/writes and logs add usage; this plan supplies no measured rupee estimate. Reconfirm runtime/service prerequisites read-only before approved application work.

This does not close remaining authority gaps in vendor posting, manual bank settings or unrelated financial consumers.

## 8. Proposed policy defaults — for additions before approval

1. Ordinary staff expenses post immediately; owner gets review information, not a pre-payment approval gate.
2. Cash expenses explicitly choose POS drawer or permitted held-cash source.
3. Zero expenses remain permitted; negative/invalid amounts do not.
4. New expense deletion becomes an owner-only audited cancellation; historical unknown funding is not automatically restored.
5. Staff Cashout remains 23:55–00:20 IST; owner remains unrestricted.
6. Nonzero closing discrepancy requires a reason and owner notification, without waiting for owner approval.
7. Cashout correction approval rules remain unchanged; manual credit declarations stay supported and clearly distinguished from POS totals.
8. Actual payee, general expense edit, drawer-funded vendor payments or a drawer-withdrawal Cash Movement option are additions to discuss, not already implemented capabilities.

Approval should resolve these defaults or replace them with the user's additions. Unresolved source/funding semantics must not be guessed during implementation.

## 9. Delivery order

**Now:** present this combined plan and affected components; collect additions and revise it. Documentation only.

**After explicit implementation approval:** implement Phase 4 and Phase 5 in that order, keeping one agreed accounting model and preserving the accepted Batch 1–3 behavior. Complete the legitimate server replacements and UI adapters before financial Rules cutover.

**After implementation:** add/update the necessary checks and run the agreed isolated test work and regression coverage, preserving old failures and explaining any superseded client-write contracts. The test design/commands/scenario list are deliberately deferred; none are added here.

**Then:** present the completed local interface and evidence for review. Separate explicit authorisation is required for commit, push or deployment. Background helpers remain hidden so planning/testing does not create disruptive PowerShell/CMD windows.
