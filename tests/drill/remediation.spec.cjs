const {test,expect}=require('./helpers.cjs')
const crypto=require('node:crypto'),CLIENT='/tests/drill/client.ts',FIN='/src/features/register/data/financeRepository.ts'
async function rejected(fn){try{await fn();return ''}catch(e){return e.message}}
function billIntent(h){return {operationId:crypto.randomUUID(),businessDate:h.date,lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:1,unitPricePaise:9000,expectedProductRevision:1,stockAtScan:20}],discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:9000}]}}
async function confirm(page,reason='Independent cheque race check') {const d=page.getByRole('dialog');await d.getByRole('textbox',{name:'Reason',exact:true}).fill(reason);await d.getByRole('textbox',{name:'Type CONFIRM to proceed',exact:true}).fill('CONFIRM');await d.getByRole('button',{name:'OK',exact:true}).click()}
async function bank(h){await h.db.doc('bankBalanceControl/main').set({initialized:true,balancePaise:500000,revision:1});await h.db.doc('appMetadata/appSettings').set({currentBankBalance:5000},{merge:true})}
async function issue(h,page,number='1180'){await h.db.doc('chequeBooksV2/book-1120-1199').set({active:true,startNumber:1120,endNumber:1199});return h.rpc(page,FIN,'postFinanceOperation',['cheque-issue',{purpose:'expense',chequeBookId:'book-1120-1199',chequeNumber:number,date:h.date,amountPaise:3000,paidTo:'Synthetic race cheque',category:'Rent',notes:'Local due-cheque proof'}])}

test('R01 FT-01 staff cannot read bank mirror, reconstruct it from planner, or publish forged shared views',async({drill:h})=>{
 const m=structuredClone(require('./empty-metrics.json'));m.updatedAt=new Date().toISOString();m.planner.groupedSchedule=[{date:h.date,totalAmount:300,items:[{id:'fixture',amount:300,date:h.date,note:'Synthetic cheque',source:'vendor-cheque',title:'Fixture vendor',runningBalanceAfter:12045.67,status:'available'}]}]
 await h.db.doc('appMetadata/appSettings').set({currentBankBalance:12345.67},{merge:true});await h.db.doc('appMetadata/workspaceMetrics').set(m);await h.db.doc('cashouts/synthetic-planner-cheque').set({date:h.date,paidTo:'Fixture vendor',amount:300,category:'Rent',paymentMode:'Cheque',chequePayDate:h.date,createdAt:new Date().toISOString(),notes:'Synthetic cheque'})
 const {page:owner}=await h.session('owner');const dry=await h.rpc(owner,CLIENT,'call',['publishStaffViews',{dryRun:true}]);await h.rpc(owner,CLIENT,'call',['publishStaffViews',{dryRun:false,expectedSettingsRevision:dry.settingsRevision,expectedMetricsUpdatedAt:dry.metricsUpdatedAt}])
 for(const role of ['manager','billingA']){const {page}=await h.session(role)
  for(const path of ['appMetadata/appSettings','appMetadata/workspaceMetrics','bankBalanceControl/main','settingsAudit/fixture'])expect(await rejected(()=>h.rpc(page,CLIENT,'read',[path]))).toMatch(/permission|insufficient/i)
  expect(await rejected(()=>h.rpc(page,CLIENT,'list',['appMetadata']))).toMatch(/permission|insufficient/i)
  const settings=await h.rpc(page,CLIENT,'read',['appMetadata/staffSettings']),metrics=await h.rpc(page,CLIENT,'read',['appMetadata/staffWorkspaceMetrics'])
  expect(settings.currentBankBalance).toBeUndefined();const row=metrics.planner.groupedSchedule[0].items[0];expect(row).toMatchObject({amount:300});expect(row.runningBalanceAfter).toBeUndefined();expect(row.status).toBeUndefined();expect(JSON.stringify([settings,metrics])).not.toContain('12345.67')
  expect(await rejected(()=>h.rpc(page,CLIENT,'call',['publishStaffViews',{dryRun:true}]))).toMatch(/owner/i)
  expect(await rejected(()=>h.rpc(page,CLIENT,'write',['appMetadata/staffSettings',{currentBankBalance:999}]))).toMatch(/permission|insufficient/i)
  expect(await page.getByText('Bank book balance',{exact:true}).count()).toBe(0)
 }
 expect((await h.get('appMetadata/appSettings')).currentBankBalance).toBe(12345.67)
})

