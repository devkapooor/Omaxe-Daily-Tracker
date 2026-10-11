# Opening balance when adding a vendor

Status: Implemented and verified as `3466ccd` on 2026-10-11. The user explicitly authorized commit, push and deployment; prepared for the v1.3.0 Hosting release. User visual acceptance remains pending.

## Behavior

- Vendor Workspace → Vendors → Add Vendor lets the owner enter Opening Balance (₹), defaulting to zero. A positive amount represents an existing payable owed to the vendor, consistent with the current vendor ledger model.
- A positive opening requires an explicit date and audit reason. The date defaults to the current trusted workspace date and cannot precede vendor-ledger activation. Negative, fractional-paise, unsafe and invalid amounts/dates are rejected.
- Save creates the vendor profile, immutable opening-balance ledger entry and matching vendor account balance in one Firestore transaction. The opening is visible in existing vendor details and Balances; normal vendor payments can reduce it without linking an invoice.
- A zero opening creates only the vendor profile. Staff creation and the existing GRN quick-add retain zero-opening behavior; current Rules permit nonzero opening entries only for the owner.
- The modal keeps the same vendor ID and creation timestamp across retries and prevents simultaneous submissions. A saved opening can be retried without resetting a balance that has since received payments. Changed opening amounts, dates or audit evidence cannot overwrite the first save.
- Failures stay visible in the form and preserve entered values.

## Firebase and data scope

Existing Firestore transactions, collections and Security Rules already support owner-audited openings. No Rules, index, function or service change is required. No existing vendor, balance, financial history, inventory or loan record was modified during implementation or verification.

Before transaction retries and Rules reads, zero-opening creation retains two client reads (config and vendor) and one write. Positive opening creation uses four client reads (config, vendor, prospective opening and account) and three atomic writes. An exact positive retry uses three reads and no writes. No new subscription or catalogue query is added.

## Verification

- TypeScript/Vite production build passed, with local login credentials and emulator connections disabled in build inputs. Existing large-bundle warning remains.
- Focused ESLint and Git whitespace checks passed.
- 33 domain tests passed across vendor ledger, cutover and identity suites.
- 17 vendor-ledger capability tests passed in the isolated `demo-alphahub` Firestore emulator; 26 unrelated tests in the same file were intentionally skipped. Coverage includes atomic positive openings, owner permissions, zero-opening staff behavior, matching retries, changed evidence, pre-activation dates and payments against an opening.
- Browser interaction and production mutations were not performed. User visual acceptance remains pending.

