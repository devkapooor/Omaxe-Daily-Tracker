# Mandatory cashier handover and reconciliation

Date: 2026-10-04
Status: Implemented locally; isolated verification complete. Deployment requires explicit user approval.
Release order: Complete handover before the combined release with approved UI updates. Phase 3C remains queued.

## Confirmed policy

- One shared cash drawer and one shared UPI/card terminal.
- Use POS (Test) bills and isolated handover records under `posSandboxes/test`. Production finance and loan records remain unchanged.
- Opening baseline: exactly zero cash at 2026-10-04 00:00 IST (`2026-10-03T18:30:00.000Z`). Earlier trial bills are excluded. Setup never rewrites historical receipts or stock.
- Gate accounts with persisted billing participation, including owners who bill. Dashboard-only accounts are not gated solely because of role.
- At a new login and before logout, capture physical cash by denomination and today's cumulative UPI/card readings. Persist the count/discrepancy atomically before allowing access; staff do not wait for owner approval.
- Carry counted cash forward even after a mismatch. Retain expected amounts, actual amounts and differences as immutable audit evidence.
- Compare terminal readings with the last observed reading plus subsequent POS collections/refunds in the same IST day. Daily rollover restarts terminal expectations at that day's POS totals; physical cash carries forward.
- POS bills, approved refunds and the last count determine drawer expectations. Staff explain cash added or removed outside POS in notes; these appear as discrepancies for owner review. Production expenses, transfers and deposits are not inferred as drawer movements.

## Implementation

- Owner setup writes an initializing marker, pauses checkout/refund approvals, reads receipts/states/events and creates participant records. Interrupted setup can resume without rewriting receipts or financial records.
- Checkout atomically updates shared cash/daily terminal totals and persisted cashier participation. Rules validate payment allocations, ledger deltas and authentication time.
- Previous participants require an opening count after new authentication. Completed logout closes cashier state so another tab with the same token cannot checkout until an opening count is saved.
- Ordinary refresh preserves the browser session. Opening unfinished billing in a fresh browser session requires a recovery count. Browser closure cannot force a physical closing count; participation remains persisted for recovery.
- The mandatory native dialog blocks Escape dismissal and blurs the workspace. It displays expected, actual and difference for each payment method.
- Each count is bound to the starting ledger revision and IST date. Concurrent billing/refunds/handovers or daily rollover require a restart. Competing submissions cannot both commit against one revision.
- Counts save immutable reconciliation evidence and carry physical/readings checkpoints forward. Pending differences appear in Action Centre; owner acknowledgment changes review metadata only.
- Refund/void ledger updates are linked to approved requests and bill-state transitions. Rules reject unlinked/forged refund edits. Voids of excluded pre-baseline trial bills do not subtract from the baseline.
- Sandbox reset is blocked after initialization. Receipts, events and reconciliation evidence cannot be deleted. The drawer badge uses the last physical count plus subsequent POS cash movements.

## Validation and release

See [verification evidence](./CASHIER_HANDOVER_VERIFICATION_2026-10-04.md).

Vitest discovery is restricted to active `src/` and `tests/` suites. Archived copies under `output/` previously ran duplicate tests against the same emulator projects.

Deployment is pending user approval. Build with auto-login credentials cleared and emulator mode disabled. After approval, deploy hosting/rules/indexes together, verify production read-only, and have the owner deliberately initialize the POS drawer before billing resumes.

## Operating limits

- Staff pause counter activity while counting. Changes invalidate the count; this release does not reserve exclusive drawer ownership for one cashier.
- Recovery uses a per-tab browser session marker plus persisted billing evidence. Duplicated/restored tabs can retain session storage; fresh authentication and persisted logout closure are enforced by Firestore.
- Outside cash movements remain explanatory discrepancies, as approved.
- Machine readings must use daily IST collections; lifetime readings or bank settlements are not interchangeable.