test('R02 FT-01 missing staff projection fails closed and recovers through reviewed owner publication',async({drill:h})=>{
 await h.db.doc('appMetadata/staffSettings').delete();const {page:staff}=await h.session('billingA',{gate:false})
 await expect(staff.getByRole('alert')).toContainText('Shared settings are unavailable');await expect(staff.getByRole('button',{name:'Retry workspace',exact:true})).toBeVisible();expect((await h.rpc(staff,CLIENT,'authIdentity')).uid).toBe('drill-billingA')
 expect(h.evidence.requests.filter(r=>r.role==='billingA').flatMap(r=>r.listen||[]).some(v=>v.includes('/documents/appMetadata/appSettings'))).toBe(false)
 const {page:owner}=await h.session('owner');const dry=await h.rpc(owner,CLIENT,'call',['publishStaffViews',{dryRun:true}]);await h.rpc(owner,CLIENT,'call',['publishStaffViews',{dryRun:false,expectedSettingsRevision:dry.settingsRevision,expectedMetricsUpdatedAt:dry.metricsUpdatedAt}]);await expect(staff.getByRole('button',{name:/^Stock(?:\s|$)/}).first()).toBeVisible()
 expect((await h.get('appMetadata/appSettings')).currentBankBalance).toBe(0);expect(await h.records('cashouts')).toEqual([])
})

test('R03 FT-03 stale-clock logout click is retained, visible, and completes after real reconnect',async({drill:h},info)=>{
 info.annotations.push({type:'controlled-readiness',description:'Expires only client clock sample; actual Auth/Firestore/Functions remain local. This is not a real-midnight financial test.'})
 await h.seed('closed');const {page}=await h.session('owner',{gate:false});await expect(page.getByRole('button',{name:'Log out',exact:true})).toBeVisible();await h.clock(page)
 await h.rpc(page,CLIENT,'expireTrustedClockForReadiness');await page.waitForTimeout(1200);await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Log out requested'})).toBeVisible();expect((await h.rpc(page,CLIENT,'authIdentity')).uid).toBe('drill-owner')
 await page.getByRole('button',{name:'Retry logout check',exact:true}).click();await expect(page.getByRole('button').filter({hasText:'owner@drill.invalid'})).toBeVisible();expect((await h.rpc(page,CLIENT,'authIdentity')).uid).toBeNull();expect(await h.records(h.base+'/reconciliations')).toEqual([])
})

test('R04 FT-03 pending payout blocks logout until recovered and mandatory count cannot be bypassed',async({drill:h})=>{
 const {page}=await h.session('billingA');let dropped=false;await page.route('**/asia-south1/postFinanceOperation',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed')}else await route.continue()})
 await h.nav(page,'Register');await page.getByLabel('Recipient',{exact:true}).fill('Logout recovery fixture');await page.getByLabel('Amount (₹)',{exact:true}).fill('25');await page.getByRole('button',{name:'Record payment',exact:true}).click();await expect(page.getByText('Financial operation needs recovery',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Recover the pending financial operation'})).toBeVisible();expect((await h.rpc(page,CLIENT,'authIdentity')).uid).toBe('drill-billingA')
 await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Recover original result',exact:true}).click()]);await expect(page.getByText('Financial operation needs recovery',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page.getByRole('dialog',{name:'Logout Count',exact:true})).toBeVisible();expect((await h.rpc(page,CLIENT,'authIdentity')).uid).toBe('drill-billingA');expect(await h.records('cashouts')).toHaveLength(1);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(-2500)
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'Cancel Logout',exact:true}).click();expect((await h.rpc(page,CLIENT,'authIdentity')).uid).toBe('drill-billingA')
})

test('R05 FT-04 due cheque buttons wait for presentation; concurrent changed source requires new confirmation',async({drill:h})=>{
 await bank(h);const {page}=await h.session('owner');const created=await issue(h,page)
 let release;const paused=new Promise(resolve=>{release=resolve});await page.route('**/asia-south1/presentDueCheque',async route=>{await paused;await route.continue()})
 await h.nav(page,'Register');await page.getByRole('tab',{name:'Cheques',exact:true}).click();const cancel=page.getByRole('button',{name:'Cancel cheque 1180',exact:true});await expect(cancel).toBeDisabled();await expect(page.getByText('Updating status…',{exact:true})).toBeVisible();release();await expect(cancel).toBeEnabled();await cancel.click();await expect(page.getByRole('dialog',{name:'Cancel cheque',exact:true})).toBeVisible()
 const {page:other}=await h.session('owner');const before=await h.get('chequesV2/1180');await h.rpc(other,FIN,'postFinanceOperation',['cheque-decision',{chequeNumber:'1180',expectedRevision:before.revision,toStatus:'presented'}]);await confirm(page)
 await expect(page.getByRole('alert').filter({hasText:'Cheque changed while you were confirming'})).toBeVisible();expect((await h.get('chequesV2/1180')).status).toBe('presented');expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000)
 await cancel.click();await confirm(page);await expect.poll(async()=>(await h.get('chequesV2/1180')).status).toBe('cancelled');expect((await h.get('cashouts/'+created.cheque.sourceRecordId)).paymentStatus).toBe('cancelled');expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0)
})

