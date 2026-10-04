# Shared page layout redesign — plan — 2026-10-04

## Goal

Use one reusable page-header and page-card-stack pattern across the app so page titles, optional controls, outer spacing, and scroll behavior are consistent. Match the Dashboard's approved header height and alignment. Pages may provide their own right-side controls or omit the header when the workflow benefits from doing so. Keep each page's distinct content and actions intact.

## Current layout inventory

`AppWorkspace` currently applies different top margins and scroll wrappers by route. Several feature pages also own their own root scrolling and page header:

- Dashboard: bespoke header with month control; Dashboard metrics include loan figures.
- Action Centre: its own owner-workspace header and approval cards.
- POS (Test): checkout/dashboard/admin navigation, cash-drawer status, and isolated test workflows.
- Vendor Workspace: tabbed ledger views, some with their own headings and forms.
- Party Directory: expense/loan party entry and saved-party management.
- Register: expense entry and owner loan operations.
- Cashout and Cash Movement: operational entry/review screens.
- Payroll: owner payroll workspace and staff salary-slip views.
- Logs: range controls, tabs, and record tables, including a Loans tab.
- Settings: Settings header with Staff, Operations, and Password sections.

The target is the page-level header, outer page frame/scroll boundary, and spacing between top-level cards. Inner workflow cards, forms, tables, modals, labels, and data presentation stay page-specific unless a later approved scope says otherwise.

## Proposed shared primitives

- `PageHeader`: fixed Dashboard-baseline minimum height and alignment; required page title; optional short description, eyebrow, and right-side controls. Do not reserve empty space for omitted content.
- `PageLayout`: consistent page frame and a single intentional content scroll boundary. A page can omit `PageHeader` by not supplying one.
- `PageCardStack`: consistent 10px spacing between top-level sections/cards, with responsive layout slots where a page already has side-by-side work areas.

These are composition primitives, not a universal mega-component. Do not move business logic, permissions, form state, queries, calculations, or writes into them.

## Implementation phases

Every phase requires separate user approval before implementation, local visual review before closeout, and its own dated summary/checkpoint commit. Do not deploy unless separately requested and confirmed.

### Phase 3A — Foundation and pilot

- Define the shared primitives and their responsive/dark-mode contracts.
- Migrate Settings and Party Directory as the pilot pages.
- Verify Settings role visibility and existing staff/account actions; verify Party Directory form and selection behavior remain unchanged.

### Phase 3B — Operational pages

- Migrate Cashout, Cash Movement, and Payroll page frames and top-level stacks.
- Preserve all existing entry, approval, salary, and audit workflows.

### Phase 3C — Module-specific workspaces

- Migrate Vendor Workspace, POS (Test), and Action Centre.
- Preserve vendor ledger semantics, POS test-only Firestore isolation, cash drawer presentation source, and Action Centre approval boundaries.

### Phase 3D — Loan-visible page presentation

- Migrate Dashboard, Register, and Logs to the shared visual frame in a separately reviewed phase.
- Visual presentation changes are allowed under this explicitly approved phase, but must not change loan data/records, schema, calculations, workflows, permissions, or financial side effects. Inspect the diff specifically for JSX/classes only in loan-related areas; stop if any behavior/data boundary is implicated.

### Phase 3E — Cross-page acceptance

- Review all pages in light and dark themes at wide desktop and narrow/mobile widths.
- Check header height/alignment, 10px top-level gaps, overflow/scroll ownership, keyboard focus, and page-specific control alignment.
- Fix only defects in this shared-layout scope; record any new feature requests separately.

## Acceptance criteria

- Page headers that are present share the Dashboard baseline height, title alignment, semantic tokens, and consistent horizontal gutters.
- Optional controls fit beside the title at wide widths and wrap/stack without overlap at narrow widths.
- Top-level page card stacks use the same 10px spacing; intentional two-column content retains equal or explicitly page-appropriate columns.
- No new browser-level scrollbar or nested unintended scroll area is introduced.
- Light and dark themes remain legible; no workflow, role access, data source, calculation, or write path changes.
- Loan data, calculations, workflows, permissions, and financial side effects are strictly protected; loan-area visual changes require the approved Phase 3D scope.

## Boundaries and source references

- Existing approved visual language: the app's `DESIGN.md` plus the Dashboard header in `DashboardPage.tsx`.
- No new feature/settings options, metrics, or business rules are part of this plan.
- POS remains isolated to `posSandboxes/test` and does not gain access to production finance records.
- Historical design notes described all loan UI as out of scope. The user clarified on 2026-10-04 that loan appearance may change, while loan data must never be touched. This plan supersedes that UI-only restriction; all other loan protections remain in force.
