const fs=require('node:fs'),path=require('node:path')
const out=path.resolve('output/playwright/2026-10-12-drill-01')
const attempts=fs.readFileSync(path.join(out,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
function evidence(title){const r=attempts.filter(r=>r.title.includes(title)).at(-1);if(!r)return 'Source inspection; no current runtime evidence';let p=r.attachments.find(a=>a.name==='isolated-evidence')?.path;if(p&&path.basename(p)!=='evidence.json')p=path.join(path.dirname(path.dirname(p)),'evidence.json');return p?.replaceAll('\\','/').replace(process.cwd().replaceAll('\\','/')+'/','')||'See raw attempt log'}
const baseIds=new Set(['AH-FIN-01','AH-SEC-01','AH-SEC-02','AH-ARCH-01','AH-ENV-01'])
const findings=JSON.parse(fs.readFileSync('tests/drill/findings.json')).filter(f=>baseIds.has(f.id))
findings[0].evidence=evidence('POS-09 reject oversized');findings[0].reproducibility='Repeated in current drill; latest request includes a valid explicit IST refund date. Original failures preserved.'
findings[1].evidence=evidence('SEC-02 orphan');findings[2].evidence=evidence('SEC-03 fabricated')
const add=(id,category,severity,title,roles,steps,expected,actual,proof,reproducibility,impact,fix)=>findings.push({id,category,severity,title,roles,steps,expected,actual,evidence:proof,reproducibility,impact,fix})
add('AH-SEC-03','Confirmed permission/financial integrity failure','Critical','Checkout trusts supplied catalogue price and actor role','Real billing account; checkout/discounts',
 'Authenticate billingA and join. Actual finalizePosBill: A quantity1 at unitPrice1/current revision with cash1. Separately retain billing UID but supply actor.role owner, two A,99% discount17820 and cash180.',
 'Server reads catalogue9000 and actual billing role/cap5%; reject both manipulated payloads without bill/stock/cash effects.',
 'Both accepted. One catalogue9000 item billed for1 paise; the second bill discounted17820/18000 paise and stored supplied owner role for a billing UID.',
 evidence('actual checkout must reject')+'; '+evidence('actual billing identity'),'One current valid-shaped real Auth/Rules run per variant.',
 'Undercharging, forged privilege/attribution and discount-cap bypass.',
 'Trusted idempotent checkout accepts intent only and derives prices/discount permissions/actor from canonical product/profile records. Reject caller-supplied role/financial truth; preserve existing bill history.')
add('AH-SEC-04','Confirmed permission/stock integrity failure','Critical','Direct bill creation can omit stock posting','Authenticated billing; bills/sequences/handover/stock',
 'Create a real A2 bill18000, stock18. Direct SDK clone valid source shapes/native timestamps into a second18000 bill with sequence/cash/state but omit product/movement. Also run direct99.99% forged-price batch.',
 'No second bill without its stock/source invariants; rejected operation leaves one bill/stock18. Two valid A2 bills would imply stock16.',
 'Source-shaped second bill accepted; stock stayed18 despite two bills and cash36000. Direct99.99% batch also accepted with total1 and stock20 unchanged.',
 evidence('direct valid source-shaped')+'; '+evidence('forged bill discount/price'),
 'Two independent valid-shaped variants on resumed current emulators. Cached-helper earlier apparent passes were invalid and rerun.',
 'Inventory/sales divergence, forged receipts and financial history. The matching live-count variant was rejected by Rules, proving the reservation lock independently.',
 'Server-owned checkout must atomically derive and post catalogue, stock, sequence, payments and handover with revision/source proof. Narrow Rules after a separately approved compatible posting cutover.')
add('AH-FIN-02','Confirmed financial display/reconciliation inconsistency','Medium','Matched drawer is labelled excess cash','Owner Cashout/Logs and discrepancy review',
 'Open fixture checkpoint100000 paise, no bills/expenses. Owner counts two Rs500 notes and saves Cashout.',
 'Expected/count100000 and discrepancy0 should produce consistent matched audit evidence.',
 'Drawer closure records expected100000,count100000,difference0. Daily Cashout instead records cash-more and auditDifference-1000 rupees because it compares drawer with today cash sales0.',
 evidence('matched shared drawer'),'One current full UI/source run; formulas source-confirmed.',
 'Correct drawer is falsely flagged as excess/wrong billing; saved audit fields contradict canonical closure.',
 'Use one explicit drawer reconciliation basis from checkpoint plus ledger deltas. Keep sales summaries separate and resolve expense/payment ownership before changing cash arithmetic.')
add('AH-GAP-01','Confirmed auditability/requirement gap','Medium','Some financial sources omit immutable actor UID','Billing Register expenses; owner/delegated cash transfers',
 'Save billing expense25 through UI and inspect cashouts. Save owner transfer300 from billingA to billingB and inspect transfer payload/schema.',
 'Financial evidence should retain stable authenticated recorder identity; unavailable historical values remain honestly unavailable.',
 'Billing expense has no creator UID/name (approvedBy is Pending approval). Transfer has server-derived createdBy name, but no immutable recorder UID. Sender UID is not necessarily the recorder.',
 evidence('FIN-01 cash expense')+'; '+evidence('Cash Movement UI'),'Current saved records and schema/source confirmed.',
 'Expense creator cannot be traced; name-only transfer attribution can become ambiguous after renames/duplicate names.',
 'Persist authenticated recorder UID and name snapshot on new trusted postings. Do not guess/backfill historical actors; define required audit fields before implementation.')
add('AH-GAP-02','Requirement gap','Medium','Pending expense approval has no active decision workflow','Billing expenses and owner Action Centre',
 'Save a billing Register expense. Compare approvedBy Pending approval with active Action Centre source definitions.',
 'Define whether staff expenses need a real approval state/owner decision or only an informational approver label.',
 'Expense is saved immediately with Pending approval text. Active queue handles cashout/vendor/POS/price/handover sources, not a Register expense approval state.',
 'src/features/register/components/ExpenseForm.tsx; src/features/action-center/domain/approvalItems.ts; src/features/action-center/hooks/useActionCentreSources.ts',
 'Source-confirmed; no approval requirement was invented as an implemented feature.',
 'Ambiguous staff/owner expectation and misleading pending label.',
 'Obtain a separate decision on expense approval semantics, then implement enforced states or clear labelling; do not silently invent a new financial approval flow.')
add('AH-UX-01','Confirmed usability/accessibility issue','Medium','Cheque overlay lacks dialog semantics and modal focus','Owner/manager/billing Register cheque entry',
 'Register > Payment Mode Cheque. Inspect role=dialog and focused element while Enter cheque information is visible.',
 'Accessible modal with initial cheque-field focus, trapped keyboard navigation and safe dismissal/return focus.',
 'Zero dialog elements; recorded focus remains on the underlying Payment Mode input. Visual close/cancel creates no expense.',
 evidence('overlay must expose'),'One current browser run plus source confirmation.',
 'Keyboard/screen-reader users can lose context and reach controls behind the overlay.',
 'Reuse shared dialog semantics, initial focus/trap/Escape/return-focus; preserve mandatory-count dismissal requirements elsewhere.')
add('AH-UX-02','Confirmed usability/accessibility issue','Low','NativeSelect discards explicit accessible labels','Logs date range and other explicitly labelled selectors',
 'Logs renders NativeSelect aria-label Date range. Actual textbox has no matching accessible name; inspect NativeSelect prop forwarding.',
 'Passed aria-label/id/description attributes reach the interactive control.',
 'NativeSelect destructures selected props and discards aria-label. Functional Logs tests required a documented visible-value selector fallback.',
 evidence('actual expense filters')+'; src/shared/ui/native-select.tsx','Current UI locator/source confirmed.',
 'Selectors are harder to identify through assistive technology; inconsistent keyboard automation.',
 'Forward supported accessibility props to SelectField and its trigger; test accessible names and keyboard use.')
add('AH-PERF-01','Performance/architecture concern','Medium','Broad shared subscriptions and holder reads scale with history','All signed-in roles; Cash Movement and shared finance data',
 'Inspect storeSubscriptions collection snapshots and Functions holder transaction queries; observe target names in the current detail-listener test.',
 'Preserve necessary shared dependencies while bounding/scoping unnecessary historical reads; do not claim production read savings without measurement.',
 'Stock is idle until filters and two detail listeners detach correctly. Global sales/purchases/cashouts/payments/users/vendors/dailyCashouts/transfers remain broad; holder calculations inspect whole canonical collections.',
 evidence('actual detail listeners')+'; src/store/storeSubscriptions.ts; functions/index.js','Source/isolated query-target evidence; no production billing or read-count measurement.',
 'Increasing history raises reads, memory and transaction work despite Stock tab improvements.',
 'Separately inventory shared consumers and design date/cursor scopes or canonical holder aggregates with reconciliation. Do not make an unrelated global rewrite as a drill fix.')
add('AH-PERF-02','Performance concern','Low','Large initial JavaScript bundle','Desktop/phone initial load',
 'Fresh scoped TypeScript/Vite build with login bypass/password disabled.',
 'Record actual artifact sizes and benchmark before claiming user-visible latency.',
 'Fresh build: JS1450.56kB, gzip432.93kB; existing >500kB chunk warning. Mobile load timings were not measured.',
 'output/playwright/2026-10-12-drill-01/checks/vite-build.log','Fresh current build.',
 'Potential slower first load and parsing on phones; magnitude remains unmeasured.',
 'Measure cold navigation on target phones, then split workspace modules/dependencies at appropriate boundaries; no dependency upgrade as a shortcut.')
add('AH-ENV-02','Environment blocker/application emulator integration gap','Medium','Staff creation secondary Auth targets a nonlocal endpoint','Owner Settings > Staff creation',
 'Use demo config, primary local Auth and real owner. Fill Create User with synthetic data; inspect secondary Auth request.',
 'Every Auth instance must use the local emulator before any write in the drill.',
 'Secondary getAuth is not connected to Auth emulator. identitytoolkit.googleapis.com request was blocked; no synthetic account/profile was created and owner session stayed intact.',
 evidence('staff creation secondary'),'One current observed blocked browser flow plus source.',
 'Full-stack staff creation cannot be safely accepted in this environment; no production failure or account creation is claimed.',
 'Separately approve connecting secondary Auth instances through the same emulator-aware initializer. Keep the guard; never redirect silently to production.')
add('AH-SUS-01','Suspected/manual issue','Unrated','Installed Android cache refresh remains unverified','Installed Android Chrome app/PWA',
 'Repeat cold installed launch, online update, offline reopen and refresh on a physical Android phone.',
 'Installed app reflects the accepted release and has clear offline/update behavior.',
 'Local manifest/SW assets inspected; dev service workers blocked for isolation. Earlier user reports are context, not a reproduction from this drill.',
 'public/sw.js; public/manifest.webmanifest; PWA-01/PWA-02 artifacts','Not reproduced by this drill; manual acceptance required.',
 'Potential stale installed UI; no present defect asserted.',
 'Verify on device and collect worker/cache/version evidence before changing update policy.')
add('AH-FIN-03','Confirmed concurrency/financial bug','High','Cash Movement double-click creates two transfers','Owner Cash Movement; other permitted roles use the same form',
 'Holder billingA has1000 rupees. Owner selects billingA -> billingB, amount300, one reason, and double-clicks Save Cash Movement. Await both actual callable responses and inspect saved records.',
 'One UI intent posts one300 transfer (30000 paise); holder remainder700 and recipient300.',
 'Two different operation IDs posted300 each: actual debit60000 paise, remainder400 and recipient600. Callable idempotency for the same operation ID still passed; the UI generated two IDs.',
 evidence('double-click must post one'),'Repeated in two current full UI/Functions runs; original failures preserved.',
 'Duplicate cash movement/holder balances from an ordinary repeated click.',
 'Guard the UI immediately while pending, keep one stable operation ID across retries/lost acknowledgements, and retain server idempotency. Show pending/error/retry states without generating a new intent.')
add('AH-SEC-05','Confirmed permission/financial integrity failure','High','Staff can create negative owner-labelled expenses','Authenticated billing; Register/expense totals',
 'Billing directly SDK-writes cashouts/drill-negative-expense with amount-2500 rupees and approvedBy Drill owner.',
 'Reject negative financial amounts and forged approval attribution; no expense record.',
 'Rules accepted the negative amount and owner approval text. cashouts create requires only active staff. No production record was touched.',
 evidence('direct negative expense'),'One current direct real Auth/Rules run; source condition confirmed.',
 'Expense/net/cash summaries can be distorted; approval label is caller-controlled.',
 'Trusted expense posting validates nonnegative integer paise, actor and defined approval semantics; Rules reject independent malformed financial source creation. Approval-flow changes require a separate decision.')
add('AH-FIN-04','Confirmed date/stock audit inconsistency','Medium','Stock audit movement uses UTC business date after IST midnight','All stock-audit staff; source/history business dates',
 'Run during actual 00:00â€“05:29 IST. On13 October perform physical count A20->17 using real server-synchronized app/Rules API.',
 'Movement businessDate is2026-10-13 IST, consistent with the actual count day.',
 'Movement createdAt is12 October UTC, but businessDate is also2026-10-12 because the repository uses timestamp.slice(0,10). Independent IST date is2026-10-13.',
 evidence('real IST audit date'),'One real boundary-window posting, no clock mocking; source formula confirmed.',
 'Stock activity can be attributed to the previous business day; source details disagree with IST event time.',
 'Derive new movement business dates from the shared IST/trusted-clock convention. Inventory other UTC slicing paths; preserve historical records unless a separate correction is approved.')
fs.writeFileSync('tests/drill/findings.json',JSON.stringify(findings,null,2)+'\n')
console.log('Curated '+findings.length+' findings; conditional concurrency/expense probes must be appended only when confirmed.')
