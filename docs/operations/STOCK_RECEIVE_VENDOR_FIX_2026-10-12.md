# Receive Stock vendor picker and top-bar GRN History ? 2026-10-12

Status: user approved implementation after read-only diagnosis. Implemented locally; user visual review and separate deployment authorization are pending. No production mutations, data migrations, Rules changes, index changes, or posting changes are included.

## Diagnosis

The receipt form passed `onFocus` to `NativeSelect`, which discarded that prop. Consequently the normal Vendor dropdown never enabled the bounded catalogue query. Find vendors enabled it through a separate panel, masking this failure in the previous browser check. The shared selector also searched only supplied options, leaving vendors beyond the first 25 unreachable through its search. A read-only production probe during discovery confirmed the existing active-vendor query/index works.

## Implementation

- Remove Find vendors and the separate catalogue panel. `StockVendorPicker` reads only while its dropdown is open, using the existing `loadVendors` query: active vendors, canonical name and document ID ascending, cursor pagination, limit 25.
- Load more appends distinct returned vendors. Prefix changes reset results/cursor; typed searches debounce 300 ms. Search is explicitly labelled as case-sensitive name-prefix search. No normalized field, substring search, full catalogue download, or new index is introduced.
- Opening/reopening requests a fresh server first page. Selecting a row retains its vendor document without another detail request. Resuming a saved draft fetches only its selected vendor document, including vendors beyond page one. Selected-document errors have a scoped retry; Save draft waits for a resolved active vendor.
- Close, query change, tab switch, and unmount invalidate pending responses and cancel queued timers. An already-issued Firestore request can finish, but cannot overwrite a subsequent selection/query. There is no catalogue snapshot listener.
- Shared `SelectField` gains optional open/search callbacks, remote filtering and footer content. Existing selectors keep local filtering by default. Focus restoration no longer reopens a closed picker; arrow/Enter selection and spaces in searchable inputs work.
- Stock top-bar tabs are Current Stock, Receive Stock, GRN History, Stock Audit, Stock History. The receipt component stays mounted across Receive Stock and GRN History, preserving unsaved form fields and saved-draft continuation. Other Stock sections keep their existing mount lifecycle.
- GRN history queries run only in GRN History. Vendor catalogue queries stop on leaving the form; hidden invoice-reference checks are also disabled. The scoped vendor-ledger configuration subscription remains necessary for draft submission and unsubscribes when the receipt workspace is left.
- Reuse receipt drafts, source details, submit/delete/reversal, vendor/payable references and existing owner-only reversal behavior. GRN MRP correction remains retired. Posting algorithms and Firestore permissions are unchanged.

## Validation

- `npx eslint src tests`, production TypeScript/Vite build, and `git diff --check` pass. The existing bundle-size warning remains.
- Source suite: 137 tests across 24 files passed.
- Loopback Firestore suite: 86 tests across four files passed. The added regression seeds 61 active vendors plus an inactive vendor and verifies 25/25/11 cursor pages, uniqueness, prefix matching beyond page one, case-sensitive behavior, direct selected-document retrieval, and no catalogue listeners.
- Browser review uses only `demo-stock-review` at loopback ports 5174/5175/18080. Instrumented reads returned 25/25/12 vendor rows for 62 fixture vendors, with no extra catalogue query on receipt/history tab switching. This is synthetic evidence, not measured production savings.
- Browser checks cover natural click/focus/keyboard opening without Find vendors, Load more, selecting outside page one, remote search, retained selected labels, empty search, simulated error/retry, delayed response after tab switch, and an existing locally filtered selector.
- Saved draft, fresh-mount Continue, invoice/vendor/line retention, source View, receipt posting, vendor invoice reference, and owner reversal are checked against isolated data. Billing access is checked separately. Phone width 390 px and desktop/constrained 500 px header layouts are reviewed. Artifacts are in ignored `output/playwright/`.

## Review and boundaries

Local preview: http://127.0.0.1:5174/output/stock-workspace/preview.html. Its records are synthetic and isolated from production. Check the natural Vendor dropdown, prefix search and Load more, then enter an invoice and switch between Receive Stock and GRN History. Returning from other Stock sections still requires saving/continuing a draft; no new app-wide form persistence is introduced.

Deployment is pending separate user authorization. Existing browser-transaction financial/stock authority gaps, installed-app caching repair, and physical printer acceptance remain outside this fix. No new Firebase service or plan dependency is required.
