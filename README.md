# Omaxe Daily Tracker

Single-store finance operations app for:

- sales and daily cashout capture
- expenses, purchases, and vendor payments
- vendor outstanding tracking
- loan tracking and loan repayments
- cash movement tracking
- owner-managed staff accounts and settings

Current stack:

- React + Vite + TypeScript
- Firebase Authentication
- Firestore
- Tailwind CSS v4
- local shadcn-style UI primitives

Live app:

- https://alphahub-f137b.web.app

Key current behavior:

- login-only start screen
- owner creates users from `Settings`
- dashboard uses IST business-day logic
- visible dates render as `DD/MM/YYYY`
- daily cashout saves drawer total and audit status
- vendor payments reduce oldest open vendor balances first
