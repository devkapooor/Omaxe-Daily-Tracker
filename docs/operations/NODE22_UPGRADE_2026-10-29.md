# Node 20 to Node 22 production runtime upgrade

Authorization: the user requested "plan the node 20 upgrade and execute it".
Status: completed and verified in production on 29 October 2026.

## Plan

1. Record all deployed Functions, runtime, source revision, service settings,
   triggers and current Hosting version. Back up each distinct Node 20 source
   archive. Preserve the already-Node-22 Telegram codebase.
2. Change only the default Functions runtime to Node 22 in package metadata,
   lockfile root metadata and Firebase configuration. Keep every dependency
   version and all business logic unchanged. Build an isolated release from the
   source used for the latest Stock/Vendor release and prove source parity.
3. Use an official SHA-256-verified Node 22 binary to install locked dependencies
   and run unit/integration checks for checkout, refunds, stock, audits,
   reversals, finance, cash movement, cashout and shared views. Run mutations
   solely against exact loopback emulators with dedicated demo project IDs.
   Check actual callable registration and emulator startup under Node 22.
4. Deploy a small initial group, verify it, then deploy the remaining default
   Functions in groups. Check ACTIVE status, Node 22 runtime, original service
   settings and triggers. Confirm Telegram and Hosting remain unchanged.
   Probe production only with invalid/unauthenticated requests and read-only
   checks; do not create a sale, GRN, payment, expense or other financial record.

Expected duration: about 15–25 minutes, subject to cloud build time. Hosting stays
published; existing Functions serve traffic while replacement revisions are
prepared. Cold starts and transient request latency remain possible.

## Scope and recovery

- Do not upgrade Firebase SDKs or npm dependency versions in this migration.
- Do not deploy Hosting, Rules, indexes, Telegram or database migrations.
- Preserve all existing production business records and unrelated local edits.
- Baseline and source archives go in ignored
  `output/node22-upgrade-2026-10-29/`; no credentials or signed URLs are written
  into this document or source control.
- Stop subsequent groups if verification fails. Use the backed-up matching
  business source on Node 22 for a corrective release. Do not reset data or
  depend on redeploying Node 20 after its decommission date.
- Build/source checks and isolated workflow tests are release evidence;
  authenticated real-store workflow acceptance remains a user check.

