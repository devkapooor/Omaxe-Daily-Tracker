# Action Centre Phase 2 — 11 October 2026

Status: Committed as `851603a`; all three Action Centre phases deployed in v1.2.0 on 2026-10-11 after user authorization. User visual/runtime acceptance remains pending. The sections below retain the original implementation-checkpoint evidence.

## Scope and data protection

One details panel for all six request types and recent history, saved/proposed comparisons, financial and stock effects, explicit decision confirmations, mandatory rejection/return reasons, actionable loading/errors and outdated-source handling. Existing financial repositories, transaction guards, Rules, permissions and audit write shapes remain authoritative. Development does not write any production business record.

## Firebase preflight and billing

No new Firebase service, index, background job or Blaze-dependent feature. Reuse loaded corrections, returns, handovers and user names. POS details fetch only the selected immutable bill and its mutable state on opening; cache successful/in-flight results for this page visit. An explicit source refresh may repeat these two reads. No product/catalogue queries, preview writes or extra background listeners. Approval-time reads remain in existing workflows for correctness. Preview state is a snapshot, not a live guarantee.

## Delivery boundary

Build/TypeScript, focused lint and source/whitespace review at the local checkpoint. Automated tests and browser interaction are not requested. User visual review remains required. Phase 3 retains older pending coverage, complete global counts, pagination and broader subscription optimization. Existing unrelated Current Stock edits stay separate. Deployment requires a later request.

## Implementation checkpoint

- Every loaded pending/history entry opens the same accessible details dialog. Its header and decision footer remain fixed while details scroll. The native dialog supplies modal focus containment and Escape handling; closing is blocked while processing.
- Cashout comparisons include payment totals, audit, denominations and drawer totals. Vendor payment comparisons include amount, date, mode, notes and invoice reference. Changed fields are highlighted; historical fields without evidence show Not Recorded.
- POS previews include selected item quantities, prices, original bill payments, bill/refund totals and mapped stock effects. The bill/state preview timestamp is visible; its cached state is explicitly labelled as a preview. No catalogue or product reads are added.
- Handover details include expected/actual/differences, denominations and staff notes. Mark Reviewed confirms acknowledgement without balance changes.
- Each decision requires a separate confirmation step. Rejection/return reasons are required; return credit/date inputs are validated before confirmation. Failed writes keep the panel and entered values open. A synchronous processing guard prevents duplicate requests.
- The parent checks the loaded request snapshot again when confirming. Existing POS/vendor transactions retain their backend concurrency checks. Cashout corrections retain their loaded-state validation and existing atomic batched write/control Rules; this UI phase does not add a server-side cashout compare-and-swap check. Source previews do not replace write-time checks.
- Core action callbacks now propagate failures to the panel instead of swallowing them. The API calls, arguments and financial write implementations are preserved.
- Vendor initial loading now waits for all nine existing data sources. Handover initial loading waits for both existing recent/pending streams. Listener counts and query definitions are unchanged; source errors disable affected decisions and appear in the panel.

## Verification and review

- Production build passed; final TypeScript and focused ESLint passed after the last preview-display refinements. Local HTTP returned 200; Git whitespace checks passed. Source review confirmed financial write functions, Rules, and subscription query definitions are unchanged.
- No automated tests, browser interaction, production financial decisions or notification writes were performed. Financial workflow behavior and visual acceptance are not claimed as tested.
- Review locally: open each available request type and history; inspect comparisons/effects; choose an action and cancel its confirmation; inspect Settings separately if needed. Do not confirm a real financial decision merely for visual review.
- Recent histories and pending POS coverage retain Phase 1 query limits. Complete history/global counts and broader read reduction remain Phase 3.
