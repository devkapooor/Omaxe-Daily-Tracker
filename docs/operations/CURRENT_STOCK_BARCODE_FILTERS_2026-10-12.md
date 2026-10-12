# Current Stock barcode-only filters - 2026-10-12

Status: implementation approved by the user. Implemented and validated locally as `f469cb0`. The user explicitly authorized deploy, commit and push following the local preview. v1.5.2 release preparation is underway; production remains v1.5.1 until publishing succeeds.

## Changes

- Filter bar contains Barcode, Stock Status and Clear Filters. The barcode field spans the phone width, with status and clear below; desktop keeps one compact row.
- Barcode matching is exact after trimming surrounding whitespace. Leading zeros and alphanumeric strings remain intact. Names, partial barcodes and vendor names do not trigger fallback matching.
- Remove Current Stock's name/vendor filter state, name-prefix query branch, vendor equality constraint and prefix-specific ordering logic. Keep product-name sorting with its existing normalized ordering key, recorded vendor values, other Stock workspaces and POS search unchanged.
- Keep All/In Stock/Zero Stock/Negative Stock. Blank barcode plus All sends no catalogue query; both the hook and repository enforce the idle condition.
- Keep server cursor pages of 50, stable ordering, matching product-cost queries in groups of at most 30, filter/sort pagination resets, explicit page-only MRP/cost/margin sorting and server refresh behavior.
- Direct price Edit, details subscriptions, collapsed movement history, existing authorization, server price posting and owner Action Centre review remain intact. No collection, index, Rules, financial posting or historical record changes are needed.

## Validation

- `npx eslint src tests`, `npm run build` and `git diff --check` passed. Existing bundle-size warning remains.
- Source suite: 138 tests across 24 files passed, including filter activation and retained ordering coverage.
- Focused loopback emulator suite: 16 Stock workspace tests passed. Coverage includes zero product/cost reads for blank filters, full-barcode matching with leading zeros, each quantity-status combination, no name/vendor/partial fallback, conflicting filters, bounded product/cost paging and existing role restrictions. Unrelated Rules/server posting suites were not rerun for this filter change.
- Browser checks on isolated `demo-stock-review` cover initial/cleared idle state, exact barcode, unmatched name/partial barcode, status-only pages of 50 then 13 synthetic products, combined filters, page reset, direct Edit, scoped detail listeners and initially collapsed movement history. Desktop and 390px phone screenshots are under ignored `output/playwright/current-stock-barcode-*.png`.
- Query instrumentation records only barcode/status keys, no unfiltered page request and two detail listeners detached on closing the popup. These are isolated observations, not measured production read savings. No mutation was needed for this change's browser checks.

## Files

- `src/features/stock/components/CurrentStockPage.tsx`: compact controls, labels and empty-state guidance.
- `src/features/stock/domain/stockQueryPlan.ts`: reduced filter model, idle predicate and ordering plan.
- `src/features/stock/hooks/useCurrentStock.ts`: barcode/status activation.
- `src/features/stock/data/stockRepository.ts`: exact barcode query and repository idle guard.
- `src/features/stock/domain/stockQueryPlan.test.ts` and `tests/stockWorkspace.rules.test.ts`: focused regressions.
- `docs/CURRENT_STOCK.md`, this checkpoint and `docs/operations/ROADMAP.md`: current behavior and release gate.

Local review: http://127.0.0.1:5174/output/stock-workspace/preview.html. Use barcode `00000`, then Clear Filters and each stock status. Data is synthetic and isolated; deployment is explicitly authorized and completion will be recorded after live verification.