Official references: [Firebase runtime management](https://firebase.google.com/docs/functions/manage-functions)
and [Google runtime support schedule](https://docs.cloud.google.com/functions/docs/runtime-support).

## Baseline and compatibility checkpoint

- Inventory: 34 ACTIVE functions in asia-south1; 27 on Node 20 and seven in the
  Telegram codebase already on Node 22. Two distinct Node 20 source archives
  backed up; full settings/trigger inventory saved locally.
- Hosting baseline: `sites/alphahub-f137b/versions/f3ef00a679cf94a1`.
- Default Functions `package.json`, lockfile root engine metadata and Firebase
  configuration now specify Node 22. Source parity with the latest reviewed
  Stock/Vendor release was verified; dependency entries are identical.
- Official portable Node v22.23.4 downloaded and verified against Node's SHA-256
  manifest: `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`.
- Locked production dependency installation succeeded under Node 22.
- Backend: 134 checks passed, zero failed/skipped, using Node 22 and dedicated
  demo projects on 127.0.0.1:8080. Coverage includes checkout, refunds, stock
  receiving/audit/reversal, new shortage notes/opening corrections, finance,
  cheque/cashout/cash movement, shared publication and Telegram unit contracts.
- App/domain and focused Rules: 167 checks across 34 files passed under Node 22.
  This is the focused Rules suite plus app tests, not a claim that every older
  Rules suite is green.
- Actual Functions emulator loaded all 27 exports, reported node@22, and its
  spawned worker proof records v22.23.4. Auth-emulator sign-in followed by the
  real authenticated trusted-clock callable succeeded; anonymous trusted-clock
  access was rejected. Eight more actual callable endpoints rejected invalid or
  anonymous requests. Only a synthetic local user profile was created by that
  smoke check; no local business collections appeared.
- Tests used a nonlocal socket guard. Cloud metadata discovery attempts were
  blocked by the guard; they are expected isolation warnings, not passing
  production network calls. Initial Windows NODE_OPTIONS path quoting was
  corrected before the passing emulator startup; that first attempt is not
  counted as a pass.
- Planned production groups: three read-only callables (`getServerTime`,
  `quotePosReturn`, `getFinanceCashoutSummary`), then two groups of twelve.

## Initial-group configuration checkpoint

- The first three functions upgraded successfully and rejected invalid/anonymous
  live probes as expected. Verification paused the rollout on two differences.
- Telegram event-filter arrays were returned in a different order by the API;
  their filter sets, source revisions, full service configuration and deployment
  timestamps were unchanged. The checker now compares filter sets canonically
  while preserving strict checks for their actual values.
- Firebase deployment reset the three initial functions' pre-existing maximum
  instance limit of 20. Baseline evidence shows 23 default functions had this
  limit; four endpoints from the preceding Stock/Vendor release had the platform
  default. Explicit maxInstances options now preserve those exact existing
  per-function settings. The three initial functions are being redeployed with
  their restored limit before further groups proceed.
- A Node 22 registration check independently compares all 27 actual SDK endpoint
  definitions to the saved cloud limits and regions. It passed. A normalised
  source comparison confirms only instance-limit options differ from the
  reviewed business source; handler logic and dependency versions are unchanged.
- The corrected initial group passed all inventory/settings checks and live
  probes. The next twelve also passed, bringing the verified count to 22 Node 22
  functions including Telegram, with twelve Node 20 functions remaining.
- Firebase supplied `FUNCTION_SIGNATURE_TYPE=http` for the credit-note callable,
  where the previous deployment omitted that managed variable. The checker
  treats an omitted HTTP default and an explicit `http` identically, while
  continuing to compare every other environment variable and all secret bindings.
  Live probes for this group passed; the first runtime log check found no ERROR
  entries since the migration baseline.

## Completion and production verification

- All 27 previously-Node-20 default Functions were deployed successfully to
  Node 22. The final inventory at approximately 05:51 IST shows **34 ACTIVE
  functions, all on nodejs22, and zero on nodejs20**.
- All seven Telegram functions retain their exact source/build configuration,
  full service settings, trigger meanings and previous deployment timestamps.
- Every upgraded function retains its baseline timeout, memory, concurrency,
  instance limits, service account, ingress, network settings, application
  environment and secret bindings. The only managed-environment difference is
  the equivalent explicit HTTP signature marker described above.
- All 27 upgraded live endpoints rejected empty invalid/anonymous requests with
  HTTP 400 or 401 and expected callable error codes. No financial operation was
  submitted in production and no business records were written by this upgrade.
- Final Cloud Run log query returned zero ERROR entries for these services from
  the migration baseline through 05:50:49 IST. This is an observation over the
  deployment window, not a guarantee against future operational errors.
- Hosting remains exactly `sites/alphahub-f137b/versions/f3ef00a679cf94a1`.
  Five live file hashes match the previously deployed frontend; the Telegram
  controls page remains HTTP 200. No Hosting, Rules or index release occurred.
- The 134 backend and 167 app/focused-Rules tests passed: **301 automated
  checks**, plus actual Node 22 callable-worker and production health checks.
- One concurrent read-only inventory request encountered a transient credential
  refresh error. A sequential retry succeeded and produced the final complete
  inventory; the failed request is not treated as a verification pass.
- Test-only Functions/Auth emulators were stopped. The pre-existing Firestore
  emulator and Stock/Vendor review demo were preserved. The system-wide Node
  installation was not replaced; the portable Node 22 binary was used for
  migration validation and deployment.
- Runtime source changes remain local in `firebase.json`,
  `functions/package.json`, `functions/package-lock.json` and the explicit
  instance-limit options in `functions/index.js`. Business handlers and locked
  dependency versions are unchanged. No commit or push was performed.
- Detailed evidence remains under ignored
  `output/node22-upgrade-2026-10-29/`: baseline and source archives, rollout logs,
  release manifest, registration receipt, 301 test results, local worker/auth
  proof, per-group inventories, `after.json`, `probes-all.json` and
  `runtime-log-check.json`. Keep these with the financial release evidence.
