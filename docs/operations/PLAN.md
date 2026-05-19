# AlphaHub - Current Plan

## Hard Rule

Code, docs, and release notes must move together. Any change to auth, navigation, storage, structure, deployment, or product behavior should update the affected markdown files in the same pass.

## Current Goal

Keep the tagged V1 AlphaHub baseline stable while improving maintainability, release discipline, and operational clarity.

## Current Product Scope

The live app currently supports:

- Firebase email/password login
- owner-created manager and billing accounts
- owner dashboard with projections, balances, and summaries
- shared vendor and party directory management
- register workflows for expenses, vendor payments, purchases, and owner-only loan entries
- daily cashout with drawer-audit save flow
- cash movement tracking between staff holders and bank
- payment planning using cheque deductions plus manual planned payouts
- owner-only logs workspace
- owner-managed users, password updates, and projection settings
- one-time legacy browser-data import
- installable PWA support for Chrome/mobile
- explicit online-required offline behavior

## Current Priorities

### Priority 1: Workflow Reliability

- keep finance write paths stable
- keep vendor and loan allocation correctness intact
- keep planner deductions aligned with live cheque records
- keep Firebase-backed sync dependable

### Priority 2: Release Safety

- keep `main` releasable
- tag stable versions before major changes
- keep `VERSION_LOG.md`, `RELEASE_PROCESS.md`, and `ROLLBACK.md` current
- prefer rollback by redeploying tagged commits instead of rewriting history

### Priority 3: Maintainability

- keep `App.tsx` orchestration-focused
- keep feature ownership inside `src/features/*`
- keep shared utilities and primitives in `src/shared/*`
- keep store logic split by auth, finance, and settings concerns

### Priority 4: Operational Confidence

- keep the docs current
- keep build and lint green
- run focused drills before calling future versions stable

## Current Baseline

- canonical stable release tag: `v1.0.0`
- live Hosting URL: `https://alphahub-f137b.web.app`
- release and rollback workflow now lives under `docs/operations/`

## Near-Term Follow-Ups

- run a fresh post-V1 QA drill against the current navigation and planner flows
- consider bundle chunking if the current Vite size warning becomes a practical issue
- add stronger automated coverage for finance summaries and allocation rules
- keep archive docs clearly labeled as historical snapshots, not live operating truth

## Out Of Scope

- multi-store support
- inventory management
- payroll
- tax or GST workflows
- offline business-data editing or queued writes
- backend job orchestration unless explicitly requested
