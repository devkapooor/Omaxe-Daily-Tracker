# AlphaHub pre-deployment validation - 19 October 2026

Status: local acceptance complete; production release authorized and in progress.

## Isolation and baseline

- Repository branch was `main`; starting commit was `be3654c58400b3cb7c88bbfb285c0bc9ea199ee6`, aligned with `origin/main` before this release.
- Financial/browser mutations used Auth, Firestore, and Functions emulators under `demo-alphahub-drill`, with Vite at `127.0.0.1:5178`. The Node 20.20.2 acceptance runtime, Java 21 emulator runtime, real app authentication/profile gates, outbound guard, and server endpoint checks were used.
- The emulator fixture reset created 210 synthetic records. Production business records were not read for test setup or mutated. A read-only Functions inventory confirmed the deployed checkout-era Functions were Node 20 in `asia-south1`.
- Project documentation records the existing Firebase Blaze plan; Functions deployment requires Blaze. No billing configuration was changed.

## Validation

- Domain/unit: 28 files, 152 tests passed.
- Firestore Rules/repository: 130 passed; four loan mutation cases were intentionally excluded. Loan data remained untouched.
- Functions: 103 passed, zero failed, zero skipped.
- Source lint, drill lint, TypeScript build, Vite production build, and `git diff --check` passed. Vite reported the existing large main-chunk advisory.
- The drill controller's `application-config-unchanged` guard returned 1 because this release intentionally changes application files; it is a baseline-only safeguard and not an application test. The original guard output is preserved.
- Full sequential browser sweep: 143 passed, five failed assertions, and three skipped/manual scenarios. Each failed case was investigated and its affected workflow rerun after correcting the stale test contract/locator. Focused reruns passed: AUTH-01 and the complete smoke batch (4/4), F45-11 bank deposit recovery, POS-04 discount ceiling, POS-10 return-review idempotency, and STK-09 filtered history pagination. Original failure screenshots, traces, and test output remain under `output/playwright/2026-10-16-financial-remediation/`.

The five initial failures were test defects rather than application failures: an obsolete Cashout time-gate assertion; a deposit selector that did not match the accessible custom select; a discount-message regular expression that matched the live total before rejection completed; a review replay assertion that expected an idempotent acknowledgement to fail; and an unfiltered history fixture that included bill-level events. Assertions were corrected to test the current approved behavior and each affected workflow passed on rerun. No application code was changed in response to these test-only failures.

The wider browser pass also passed trusted checkout, concurrent terminals, payment variants, the 200-line contract, checkout/refund recovery, stock receiving/audit/reversal, vendor payment, Cashout, Cash Movement, cheque review, Logs, and phone-width workflows. The native installed-PWA/scanner/printer check remains manual and was skipped by browser automation.

## Index and release notes

- Firestore composite indexes changed from 65 to 89: 24 added and none removed. Four field overrides exempt unqueried operation/result payloads and large nested fields from indexing.
- No stale deployed Functions are being removed. The current source adds server operation callables while retaining the four deployed stock-price/time/transfer callables.
- No production posting, data migration, historical rewrite, or billing change was performed during validation.

## Remaining release checks

- Deploy approved Functions, Rules, indexes, and Hosting to `alphahub-f137b`.
- Confirm deployment completion and Hosting availability with read-only checks; do not exercise live financial writes.
- Physical scanner, installed PWA behavior, and terminal/printer behavior require a staff device check.