test('R06 FT-02 phone receipt survives clock/table refresh and closes with keyboard',async({drill:h})=>{
 const {page}=await h.session('owner',{viewport:{width:390,height:844}});const bill=await h.rpc(page,CLIENT,'call',['finalizePosCheckout',billIntent(h)]),selection={billId:bill.id,returnCondition:'sellable',returnLines:[{lineId:'A',quantity:1}]},q=await h.rpc(page,CLIENT,'call',['quotePosReturn',selection])
 await h.rpc(page,CLIENT,'call',['postPosReturn',{...selection,operationId:crypto.randomUUID(),reason:'Phone receipt persistence fixture',refundMethod:'cash',refundAmountPaise:9000,businessDate:q.businessDate,sourceBillRevision:q.sourceBillRevision,confirmationHash:q.confirmationHash}]);await h.nav(page,'Logs');await page.getByRole('tab',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'View refund receipt',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(bill.receiptNumber)
 await h.db.doc('cashouts/another-view-row').set({date:h.date,paidTo:'Synthetic live row',amount:1,category:'Rent',paymentMode:'Cash',createdAt:new Date().toISOString(),approvedBy:'Drill owner',notes:''})
 for(let s=0;s<32;s++){await page.waitForTimeout(1000);await expect(dialog).toBeVisible()}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'View refund receipt',exact:true})).toBeFocused();expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0)
})

test('R07 FT-06 custom vendor payment correction posts bank/payable delta and recovers the same HTTP result',async({drill:h})=>{
 await bank(h);const {page}=await h.session('owner');await h.rpc(page,FIN,'postFinanceOperation',['vendor-purchase',{id:'custom-invoice',vendorId:'drill-alpha',invoiceNumber:'CUSTOM-1',invoiceDate:h.date,invoiceTotalPaise:100000}]);await h.rpc(page,FIN,'postFinanceOperation',['vendor-payment',{id:'custom-payment',vendorId:'drill-alpha',date:h.date,amountPaise:60000,mode:'bank-transfer'}])
 const intent={operationId:crypto.randomUUID(),id:'custom-correction',sourceRecordId:'custom-payment',expectedRevision:1,proposed:{date:h.date,amountPaise:50000,mode:'bank-transfer',notes:'Independently corrected payment'},reason:'Correct account payment amount',applyImmediately:true}
 const result=await h.rpc(page,CLIENT,'call',['postFinanceOperation',{kind:'vendor-correction',intent}]);expect(result.adjustmentPaise).toBe(10000);expect(result.allocationAdjustment).toBeUndefined();expect(await h.rpc(page,CLIENT,'call',['postFinanceOperation',{kind:'vendor-correction',intent}])).toEqual(result)
 expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(450000);expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(50000);expect((await h.get('invoiceStatesV2/custom-invoice')).openAmountPaise).toBe(100000);expect((await h.get('vendorSettlementsV2/custom-payment')).amountPaise).toBe(60000);expect((await h.get('vendorSettlementStatesV2/custom-payment')).amountPaise).toBe(50000);expect(await h.records('invoiceAllocationsV2')).toEqual([])
})

test('R08 actual five-minute count lease expiry rejects before and allows trusted checkout after elapsed expiry',async({drill:h},info)=>{
 test.setTimeout(400000);info.annotations.push({type:'real-time',description:'Actual elapsed server timestamp lease; no aged seed or mocked clock'})
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB');await h.rpc(b,'/src/features/pos/data/cashierHandoverRepository.ts','reserveCount',[await h.actor(b),'logout']);const saved=await h.db.doc(h.base+'/handover/main').get(),start=saved.get('countReservation.startedAt').toMillis(),intent=billIntent(h)
 expect(await rejected(()=>h.rpc(a,CLIENT,'call',['finalizePosCheckout',intent]))).toMatch(/counting|being counted/i);expect(await h.records(h.base+'/bills')).toEqual([]);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20)
 const remaining=start+300000+1500-Date.now();expect(remaining).toBeGreaterThan(280000);await a.waitForTimeout(remaining);await h.clock(a)
 const bill=await h.rpc(a,CLIENT,'call',['finalizePosCheckout',intent]);expect(bill.totalPaise).toBe(9000);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(19);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(9000);h.evidence.assertions.push({actualStartedAtMs:start,completedAtMs:Date.now(),elapsedMs:Date.now()-start,independentPaise:9000})
})
