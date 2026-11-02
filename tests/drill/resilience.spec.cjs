const {test,expect}=require('./helpers.cjs')
const CLIENT='/tests/drill/client.ts',VENDOR='/src/store/vendorLedgerV2Repository.ts'
async function attempt(action){try{return {ok:true,value:await action()}}catch(error){if(/DRILL_HELPER_|m\[name\].*not a function|Failed to fetch dynamically imported module/.test(error.message))throw error;return {ok:false,error:error.message}}}
test('COUNTER-08 explicit IST boundary calculation; real midnight requires timed run',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real app domain code in browser with explicit independent UTC/IST expectations; no emulator request.time manipulation'})
 const {page}=await h.session('owner');const values=await page.evaluate(async()=>{const {isCashoutWindowOpen}=await import('/src/features/cashout/domain/cashoutWindow.ts');const {handoverDate}=await import('/src/features/pos/domain/cashierHandover.ts');return ['2026-10-12T18:24:59.999Z','2026-10-12T18:25:00.000Z','2026-10-12T18:30:00.000Z','2026-10-12T18:50:59.999Z','2026-10-12T18:51:00.000Z'].map(iso=>({iso,open:isCashoutWindowOpen(Date.parse(iso)),date:handoverDate(iso)}))});expect(values.map(v=>v.open)).toEqual([false,true,true,true,false]);expect(values.map(v=>v.date)).toEqual(['2026-10-12','2026-10-12','2026-10-13','2026-10-13','2026-10-13']);h.evidence.assertions.push({values});test.skip(true,'Domain boundaries asserted; full-stack request.time cross-midnight acceptance requires a scheduled local run, not clock mocking.')
})
test('SEC-04 disabled and missing profiles rejected by actual callables',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Local Auth REST token followed by real HTTP callable; UI gate cannot mask server checks'})
 for(const role of ['disabled','missing']){const auth=await(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=drill-emulator-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role+'@drill.invalid',password:h.PASSWORD,returnSecureToken:true})})).json();expect(typeof auth.idToken).toBe('string');for(const name of ['changeStockPrices','reviewStockPriceChange','createCashTransfer']){const response=await fetch('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/'+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.idToken},body:JSON.stringify({data:name==='changeStockPrices'?{operationId:'stock-price-disabled-'+role,productId:'drill-product-1',expectedRevision:1,mrpPaise:10000,sellingPricePaise:9500,reason:'Drill disabled valid edit'}:name==='reviewStockPriceChange'?{id:'stock-price-disabled'}:{operationId:'cash-transfer-00000000-0000-4000-8000-000000000001',date:h.date,fromUserId:'drill-'+role,toType:'person',toUserId:'drill-billingB',amount:1,reason:'Drill disabled valid transfer'}})});const body=await response.json();h.evidence.assertions.push({role,name,status:response.status,error:body.error});expect(response.ok).toBe(false);expect(body.error.status).toMatch(/PERMISSION_DENIED|UNAUTHENTICATED/)} }
 expect(await h.records(h.base+'/stockPriceChanges')).toEqual([]);expect(await h.records('cashTransfers')).toEqual([])
})
test('VEN-10 balances and linked sources reject pre-activation invoices',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real UI balances and real Auth/Rules API date rejection/source/account records'})
 const {page}=await h.session('owner'),input={id:'drill-invoice',vendorId:'drill-alpha',invoiceNumber:'DRILL-TRACE',invoiceDate:h.date,invoiceTotalPaise:100000,actorUserId:'drill-owner',timestamp:new Date().toISOString()};expect((await attempt(()=>h.rpc(page,VENDOR,'createPurchaseV2',[{...input,invoiceDate:'2026-09-30'}]))).ok).toBe(false);expect(await h.records('purchasesV2')).toEqual([]);await h.rpc(page,VENDOR,'createPurchaseV2',[input]);await h.rpc(page,VENDOR,'createSettlementV2',[{id:'drill-trace-payment',vendorId:'drill-alpha',date:h.date,amountPaise:50000,mode:'cash',invoiceId:'drill-invoice',actorUserId:'drill-owner',timestamp:new Date().toISOString()}]);await h.nav(page,'Vendor Workspace');await page.getByRole('tab',{name:'Balances',exact:true}).click();await expect(page.getByText('Drill Alpha Vendor',{exact:true}).first()).toBeVisible();expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(50000);expect((await h.records('invoiceAllocationsV2'))[0]).toMatchObject({invoiceId:'drill-invoice',sourceRecordId:'drill-trace-payment',amountPaise:50000})
})
test('POS-01 POS-03 POS-04 name search, negative stock warning and real owner override',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'POS');const search=page.getByRole('textbox',{name:'Scan barcode or search product name',exact:true});await search.fill('Drill Product A');await page.getByText('Drill Product A',{exact:true}).locator('..').locator('..').getByRole('button',{name:'Add',exact:true}).click();await expect(page.getByLabel('1 items in cart')).toBeVisible();await page.getByRole('button',{name:'Clear cart',exact:true}).click();await search.fill('00003');await search.press('Enter');await expect(page.getByText(/this bill leaves stock negative/)).toBeVisible();await page.getByRole('button',{name:'Add customer or discount',exact:true}).click();await h.select(page,'Discount Type','Percentage');await page.getByRole('spinbutton',{name:'Discount Value',exact:true}).fill('10');await page.getByRole('button',{name:'Finalize Bill',exact:true}).click();expect(await h.records(h.base+'/bills')).toEqual([]);await page.getByRole('textbox',{name:'Override Reason',exact:true}).fill('Drill independent owner override');await page.getByRole('button',{name:'Finalize Bill',exact:true}).click();await expect.poll(async()=>(await h.records(h.base+'/bills')).length).toBe(1);expect((await h.records(h.base+'/bills'))[0].totalPaise).toBe(1800);expect((await h.get(h.base+'/products/drill-product-3')).currentQuantity).toBe(-1)
})
test('STK-09 ACT-03 synthetic history tied dates cursor pages unique',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Read-only real UI queries against explicit synthetic history fixtures; does not validate posting those records'})
 const time=new Date(Date.now()-60000).toISOString();const batch=h.db.batch();for(let i=0;i<28;i++){const id='drill-history-'+String(i).padStart(3,'0'),value={id,productId:'drill-product-1',barcode:'00001',productName:'Drill Product A',actorUid:'drill-billingA',actorName:'Drill billingA',reason:'Drill synthetic historical price '+i,createdAt:time,reviewedAt:time,reviewStatus:'reviewed',reviewedByUid:'drill-owner',reviewedByName:'Drill owner',before:{mrpPaise:10000,sellingPricePaise:9000},after:{mrpPaise:10000,sellingPricePaise:9000}};batch.set(h.db.doc(h.base+'/stockPriceChanges/'+id),value);batch.set(h.db.doc(h.base+'/stockMovements/'+id),{...value,type:'stock-price-correction',correctionId:id,quantityDelta:0,beforeMrpPaise:10000,afterMrpPaise:10000,beforeSellingPricePaise:9000,afterSellingPricePaise:9000})}await batch.commit()
 const {page}=await h.session('owner');await h.nav(page,'Stock');await page.getByRole('tab',{name:'Stock History',exact:true}).click()
 await page.getByPlaceholder('Optional exact identifier').fill('00001');await expect(page.getByText(/Product filters cover stock movements/)).toBeVisible()
 const rows=page.locator('tbody tr')
 const identities=values=>values.map(row=>{const marker=row.match(/Drill synthetic historical price (\d+)/);expect(marker).not.toBeNull();return Number(marker[1])})
 await expect(rows).toHaveCount(25)
 await expect(rows.first().getByTitle('Business reference')).toHaveText(/^PRICE\d+$/)
 const first=identities(await rows.allTextContents())
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect(rows).toHaveCount(3)
 const second=identities(await rows.allTextContents())
 expect([...first,...second].sort((a,b)=>a-b)).toEqual(Array.from({length:28},(_,i)=>i))
 await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(rows).toHaveCount(25)
 expect(identities(await rows.allTextContents())).toEqual(first)
 await h.nav(page,'Action Centre');await page.getByRole('tab',{name:'History',exact:true}).click();await expect(page.getByRole('button',{name:'View Details',exact:true})).toHaveCount(25);await page.getByRole('button',{name:'Load More History',exact:true}).click();await expect(page.getByRole('button',{name:'View Details',exact:true})).toHaveCount(28)
 expect(await h.records(h.base+'/stockMovements')).toHaveLength(28)
})
test('STK-04 UX-03 actual detail listeners detach and movement reads stay lazy',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Observed actual Firestore Listen addTarget/removeTarget traffic; no production read-savings measurement'})
 const {page}=await h.session('billingA')
 const messages=()=>h.evidence.requests.flatMap(r=>r.listen||[]).flatMap(value=>{try{return [JSON.parse(value)]}catch{return []}})
 const activeTargets=()=>{const active=new Map();for(const m of messages()){if(m.addTarget)active.set(String(m.addTarget.targetId),m.addTarget);if(m.removeTarget!==undefined)active.delete(String(m.removeTarget))}return active}
 const collection=(target,name)=>target.query?.structuredQuery?.from?.some(source=>source.collectionId===name)
 const quickBarcodes=['102030','101151','19008','757953692553','769807187498','726684841202'].sort()
 const quickAdd=target=>{const f=target.query?.structuredQuery?.where?.fieldFilter;return collection(target,'products')&&f?.field?.fieldPath==='barcode'&&f.op==='IN'&&JSON.stringify((f.value?.arrayValue?.values??[]).map(v=>v.stringValue).sort())===JSON.stringify(quickBarcodes)}
 await expect.poll(()=>[...activeTargets().values()].filter(quickAdd).length).toBeGreaterThan(0)
 const start=messages().length
 await h.nav(page,'Stock');await expect(page.getByText('Enter a barcode or choose a stock status to load stock.',{exact:true})).toBeVisible()
 await expect.poll(()=>[...activeTargets().values()].filter(quickAdd).length).toBe(0)
 const stockTargets=()=>messages().slice(start).filter(m=>m.addTarget).map(m=>m.addTarget)
 expect(stockTargets().filter(t=>collection(t,'products')&&!quickAdd(t))).toEqual([])
 const detailStart=messages().length
 await page.getByRole('textbox',{name:'Barcode',exact:true}).fill('00001');await page.getByRole('button',{name:'Edit Stock Prices For Drill Product A',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit Stock Prices',exact:true})).toBeVisible()
 const detailIds=()=>[...new Set(messages().slice(detailStart).filter(m=>m.addTarget?.documents?.documents?.some(d=>d.endsWith('/products/drill-product-1')||d.endsWith('/productCosts/drill-product-1'))).map(m=>String(m.addTarget.targetId)))]
 await expect.poll(()=>detailIds().length).toBeGreaterThanOrEqual(2)
 expect(stockTargets().filter(t=>collection(t,'stockMovements'))).toEqual([])
 for(const target of stockTargets().filter(t=>collection(t,'products')&&!quickAdd(t))){expect(target.query.parent).toBe('projects/demo-alphahub-drill/databases/(default)/documents/posSandboxes/test');expect(target.query.structuredQuery.where.fieldFilter).toMatchObject({field:{fieldPath:'barcode'},op:'EQUAL',value:{stringValue:'00001'}});expect(target.query.structuredQuery.limit).toBeLessThanOrEqual(51)}
 await page.getByRole('button',{name:'Close Product Details',exact:true}).click();await expect.poll(()=>detailIds().every(id=>!activeTargets().has(id))).toBe(true)
 h.evidence.assertions.push({phaseBoundaries:{stockNavigation:start,productDetails:detailStart},detailTargets:detailIds(),removedTargets:messages().filter(m=>m.removeTarget!==undefined).map(m=>m.removeTarget),stockQueryTargets:stockTargets().filter(t=>t.query)})
})
test('UX-02 current Register cheque fields and table confirmation expose keyboard semantics',async({drill:h})=>{
 await h.db.doc('chequeBooksV2/book-1120-1199').set({active:true,startNumber:1120,endNumber:1199})
 const {page}=await h.session('owner');await h.nav(page,'Register');await h.select(page,'Payment method','Cheque')
 await expect(page.getByRole('textbox',{name:'Cheque number',exact:true})).toBeVisible()
 await expect(page.getByLabel('Cheque date',{exact:true})).toBeVisible()
 await page.getByRole('textbox',{name:'Cheque number',exact:true}).focus();await expect(page.getByRole('textbox',{name:'Cheque number',exact:true})).toBeFocused()
 expect(await h.records('cashouts')).toEqual([])
 await page.getByLabel('Recipient',{exact:true}).fill('Synthetic accessible cheque');await page.getByLabel('Amount (₹)',{exact:true}).fill('30');await page.getByRole('textbox',{name:'Cheque number',exact:true}).fill('1188')
 const future=new Date(Date.parse(h.date+'T00:00:00Z')+86400000).toISOString().slice(0,10);expect(future>h.date).toBe(true);await page.getByLabel('Cheque date',{exact:true}).fill(future)
 await page.getByRole('button',{name:'Register issued cheque',exact:true}).click();await expect.poll(async()=>(await h.records('chequesV2')).length).toBe(1)
 await page.getByRole('tab',{name:'Cheques',exact:true}).click();await page.getByRole('button',{name:'Cancel cheque 1188',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog).toContainText('Cancel cheque')
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0)
 expect((await h.records('chequesV2'))[0].status).toBe('issued')
})

test('FIN-05 matched shared drawer must not be labelled excess cash',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'Cashout');await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const daily=(await h.records('dailyCashouts'))[0],closure=(await h.records(h.base+'/drawerClosures'))[0];h.evidence.assertions.push({daily,closure,independentExpectedPaise:100000,independentCountedPaise:100000,independentDifferencePaise:0});expect(closure).toMatchObject({expectedBeforePaise:100000,countedPaise:100000,differencePaise:0});expect(daily.auditStatus).toBe('matched');expect(daily.auditDifference).toBe(0)
})
test('LOG-02 actual expense filters sorting columns and pages',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real Logs UI against independent synthetic dated expenses; pagination is existing client-side Logs behavior, not bounded server acceptance'})
 const stamp=new Date().toISOString(),batch=h.db.batch();for(let i=0;i<23;i++)batch.set(h.db.doc('cashouts/drill-log-'+i),{id:'drill-log-'+i,storeId:'single-store',date:i<22?h.date:'2026-09-01',paidTo:'Drill Log Party '+i,amount:i+1,category:'Rent',paymentMode:'Cash',approvedBy:'Drill owner',notes:'Synthetic expense '+i,createdAt:stamp,updatedAt:stamp});await batch.commit()
 const {page}=await h.session('owner');await h.nav(page,'Logs');await page.getByRole('tab',{name:'Expenses',exact:true}).click();await expect(page.getByText('22 expenses | Page 1 of 3',{exact:true})).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(10);const first=await page.locator('tbody tr').allTextContents();await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('22 expenses | Page 2 of 3',{exact:true})).toBeVisible();const second=await page.locator('tbody tr').allTextContents();expect(new Set([...first,...second]).size).toBe(20)
 await page.getByRole('textbox',{name:/Search paid to/}).fill('Drill Log Party 21');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('22');await page.getByRole('textbox',{name:/Search paid to/}).fill('');await page.getByRole('button',{name:'Amount',exact:true}).click();await expect(page.locator('tbody tr').first()).toContainText('Drill Log Party 21');await page.getByRole('button',{name:'Columns',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Posted / approved by',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('columnheader',{name:'Posted / approved by',exact:true})).toHaveCount(0)
 await page.locator('input[value="Last 7 days"]').click();await page.getByRole('option',{name:'Last 90 days',exact:true}).click();await expect(page.getByText('23 expenses | Page 1 of 3',{exact:true})).toBeVisible();await page.locator('input[value="Last 90 days"]').click();await page.getByRole('option',{name:'Custom range',exact:true}).click();await page.getByLabel('From',{exact:true}).fill('2026-09-01');await page.getByLabel('To',{exact:true}).fill('2026-09-01');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('Drill Log Party 22')
})
test('FIN-03 real Cash Movement UI posts trusted person transfer',async({drill:h})=>{
 await h.db.doc('dailyCashouts/drill-holder').set({date:h.date,recordedBy:'Drill billingA',recordedByUserId:'drill-billingA',drawerTotal:1000,remainingBalance:1000,createdAt:new Date().toISOString(),revision:1});const {page}=await h.session('owner');await h.nav(page,'Cash Movement');await h.select(page,'From','Drill billingA');await h.select(page,'To','Drill billingB');await page.getByRole('spinbutton',{name:'Movement Amount',exact:true}).fill('300');await page.getByRole('textbox',{name:'Cash Movement Notes',exact:true}).fill('Drill trusted person transfer UI');await page.getByRole('button',{name:'Save Cash Movement',exact:true}).click();await expect.poll(async()=>(await h.records('cashTransfers')).length,{timeout:45000}).toBe(1);expect((await h.records('cashTransfers'))[0]).toMatchObject({amount:300,fromUserId:'drill-billingA',toUserId:'drill-billingB',createdBy:'Drill owner'});expect(await h.records('loans')).toEqual([])
})
test('FIN-04 UX-03 Cash Movement double-click must post one transfer',async({drill:h})=>{
 await h.db.doc('dailyCashouts/drill-holder').set({date:h.date,recordedBy:'Drill billingA',recordedByUserId:'drill-billingA',drawerTotal:1000,remainingBalance:1000,createdAt:new Date().toISOString(),revision:1});const {page}=await h.session('owner');await h.nav(page,'Cash Movement');await h.select(page,'From','Drill billingA');await h.select(page,'To','Drill billingB');await page.getByRole('spinbutton',{name:'Movement Amount',exact:true}).fill('300');await page.getByRole('textbox',{name:'Cash Movement Notes',exact:true}).fill('Drill same UI intent double-click');const completed=[];page.on('response',response=>{if(response.url().includes('/createCashTransfer'))completed.push(response.status())});await page.getByRole('button',{name:'Save Cash Movement',exact:true}).dblclick();await expect.poll(()=>h.evidence.requests.filter(r=>r.url.includes('/createCashTransfer')).length).toBeGreaterThanOrEqual(1);await expect.poll(()=>completed.length>=h.evidence.requests.filter(r=>r.url.includes('/createCashTransfer')).length,{timeout:45000}).toBe(true);h.evidence.assertions.push({completed})
 const records=await h.records('cashTransfers');h.evidence.assertions.push({records,independentOneIntentDebitPaise:30000,actualDebitPaise:records.reduce((s,r)=>s+r.amount*100,0)});expect(records).toHaveLength(1)
})
test('SEC-05 FIN-01 direct negative expense must be rejected',async({drill:h})=>{
 const {page}=await h.session('billingA');const result=await attempt(()=>h.rpc(page,CLIENT,'write',['cashouts/drill-negative-expense',{id:'drill-negative-expense',storeId:'single-store',date:h.date,paidTo:'Drill Party',amount:-2500,category:'Rent',paymentMode:'Cash',approvedBy:'Drill owner',notes:'Drill forged negative expense',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]));const saved=await h.get('cashouts/drill-negative-expense');h.evidence.assertions.push({result,saved,independentMinimumExpensePaise:0});expect(result.ok).toBe(false);expect(saved).toBeNull()
})
test('UX-05 navigation observations preserve financial sources and record local timing', async ({ drill: h }, info) => {
 info.annotations.push({ type: 'layer', description: 'Observed automated desktop navigation latency and protocol request counts; not physical-device latency or billable Firestore read counts.' })
 const { page } = await h.session('owner'), samples = []
 await h.nav(page, 'Settings')
 for (let round = 0; round < 3; round++) {
  for (const section of ['POS', 'Stock', 'Vendor Workspace', 'Logs', 'Settings']) {
   const offset = h.evidence.requests.length, started = await page.evaluate(() => performance.now())
   await h.nav(page, section)
   if (section === 'POS') await expect(page.getByRole('tablist', { name: 'POS sections' })).toBeVisible()
   else if (section === 'Stock') await expect(page.getByText('Enter a barcode or choose a stock status to load stock.', { exact: true })).toBeVisible()
   else if (section === 'Vendor Workspace') await expect(page.getByRole('button', { name: 'Add Party / Vendor', exact: true })).toBeVisible()
   else if (section === 'Logs') { await page.getByRole('tab', { name: 'Expenses', exact: true }).click(); await expect(page.getByText('No expenses found', { exact: true })).toBeVisible() }
   else await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible()
   const elapsedMs = (await page.evaluate(() => performance.now())) - started
   const requests = h.evidence.requests.slice(offset)
   expect(Number.isFinite(elapsedMs)).toBe(true)
   samples.push({ section, round, elapsedMs, observedRequests: requests.length, listenPosts: requests.filter(r => r.method === 'POST' && r.url.includes('/Listen/')).length })
  }
 }
 expect(await h.records('cashouts')).toEqual([])
 expect(await h.records(h.base + '/bills')).toEqual([])
 expect(await h.records(h.base + '/stockMovements')).toEqual([])
 h.evidence.assertions.push({ kind: 'navigation-observation', samples, interpretation: 'Includes automation dispatch and readiness waits; phases do not measure settled network traffic or billable reads.' })
})

test('COUNTER-08 AUD-01 real IST audit date must match its stock movement',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Actual server-synchronized posting after IST midnight; UTC and IST date expectations calculated independently'})
 test.skip(h.date===new Date().toISOString().slice(0,10),'Run in the actual 00:00–05:29 IST boundary interval; no trusted-clock mocking.')
 const {page}=await h.session('billingA');await h.rpc(page,'/src/features/pos/data/posRepository.ts','reconcilePosStockAuditBatch',[[{productId:'drill-product-1',physicalQuantity:17,expectedRevision:1}],await h.actor(page),{id:'drill-ist-count',note:'Drill real IST calendar boundary count'}]);const movement=(await h.records(h.base+'/stockMovements'))[0];h.evidence.assertions.push({movement,independentIstDate:h.date,independentUtcDate:new Date().toISOString().slice(0,10)});expect(movement.businessDate).toBe(h.date)
})
