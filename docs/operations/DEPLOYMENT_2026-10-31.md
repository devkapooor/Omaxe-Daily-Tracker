# Deployment ? 31 October 2026

Subsequent backend-only deployment: [counter-date correction](COUNTER_DATE_FIX_2026-10-31.md). The record below describes the earlier full release and its original evidence.

Application release completed and verified at `2026-10-31T07:06:37.048Z`.

- Project/site: `alphahub-f137b`, https://alphahub-f137b.web.app.
- Hosting version: `sites/alphahub-f137b/versions/c5857e819c5e3750`. All 11 served files match the frozen release SHA-256 hashes.
- Rules: `projects/alphahub-f137b/rulesets/e14b82a1-6ad2-42b6-9fd3-7a8f6a27c979`; the released Rules source matches the staged source exactly.
- Application Functions: all 30 are ACTIVE on Node.js 22, including the two new vendor-migration endpoints. Existing timeout, memory, instance/concurrency limits, service identity and ingress settings were preserved. All seven Telegram Functions retain their earlier deployment timestamps.
- Six unauthenticated callable probes returned the expected 400/401 application rejections. No production business operation, vendor balance reset or legacy migration was invoked.
- All required index definitions were already deployed and READY, so indexes were retained. The local file contains 92 entries representing 91 unique deployed definitions; the existing duplicate was not changed in this deployment.

## Included application work

The release uses the approved current working tree for the complete application, Rules and default Functions codebase. It includes the pending maintenance/financial fixes and UI work, the vendor payable reset/opening workflow, V2-only vendor master/payable reads, reviewed legacy-vendor migration and archives, removal of the Announcements feature, and optional FSSAI/bank details in Business Identity. Staff Notifications remains the staff-message workflow. Bank fields are excluded from staff projections.

Deployment makes these controls available; it does not apply a financial reset or choose vendor identity mappings. The owner must review the desired reset date/current counts and each legacy-vendor destination before using those controls. Enter the real FSSAI/bank details in Settings after refreshing. Existing registration values are preserved.

## Validation

| Layer | Result |
| --- | --- |
| Source/domain tests with existing loan exclusion | 167 passed; 1 skipped |
| Source/drill lint, TypeScript and production build | Passed |
| Functions with emulator integrations | 153 passed; 1 skipped |
| Current financial Rules suites | 40 passed |
| Shared-view/stock revision/reporting support suites | 13 passed |
| Historical Rules/repository compatibility suites | 85 passed; 4 skipped by existing exclusions |
| Isolated Telegram integration | 18 passed |
| Authenticated browser workflows | 154 passed; 3 skipped; 0 failed |
| Cloud Rules/Functions dry runs | Passed |
| Live deployment verification | 30 application Functions ACTIVE, Rules source exact, 11 Hosting files exact |

The original browser run was interrupted and its evidence retained. The resumed browser phase ran from fresh fixtures without repeating completed static/support/Telegram phases. The browser suite includes actual elapsed five-minute count-reservation expiry, independent sessions, duplicate/retry and financial reconciliation checks, Staff Notifications, and the new Business Identity privacy/persistence scenario.

The three browser exclusions are physical installation/scanner/printer acceptance, real full-stack midnight acceptance, and the real-time IST/UTC stock-audit date-window scenario. Browser contexts block service workers, so these results do not establish installed-PWA/update or physical-device acceptance. Existing loan mutation exclusions remain. Production verification used public assets, cloud deployment metadata and unauthenticated rejected calls; no live financial workflow was tested by writing business records.

Existing warnings remain for bundle size, Telegram fast refresh, the installed Functions SDK version, and unused Rules helpers/compiler lint. No dependency upgrade or automatic audit fix was performed.

## Evidence and recovery

- Frozen source, dependencies, manifests and deployment logs: ignored `output/release-2026-10-31-vendors-settings/`.
- `source-manifest.json` records the exact deployed files. `validation.json` joins the completed phase results. `verification-functions.json` and `verification-all.json` record live verification.
- Static/support/Telegram and interrupted browser evidence: `output/playwright/release-20261031-vendors-settings/`.
- Successful resumed browser evidence: `output/playwright/release-20261031-browser-resume1/`.
- Recovery: `hosting-recovery-version.json`, retained previous public assets, `previous-rules/`, and `previous-function-sources/manifest.json` mapping both previous source archives to the 28 prior application endpoints. Retain these local recovery artifacts; they are ignored and not durable remote backups.
- Any rollback must use reviewed compatible code/Rules and preserve financial posting authority and records. Code rollback does not reverse business transactions.
- The owned emulator/Vite stack was stopped after testing. Existing unrelated/staged changes were preserved. No Git commit, tag or push was made.

## Operator follow-up

Refresh every billing computer and phone to load the new version (Ctrl+Shift+R in desktop browsers). Confirm ordinary operation on actual devices. The remaining data actions are the owner-reviewed vendor reset and legacy profile migration; both remain unexecuted by this deployment.
