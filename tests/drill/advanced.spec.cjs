const {test,expect}=require('./helpers.cjs')
const crypto=require('node:crypto')
const REPO='/src/features/pos/data/posRepository.ts',CLIENT='/tests/drill/client.ts',VENDOR='/src/store/vendorLedgerV2Repository.ts'
async function attempt(action){try{return {ok:true,value:await action()}}catch(error){if(/DRILL_HELPER_|m\[name\].*not a function|Failed to fetch dynamically imported module/.test(error.message))throw error;return {ok:false,error:error.message}}}
async function sale(h,page,patch={},actor){const p=await h.get(h.base+'/products/drill-product-1');return h.rpc(page,REPO,'finalizePosBill',[{businessDate:h.date,lines:[{id:'line-A',kind:'product',productId:p.id,barcode:p.barcode,description:p.name,quantity:2,unitPricePaise:9000,expectedProductRevision:p.revision,stockAtScan:p.currentQuantity}],discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:18000}],...patch},actor||await h.actor(page)])}
async function scan(page,code){const input=page.getByRole('textbox',{name:'Scan barcode or search product name',exact:true});await input.fill(code);await input.press('Enter');await expect(input).toHaveValue('')}
async function request(h,page,bill,type='return',condition='damaged'){return h.rpc(page,REPO,'requestBillAction',[{type,billId:bill.id,reason:'Drill independent return decision',returnCondition:condition,returnLines:[{lineId:'line-A',quantity:1}],refundDate:h.date,refundAmountPaise:9000,refundMethod:'cash'},await h.actor(page)])}

test('SEC-01 actual checkout must reject catalogue price manipulation',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real signed-in repository/Rules posting; valid checkout control shape, forged catalogue price'})
 const {page}=await h.session('billingA');const result=await attempt(()=>sale(h,page,{lines:[{id:'line-A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:1,unitPricePaise:1,expectedProductRevision:1,stockAtScan:20}],payments:[{method:'cash',amountPaise:1}]}));const bills=await h.records(h.base+'/bills');h.evidence.assertions.push({result,bills,independentCataloguePricePaise:9000})
 expect(result.ok).toBe(false);expect(bills).toHaveLength(0);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20)
})
test('SEC-01 actual billing identity must not gain owner discount by payload role',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real billing Auth with actor UID unchanged; forged actor.role and valid-shaped 99% discount'})
 const {page}=await h.session('billingA'),actor={...await h.actor(page),role:'owner'}
 const result=await attempt(()=>sale(h,page,{discount:{mode:'percentage',percentage:99,amountPaise:17820,overrideReason:'Drill forged owner role'},payments:[{method:'cash',amountPaise:180}]},actor));const bills=await h.records(h.base+'/bills');h.evidence.assertions.push({result,bills,independentBillingCapPaise:900});expect(result.ok).toBe(false);expect(bills).toHaveLength(0)
})
test('SEC-01 direct valid source-shaped bill without stock must be rejected',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Direct SDK Rules probe with valid immutable source shapes and native timestamps; no catalogue/stock posting'})
 const {page}=await h.session('billingA'),source=await sale(h,page)
 const result=await attempt(()=>h.rpc(page,CLIENT,'directBillWithoutStock',[source.id,'drill-no-stock-bill']));const bills=await h.records(h.base+'/bills'),stock=await h.get(h.base+'/products/drill-product-1');h.evidence.assertions.push({result,bills,stock,independentQuantityIfTwoBillsPosted:16})
 expect(result.ok).toBe(false);expect(bills).toHaveLength(1);expect(stock.currentQuantity).toBe(18)
})
test('COUNTER-02 exact direct bill control is blocked by live count Rules',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Same direct SDK source-shaped batch as no-lock control, real reservation and actual Rules rejection'})
 const {page}=await h.session('billingA'),source=await sale(h,page),{page:other}=await h.session('billingB'),actor=await h.actor(other);await h.rpc(other,'/src/features/pos/data/cashierHandoverRepository.ts','reserveCount',[actor,'logout'])
 const before=await h.get(h.base+'/handover/main'),result=await attempt(()=>h.rpc(page,CLIENT,'directBillWithoutStock',[source.id,'drill-reserved-bill']));h.evidence.assertions.push({result});expect(result.ok).toBe(false);expect(result.error).toMatch(/permission[-_]denied|insufficient permissions/i);expect(await h.get(h.base+'/bills/drill-reserved-bill')).toBeNull();expect((await h.get(h.base+'/handover/main')).revision).toBe(before.revision);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(18)
})
test('AUD-03 real UI stale physical count rejects a sale after scanning',async({drill:h})=>{
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB');await h.nav(a,'Stock');await a.getByRole('tab',{name:'Stock Audit',exact:true}).click();const scan=a.getByRole('textbox',{name:'Scan audit barcode',exact:true});await scan.fill('00001');await scan.press('Enter');await a.getByRole('spinbutton',{name:'Physical quantity for Drill Product A',exact:true}).fill('17');await a.getByRole('textbox',{name:'Mandatory Audit note',exact:true}).fill('Drill physical count before competing sale')
 await sale(h,b);await a.getByRole('button',{name:'Review & save 1 products',exact:true}).click();await a.getByRole('button',{name:'Confirm and reconcile stock',exact:true}).click();await expect(a.getByText(/stock changed after it was scanned/).first()).toBeVisible();expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(18);expect(await h.records(h.base+'/stockAudits')).toEqual([])
})
test('AUD-02 invalid count and missing cost do not post; supplied cost audited',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real Auth/Rules repository validation and canonical cost/valuation proof'})
 const {page}=await h.session('billingA'),actor=await h.actor(page);await h.db.doc(h.base+'/productCosts/drill-product-1').delete()
 for(const physicalQuantity of [-1,1.5])expect((await attempt(()=>h.rpc(page,REPO,'reconcilePosStockAuditBatch',[[{productId:'drill-product-1',physicalQuantity}],actor,{id:'drill-invalid',note:'Drill invalid count'}]))).ok).toBe(false)
 expect((await attempt(()=>h.rpc(page,REPO,'reconcilePosStockAuditBatch',[[{productId:'drill-product-1',physicalQuantity:17,expectedRevision:1}],actor,{id:'drill-missing-cost',note:'Drill missing cost'}]))).ok).toBe(false)
 expect(await h.records(h.base+'/stockAudits')).toEqual([]);await h.rpc(page,REPO,'reconcilePosStockAuditBatch',[[{productId:'drill-product-1',physicalQuantity:17,expectedRevision:1,suppliedCostPaise:6000}],actor,{id:'drill-cost-proof',note:'Drill supplied independent cost'}]);expect((await h.get(h.base+'/productCosts/drill-product-1')).costPaise).toBe(6000);expect((await h.records(h.base+'/stockAudits'))[0]).toMatchObject({valueImpactPaise:-18000,costSource:'audit-correction'})
})
test('POS-10 POS-11 ACT-02 immediate damaged return, retired void and stale review preserve money exactly once',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Current authenticated callable contract; no owner posting approval, void creation remains retired'})
 const {page}=await h.session('billingA'),bill=await sale(h,page),id=await request(h,page,bill)
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(18)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(9000)
 const before=await h.get(h.base+'/handover/main')
 const retired=await attempt(()=>request(h,page,bill,'void'));expect(retired.ok).toBe(false);expect(retired.error).toMatch(/retired/i)
 const {page:owner}=await h.session('owner'),actor=await h.actor(owner)
 await h.rpc(owner,'/src/features/pos/data/refundRepository.ts','reviewPosReturn',[id,actor])
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(before.cashNetPaise)
 const again=await h.rpc(owner,'/src/features/pos/data/refundRepository.ts','reviewPosReturn',[id,actor]);expect(again).toMatchObject({id});expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(before.cashNetPaise)
 const other=await sale(h,page);const denied=await attempt(()=>request(h,page,other,'void'));expect(denied.ok).toBe(false);expect(denied.error).toMatch(/retired/i)
 expect((await h.get(h.base+'/billStates/'+other.id)).state).toBe('active')
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(16)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(27000)
 expect(await h.records('cashouts')).toHaveLength(1)
})

