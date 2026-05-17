# Omaxe Daily Tracker - Current Plan

## Hard Rule

Code, docs, and QA notes must move together. Any change to auth, navigation, storage, installability, structure, or product behavior should update the affected markdown files in the same pass.

## Current Goal

Keep the live single-store app stable while making the current consolidated workspace easier to maintain and easier to install on mobile Chrome.

## Current Product Scope

The app currently supports:

- Firebase email/password login
- owner-created manager and billing accounts
- owner dashboard with projections and finance summaries
- shared party and vendor directory management
- register flows for:
  - expenses
  - vendor payments
  - purchases
  - owner-only loans and loan repayments
- daily cashout with drawer-audit save flow
- pending cash movement tracking
- owner-only logs workspace
- user directory, password updates, and projection settings
- one-time legacy browser-data import
- installable PWA support for Chrome/mobile
- explicit online-required offline behavior

## Current Priorities

### Priority 1: Workflow Reliability

- keep every finance write flow stable
- preserve vendor and loan allocation correctness
- keep cheque-mode flows consistent across forms
- keep Firestore-backed sync dependable
- keep installed/mobile app launches dependable without pretending offline data is supported

### Priority 2: Owner Visibility

- keep dashboard summaries trustworthy
- keep logs and directory views easy to audit
- preserve user and settings controls for the owner

### Priority 3: Maintainability

- keep `App.tsx` orchestration-focused
- keep reusable state and formatting logic out of large page files
- split files only where the seam is stable and reduces duplication

### Priority 4: Delivery Readiness

- keep the docs current
- keep the build green
- reduce risk before commit and push

## Recent Structural Progress

Completed in the current local pass:

- fixed the navigation config TypeScript build blocker
- extracted shared cheque-mode state into `src/components/useChequeDetails.ts`
- extracted shared stat card UI into `src/components/SummaryCard.tsx`
- fixed the dashboard summary mojibake separator
- added manifest, service worker, and install assets for mobile Chrome PWA installability
- added explicit online-required handling for offline app launches
- refreshed the markdown set to match the current consolidated app shape

## Near-Term Follow-Ups

- validate PWA installability on hosted Chrome Android after deployment
- consider splitting `LogsPage.tsx` by log section if it keeps growing
- consider splitting `DirectoryPage.tsx` by tab content if the vendor editor expands
- consider lazy loading or manual chunking if the production bundle warning becomes a practical issue
- rerun a current-state QA drill after the refactor settles
- defer true Android TWA packaging to a later phase after PWA validation

## Out Of Scope

- multi-store support
- inventory management
- payroll
- tax or GST workflows
- deep accounting ledger behavior
- offline business-data editing or queued writes
- Cloud Functions-dependent product changes unless explicitly requested
