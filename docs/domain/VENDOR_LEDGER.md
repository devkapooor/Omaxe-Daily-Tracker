# Vendor Ledger

Current behavior is documented from source at baseline 5777168. Firestore remains the authority for activation, permissions and financial records; this document is not a balance or activation report. The complete original decision register, phase evidence and workbook controls are retained in the [implementation archive](../archive/PURCHASE_VENDOR_CHEQUE_IMPLEMENTATION_2026-10-01.md).

## Implemented workflow

- Vendor Workspace uses stable IDs and the guarded V2 repository. Its subscription first reads appMetadata/vendorLedgerV2Config; absent/disabled configuration stops V2 collection subscriptions.
- The disabled owner view retains cutover planning and local-only preview. Activation is a separate owner action requiring the configured confirmation phrase, one business date and an atomic initializer; zero vendors is permitted.
- After activation, owner, manager and billing users can enter vendor profiles, purchases and non-cheque payments. Party Directory manages people only; Register contains expenses and owner loan operations.
- Vendors are searchable by name, owner, contact, address, companies, aliases and notes. Add Vendor is a modal, details are view-only, and new entries default to zero.
- Purchases store invoice facts separately from payments. A normalized invoice reservation enforces vendor/invoice uniqueness; source, ledger and projections are posted atomically.
- Cash, UPI, card and bank-transfer settlements can reference an invoice or use a custom amount. Account and invoice state projections are updated with append-only evidence; purchase totals are not rewritten.
- Staff submit settlement correction requests and may withdraw their own pending requests. Owners approve/reject through Action Centre or directly correct with an audited owner-edit request.
- Approval atomically updates effective settlement state, compensating ledger/account entries and invoice adjustment evidence where applicable. Direct owner editing first records an owner-edit request, then calls that approval transaction; failed approval can leave the request pending.
- Returns begin pending. Owner decisions record accepted vendor credit, replacement received, or rejection. Only vendor credit posts a negative unallocated ledger amount.
- Owner cheque controls support new vendor cheques, active leaves 1120-1199, revision checks, normalized uniqueness and lifecycle transitions. Debit posts a settlement effect exactly once.
- Existing expense/vendor cheque schedule rows appear read-only beside V2 cheques. Planner combines issued/presented V2 instruments and legacy/manual schedules, suppressing matching legacy numbers for open V2 instruments.
- Baseline staff capabilities include vendor.manage, purchase.create, settlement.create, settlement.correct, return.create and vendorLedger.view. Other capabilities require owner authority or an explicit grant; Firestore independently enforces access.

## Financial contracts

- V2 money uses safe integer paise; old rupee-valued records keep their existing representation. Canonical source records and append-only ledger/allocation evidence underpin guarded derived account states.
- Vendor outstanding sums financial postings. Informational pending-cheque events do not change it. Invoice open value subtracts posted allocations; reserved amounts are shown separately.
- Opening/purchase entries increase outstanding; settlements, debited vendor cheques and accepted return credits reduce it. Corrections use signed compensating entries, reasons, actors, timestamps, source revision and before/proposed evidence.
- Custom payments must be positive and no greater than current positive vendor outstanding at transaction time. They cannot create an advance.
- Invoice-linked payments cannot exceed available invoice value; vendor outstanding and open invoices can differ due to unallocated payments/credits.
- Issued and presented cheques are pending commitments. Debit changes outstanding once; cancel/bounce before debit must release only that cheque's reservations with no balance reversal.
- Return credit is vendor-level, never invoice-level. Replacement and rejection have no monetary effect. Cash refund is unsupported; returns never modify operational cash, bank or loan records.
- Legacy vendor records and balances do not seed V2 accounts. Legacy/expense cheque tracking must never create V2 vendor settlement postings.
- Original source records, opening entries and financial ledger evidence are not overwritten by corrections. Loan data and party balances remain outside this workflow.

## Approved decision register

All decisions below were approved on 2026-10-01. Approval does not imply every UI/persistence path is implemented.

| ID | Approved rule |
| --- | --- |
| FD-001 | Only Debited reduces vendor outstanding; Issued/Presented remain informational commitments. |
| FD-002 | Cancel/bounce atomically and idempotently releases that cheque's reserved invoice allocations. |
| FD-003 | V2 is a clean separate ledger; preserve legacy evidence without reconstruction or migration into V2 balances. |
| FD-004 | Default zero opening; owner alone may enter verified opening with reason/actor/time. Later changes are signed audited adjustments linked to the immutable opening. |
| FD-005 | Staff request financial corrections through Action Centre; owner may apply direct audited corrections. |
| FD-006 | Purchase and payment are separate records in one vendor ledger; invoice shortcut opens a separately submitted payment. Cheques remain in the register. |
| FD-007 | Returns create unallocated vendor credits; payments may use a selected invoice up to its open amount or a custom vendor-account amount. |
| FD-008 | No vendor cash refunds or changes to cash-holder, Cash Movement or bank records from returns. |
| FD-009 | Active cheque leaves are 1120-1199; verified 1200-1299 remain inactive until separately activated. |
| FD-010 | Retain the verified 30 open workbook cheques in operational tracking: 21 Issued plus nine In Process. Original control totals and hash remain in the archive. |
| FD-011 | One register and globally unique cheque number across vendor-payment and expense purposes, with source links. |
| FD-012 | One owner-approved all-vendor business activation date; no per-vendor activation. |
| FD-013 | Custom payment cannot exceed current positive outstanding or create vendor advance. |
| FD-014 | Imported legacy cheques remain tracking-only; In Process maps to Presented; status changes never reduce clean V2 balances. |
| FD-015 | Bring open expense cheques into tracking after normalization/deduplication; conflicting source details require owner review and original expense records stay unchanged. |
| FD-016 | Activation with zero vendors is allowed; owner adds zero-opening vendors individually afterward. |
| FD-017 | Register is expenses and owner loans; staff/manager enter V2 vendor details/purchases/payments. Legacy vendor posting is blocked after activation; sensitive controls remain restricted. |
| FD-018 | Vendor creation lives only in the Vendor Workspace modal; Directory is party-only. Legacy records may be hidden, but party balances and loans are preserved. |

## Remaining implementation boundaries

- The clean-start planner supports reviewed opening entries, but the normal Add Vendor flow starts at zero. General post-activation opening adjustment UI/persistence remains future work.
- Settlement corrections are implemented, including linked invoice adjustments. General purchase, return and cheque correction workflows remain approved requirements requiring a later release.
- Domain helpers cover reservation release and legacy tracking semantics. The current live new-cheque form does not provide cheque invoice-allocation capture; do not claim complete reservation persistence from helper tests alone.
- The 30 workbook instruments have not been imported by cleanup. Their future initialization, conflict review, normalized matching and cross-source uniqueness need explicit operational controls.
- Showing legacy expense cheques read-only and merging planner schedules is not a persisted unified expense-cheque migration. Keep that requirement open.
- V2 account balances are shown in Vendor Workspace. The Dashboard currently receives its legacy vendor metric from workspaceMetrics; switching that source is a separate financial change.
- Disabled initialized ledgers cannot be initialized again. Containment/resume requires a separate reviewed operation, preserving all original evidence.

## Verification and references

Use [QA Checklist](../operations/QA_CHECKLIST.md) for isolated mutation, authorization, stale revision, retry, concurrent overpayment, ledger reconciliation and planner tests. Production verification is read-only. [Data Model](./DATA_MODEL.md) documents persistence, [Calculations](./CALCULATIONS.md) distinguishes current and retained legacy summaries, and [Roadmap](../operations/ROADMAP.md) owns pending work.