test('STK-09 unified sale/price/damaged history filters and source details',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page),id=await request(h,page,bill);const {page:owner}=await h.session('owner');await h.rpc(owner,'/src/features/pos/data/refundRepository.ts','reviewPosReturn',[id,await h.actor(owner)]);await h.rpc(page,CLIENT,'call',['changeStockPrices',{operationId:'stock-price-'+crypto.randomUUID(),productId:'drill-product-1',expectedRevision:2,mrpPaise:10000,sellingPricePaise:9500,reason:'Drill traceable price change'}])
 await h.nav(owner,'Stock');await owner.getByRole('tab',{name:'Stock History',exact:true}).click();await expect(owner.locator('tbody tr')).toHaveCount(3);await expect(owner.getByRole('cell',{name:/Damaged return.*no stock change/})).toBeVisible();const rows=await owner.locator('tbody tr').allTextContents();h.evidence.assertions.push({rows});expect(rows[0]).toContain('Stock Price Correction');await owner.getByRole('button',{name:'View',exact:true}).first().click();await expect(owner.getByRole('dialog')).toBeVisible();await owner.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 await owner.getByRole('textbox',{name:'Product / barcode',exact:true}).fill('00001');await expect(owner.locator('tbody tr')).toHaveCount(2);await expect(owner.getByText(/Bill-level damaged returns have no recorded product identifiers/)).toBeVisible();await h.select(owner,'Event type','Sales deductions');await expect(owner.locator('tbody tr')).toHaveCount(1);await expect(owner.locator('tbody tr')).toContainText('-2')
})
test('POS-13 POS-14 stale price after scan and double-click UI exactly once',async({drill:h})=>{
 const {page}=await h.session('billingA'),{page:owner}=await h.session('owner');await scan(page,'00001');await h.rpc(owner,CLIENT,'call',['changeStockPrices',{operationId:'stock-price-'+crypto.randomUUID(),productId:'drill-product-1',expectedRevision:1,mrpPaise:10000,sellingPricePaise:9500,reason:'Drill concurrent price revision'}]);await page.getByRole('button',{name:'Finalize Bill',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/Product updated since scan/})).toBeVisible();expect(await h.records(h.base+'/bills')).toEqual([])
 await page.getByRole('button',{name:'Finalize Bill',exact:true}).dblclick();await expect.poll(async()=>(await h.records(h.base+'/bills')).length).toBe(1);expect((await h.records(h.base+'/bills'))[0].totalPaise).toBe(9500);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(19)
})
test('POS-12 bill history bounded pages unique source and reprint popup',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real UI bill history/receipt HTML; native print/close suppressed only to inspect generated content. Physical printer remains manual.'})
 const {page}=await h.session('billingA');for(let i=0;i<8;i++)await sale(h,page);await page.getByRole('tab',{name:'Bills',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(7);await page.getByRole('button',{name:'Load more',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(8);const rows=await page.locator('tbody tr').allTextContents();expect(new Set(rows).size).toBe(8);await page.context().addInitScript(()=>{window.print=()=>{};window.close=()=>{}});const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Reprint',exact:true}).first().click();const receipt=await popup;await expect(receipt.locator('body')).toContainText('Drill Product A');await receipt.close()
})
test('DASH-02 POS independent cash/UPI/card net dashboard and selectors',async({drill:h})=>{
 const {page}=await h.session('billingA');for(const method of ['cash','upi','card'])await sale(h,page,{payments:[{method,amountPaise:18000}]});await page.getByRole('tab',{name:'Dashboard',exact:true}).click();await expect(page.locator('[aria-label="Net Sales"]')).toContainText('540.00');await expect(page.locator('[aria-label="Bills"]')).toContainText('3');await expect(page.locator('[aria-label="Items Sold"]')).toContainText('6');await page.getByRole('tab',{name:'T-1',exact:true}).click();await expect(page.locator('[aria-label="Net Sales"]')).toContainText('0.00');await page.getByRole('tab',{name:'T',exact:true}).click();await expect(page.locator('[aria-label="Net Sales"]')).toContainText('540.00')
})
test('VEN-06 simultaneous invoice settlement caps without overpayment',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Two independent real Auth/Rules transactions; independent account/invoice/ledger reconciliation'})
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB');await h.rpc(a,VENDOR,'createPurchaseV2',[{id:'drill-purchase',vendorId:'drill-alpha',invoiceNumber:'DRILL-RACE',invoiceDate:h.date,invoiceTotalPaise:100000,actorUserId:'drill-billingA',timestamp:new Date().toISOString()}]);const results=await Promise.all([a,b].map((page,i)=>attempt(()=>h.rpc(page,VENDOR,'createSettlementV2',[{id:'drill-settle-'+i,vendorId:'drill-alpha',invoiceId:'drill-purchase',date:h.date,amountPaise:60000,mode:'cash',actorUserId:'drill-billing'+(i?'B':'A'),timestamp:new Date().toISOString()}]))));expect(results.filter(r=>r.ok)).toHaveLength(1);expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(40000);expect((await h.records('vendorSettlementsV2')).length).toBe(1);expect((await h.get('invoiceStatesV2/drill-purchase')).openAmountPaise).toBe(40000)
})
test('DIR-01 Party Directory add/search/rename preserves financial records',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'Party Directory');await page.getByRole('tab',{name:'Add Party',exact:true}).click();await page.getByRole('textbox',{name:'Party Name',exact:true}).fill('Drill Synthetic Party');await page.getByRole('button',{name:'Save Party',exact:true}).click();await expect(page.getByRole('textbox',{name:'Party Name',exact:true})).toHaveValue('');await page.getByRole('tab',{name:'View Parties',exact:true}).click();await page.getByRole('textbox',{name:'Search',exact:true}).fill('Synthetic');await page.getByRole('button',{name:/Drill Synthetic Party/}).click();await page.getByRole('textbox',{name:'Rename Party',exact:true}).fill('Drill Renamed Party');await page.getByRole('button',{name:'Save Party Name',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Drill Renamed Party');expect(await h.records('sales')).toEqual([]);expect(await h.records('loans')).toEqual([])
})
test('SET-02 live synthetic announcement reaches second session and clears',async({drill:h})=>{
 const {page:owner}=await h.session('owner'),{page:staff}=await h.session('billingA');await h.nav(owner,'Settings');await owner.getByRole('tab',{name:'Announcements',exact:true}).click();await owner.getByRole('textbox',{name:'Title',exact:true}).fill('Drill Local Announcement');await owner.getByRole('textbox',{name:'Message',exact:true}).fill('Synthetic emulator-only notice; no production users.');await owner.getByRole('button',{name:'Publish to active sessions',exact:true}).click();await expect(staff.getByRole('alertdialog')).toContainText('Drill Local Announcement');const stored=await h.get('appMetadata/appSettings');h.evidence.assertions.push({stored});expect(stored).toBeTruthy();await staff.getByRole('button',{name:/Later|Dismiss/}).click();await expect(staff.getByRole('alertdialog')).toHaveCount(0)
})
