const {test,expect}=require('./helpers.cjs')
const {randomUUID}=require('node:crypto'),path=require('node:path')
const CLIENT='/tests/drill/client.ts',REPO='/src/features/pos/data/posRepository.ts'
const endpoint='http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/postPosReturn'
const output=name=>path.resolve('output/playwright',process.env.DRILL_RUN_ID,name)
async function call(h,page,name,data){return h.rpc(page,CLIENT,'call',[name,data])}
async function rejected(action){try{await action();return null}catch(e){if(/DRILL_HELPER_|not a function|Failed to fetch dynamically imported/.test(e.message))throw e;return e.message}}
async function sale(h,page,quantity=2,method='cash',extra={}){
 const p=await h.get(h.base+'/products/drill-product-1')
 return call(h,page,'finalizePosCheckout',{operationId:randomUUID(),businessDate:h.date,lines:[{id:'A',kind:'product',productId:p.id,barcode:p.barcode,description:p.name,quantity,unitPricePaise:p.sellingPricePaise,expectedProductRevision:p.revision,stockAtScan:p.currentQuantity}],discount:{mode:'none',amountPaise:0},payments:[{method,amountPaise:p.sellingPricePaise*quantity}],...extra})
}
async function intent(h,page,bill,quantity=1,condition='sellable'){
 const selection={billId:bill.id,returnLines:[{lineId:bill.lines[0].id,quantity}],returnCondition:condition},q=await call(h,page,'quotePosReturn',selection)
 return {...selection,operationId:randomUUID(),reason:'Synthetic customer item return',refundMethod:'cash',refundAmountPaise:q.refundPaise,sourceBillRevision:q.sourceBillRevision,businessDate:q.businessDate,confirmationHash:q.confirmationHash}
}
async function snapshot(h){const out={};for(const c of ['products','billStates','bills','stockMovements','approvals','events','refundStates','refundDays','handover'])out[c]=(await h.records(h.base+'/'+c)).sort((a,b)=>a.id.localeCompare(b.id));out.expenses=(await h.records('cashouts')).sort((a,b)=>a.id.localeCompare(b.id));return out}
async function unchanged(h,action,pattern){const before=await snapshot(h);expect(await rejected(action)).toMatch(pattern);expect(await snapshot(h)).toEqual(before)}
async function openReturn(h,page){await h.nav(page,'POS');await page.getByRole('tab',{name:'Bills',exact:true}).click();await page.getByRole('button',{name:'Return items',exact:true}).first().click();await expect(page.getByRole('spinbutton',{name:'Return quantity for Drill Product A',exact:true})).toBeVisible()}
async function fillReturn(page,quantity=1){await page.getByRole('spinbutton',{name:'Return quantity for Drill Product A',exact:true}).fill(String(quantity));await expect(page.getByRole('textbox',{name:'Refund amount',exact:true})).toHaveValue((quantity*90).toFixed(2));await page.getByRole('textbox',{name:'Mandatory return reason',exact:true}).fill('Synthetic customer return');await page.getByRole('button',{name:'Complete return',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm cash return',exact:true})).toBeEnabled()}

test('B3-01 actual staff return UI caps quantity, auto-refunds90 and posts stock/cash/expense immediately',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page)
 await openReturn(h,page);const qty=page.getByRole('spinbutton',{name:'Return quantity for Drill Product A',exact:true})
 await expect(qty).toHaveAttribute('max','2');await qty.fill('3');await expect(page.getByRole('alert')).toContainText('remaining billed');await expect(page.getByRole('button',{name:'Complete return',exact:true})).toBeDisabled()
 await fillReturn(page);await expect(page.getByRole('textbox',{name:'Refund amount',exact:true})).toHaveAttribute('readonly','')
 await page.screenshot({path:output('refund-confirm-desktop.png'),fullPage:true});await page.getByRole('button',{name:'Confirm cash return',exact:true}).click()
 await expect.poll(async()=>(await h.records(h.base+'/approvals')).length).toBe(1)
 const r=(await h.records(h.base+'/approvals'))[0];expect(r).toMatchObject({status:'posted',ownerReviewStatus:'pending',postedByUid:'drill-billingA',refundAmountPaise:9000,refundMethod:'cash'})
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(19);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(9000)
 expect(await h.get('cashouts/'+r.expenseId)).toMatchObject({amount:90,amountPaise:9000,sourceKind:'pos-return',postedByUid:'drill-billingA',approvedBy:''})
 expect(await h.get(h.base+'/bills/'+bill.id)).toMatchObject({totalPaise:18000,lines:bill.lines})
 await openReturn(h,page);await expect(qty).toHaveAttribute('max','1');await expect(page.getByText('Billed 2 · Returned 1 · Available 1')).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click()
 h.evidence.assertions.push({independent:{netCashPaise:9000,stock:19,cashExpensePaise:9000,allowance:1}})
})

test('B3-02 owner notification review is acknowledgement only; original staff and manager permissions',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page),r=await call(h,page,'postPosReturn',await intent(h,page,bill))
 await unchanged(h,()=>call(h,page,'reviewPosReturn',{operationId:randomUUID(),returnId:r.id}),/account cannot/)
 const {page:owner}=await h.session('owner');await h.nav(owner,'Action Centre');await expect(owner.getByRole('tab',{name:/Pending/})).toContainText('1')
 await owner.getByRole('button',{name:/View Details/}).first().click();await expect(owner.getByRole('button',{name:'Mark Reviewed',exact:true})).toBeVisible()
 await owner.setViewportSize({width:1280,height:585});const returnedRow=owner.getByRole('row').filter({hasText:'Drill Product A'});await expect(returnedRow).toContainText('₹90');await expect(returnedRow.getByRole('cell',{name:'1',exact:true})).toBeVisible();expect((await returnedRow.boundingBox()).height).toBeGreaterThan(20);await owner.getByRole('button',{name:'View cash expense',exact:true}).click();await expect(owner.getByText(/POS Refund/).last()).toBeVisible()
 const before=await snapshot(h);await owner.screenshot({path:output('owner-return-review.png'),fullPage:true});await owner.getByRole('button',{name:'Mark Reviewed',exact:true}).click()
 await expect.poll(async()=>(await h.get(h.base+'/approvals/'+r.id)).ownerReviewStatus).toBe('reviewed')
 const after=await snapshot(h);delete before.approvals;delete after.approvals;expect(after).toEqual(before)
 await call(h,owner,'reviewPosReturn',{operationId:randomUUID(),returnId:r.id});const again=await snapshot(h);delete again.approvals;expect(again).toEqual(before)
})

test('B3-03 independent terminals race; changed payload/actor and stale return quote reject unchanged',async({drill:h})=>{
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB'),bill=await sale(h,a),ia=await intent(h,a,bill,2),ib=await intent(h,b,bill,2)
 const results=await Promise.allSettled([call(h,a,'postPosReturn',ia),call(h,b,'postPosReturn',ib)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
 const winner=results[0].status==='fulfilled'?{page:a,data:ia,result:results[0].value}:{page:b,data:ib,result:results[1].value}
 const before=await snapshot(h);expect(await call(h,winner.page,'postPosReturn',winner.data)).toEqual(winner.result);expect(await snapshot(h)).toEqual(before)
 await unchanged(h,()=>call(h,winner.page,'postPosReturn',{...winner.data,reason:'Changed intent'}),/different actor or intent/)
 await unchanged(h,()=>call(h,winner.page===a?b:a,'postPosReturn',winner.data),/different actor or intent/)
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0);expect(await h.records('cashouts')).toHaveLength(1)
})

test('B3-04 lost acknowledgement and refresh recover same refund once, with visible phone recovery',async({drill:h})=>{
 const {page}=await h.session('billingA');await sale(h,page);await openReturn(h,page);await fillReturn(page)
 await page.route(endpoint,async route=>{if(route.request().method()!=='POST')return route.fallback();const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);h.evidence.assertions.push({lostRefundAcknowledgement:true,result:await response.json()});await route.abort('failed')})
 await page.getByRole('button',{name:'Confirm cash return',exact:true}).click();await expect(page.getByRole('button',{name:'Recover refund operation',exact:true})).toBeEnabled()
 const original=(await h.records(h.base+'/approvals'))[0],before=await snapshot(h)
 await page.unroute(endpoint);await page.reload();await h.nav(page,'POS');await expect(page.getByRole('button',{name:'Recover refund operation',exact:true})).toBeVisible()
 const stored=await page.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.startsWith('alphahub:refund:v1:')));expect(JSON.parse(stored[1]).input.operationId).toBe(original.id)
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output('refund-recovery-phone.png'),fullPage:true});await page.getByRole('button',{name:'Recover refund operation',exact:true}).click();await expect(page.getByRole('button',{name:'Recover refund operation',exact:true})).toHaveCount(0)
 expect(await snapshot(h)).toEqual(before);expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('alphahub:refund:v1:')))).toEqual([])
})

for(const method of ['cash','upi','card','split'])test(`B3-05 original ${method} pays refund cash without reversing UPI/card`,async({drill:h})=>{
 const {page}=await h.session('manager'),payments=method==='split'?[{method:'cash',amountPaise:6000},{method:'upi',amountPaise:7000},{method:'card',amountPaise:5000}]:[{method,amountPaise:18000}],bill=await sale(h,page,2,'cash',{payments}),before=await h.get(h.base+'/handover/main')
 const r=await call(h,page,'postPosReturn',await intent(h,page,bill)),after=await h.get(h.base+'/handover/main')
 expect(after.cashNetPaise).toBe(before.cashNetPaise-9000);expect(after.dailyTotals).toEqual(before.dailyTotals);expect((await h.get('cashouts/'+r.expenseId)).amountPaise).toBe(9000)
})

test('B3-06 direct counterfeit stock/refund/void/expense writes, forged amount and old void APIs reject unchanged',async({drill:h})=>{
 const {page}=await h.session('owner'),bill=await sale(h,page),data=await intent(h,page,bill)
 await unchanged(h,()=>call(h,page,'postPosReturn',{...data,refundAmountPaise:18000}),/quote or counter changed/)
 await unchanged(h,()=>call(h,page,'postPosReturn',{operationId:randomUUID(),type:'void'}),/void.*retired/i)
 const actor=await h.actor(page)
 await unchanged(h,()=>h.rpc(page,REPO,'requestBillAction',[{billId:bill.id,type:'void',reason:'Old hidden void path'},actor]),/void.*retired/i)
 await unchanged(h,()=>h.rpc(page,REPO,'approvePosRequest',['absent',actor]),/retired/i)
 for(const [p,value,mode] of [[h.base+'/products/drill-product-1',{currentQuantity:120},'update'],[h.base+'/approvals/void',{type:'void',status:'pending'},'set'],[h.base+'/events/fake',{type:'bill-return-approved',actorUid:'drill-owner',refundAmountPaise:500000},'set'],['cashouts/pos-refund-forged',{amount:5000,paymentMode:'Cash'},'set']])await unchanged(h,()=>h.rpc(page,CLIENT,'write',[p,value,mode]),/permissions|permission[-_]denied/i)
})

test('B3-07 bill eye and row open read-only details with keyboard/phone dismissal and original receipt',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page);await call(h,page,'postPosReturn',await intent(h,page,bill));await h.nav(page,'POS');await page.getByRole('tab',{name:'Bills',exact:true}).click()
 const eye=page.getByRole('button',{name:'View bill '+bill.receiptNumber,exact:true});await eye.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByRole('cell',{name:'1',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm cash return',exact:true})).toHaveCount(0)
 await page.screenshot({path:output('bill-view-desktop.png'),fullPage:true});await page.keyboard.press('Escape');await expect(eye).toBeFocused()
 const row=page.getByRole('row').filter({has:eye});await row.focus();await row.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape')
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'View bill '+bill.receiptNumber,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:output('bill-view-phone.png'),fullPage:true});await page.getByRole('button',{name:'Close',exact:true}).click()
})

test('B3-08 Cashout gross180, refund90, expense90, drawer1090 and net sales90 reconcile once',async({drill:h})=>{
 const {page}=await h.session('owner'),bill=await sale(h,page);await call(h,page,'postPosReturn',await intent(h,page,bill));await h.nav(page,'Cashout')
 await expect(page.getByLabel('Gross cash collections (before refunds)',{exact:true})).toHaveValue('180');await expect(page.getByLabel('Cash Paid Out (source-linked)',{exact:true})).toHaveValue('90')
 await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'Loose change (₹)',exact:true}).fill('90');await expect(page.getByLabel('Drawer Total',{exact:true})).toHaveValue('1090')
 await page.screenshot({path:output('refund-cashout.png'),fullPage:true,timeout:45000,animations:'disabled'});await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const closing=(await h.records('dailyCashouts'))[0];expect(closing).toMatchObject({cashSales:180,returns:90,cashExpense:90,drawerTotal:1090,refundAccountingVersion:1,posCashRefundPaise:9000,cashRemovedPaise:109000,closingDrawerPaise:0,auditDifference:0})
 expect((await h.get(h.base+'/handover/main')).checkpoint.cashActualPaise).toBe(0);const sales=(await h.records('sales'))[0];expect(sales).toMatchObject({totalSales:180,netSalesAmount:90,returnsDiscounts:90,refundAccountingVersion:1})
 expect(await h.records('cashouts')).toHaveLength(1);h.evidence.assertions.push({independent:{openingPaise:100000,gross:18000,refund:9000,drawer:109000,netSales:9000},closing,sales})
 await expect.poll(async()=>{try{return await h.rpc(page,REPO,'getPosCashoutPaymentMix',[h.date,true])}catch(e){if(!/Cash activity changed while loading totals/.test(e.message))throw e;return null}}).toMatchObject({billCount:0,refundPaise:0,accounting:{linkedCashRefundPaise:0,windowRefundPaise:0,grossMethods:{cash:0}}})
})

test('B3-09 live count rejects server refund unchanged; cancellation permits fresh quote and logout count remains required',async({drill:h})=>{
 const {page}=await h.session('billingA'),{page:other}=await h.session('billingB'),bill=await sale(h,page),actor=await h.actor(other),counter='/src/features/pos/data/cashierHandoverRepository.ts'
 const reservation=await h.rpc(other,counter,'reserveCount',[actor,'logout']);const data=await intent(h,page,bill)
 await unchanged(h,()=>call(h,page,'postPosReturn',data),/counting/);await h.rpc(other,counter,'releaseCount',[actor,reservation.id]);await call(h,page,'postPosReturn',await intent(h,page,bill))
 expect((await h.get(h.base+'/cashierStates/drill-billingA')).needsLogoutCheck).toBe(true)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(9000)
})

test('B3-10 zero-value damaged return, all staff identity gates and empty/fractional/foreign quantities',async({drill:h})=>{
 const {page}=await h.session('billingA');await call(h,page,'changeStockPrices',{operationId:'stock-price-'+randomUUID(),productId:'drill-product-1',expectedRevision:1,mrpPaise:0,sellingPricePaise:0,reason:'Synthetic zero-price item'})
 const bill=await sale(h,page),data=await intent(h,page,bill,1,'damaged')
 for(const lines of [[],[{lineId:'A',quantity:0}],[{lineId:'A',quantity:0.5}],[{lineId:'foreign',quantity:1}],[{lineId:'A',quantity:1},{lineId:'A',quantity:1}]])await unchanged(h,()=>call(h,page,'postPosReturn',{...data,returnLines:lines}),/Select|quantity|original|duplicate|once|Invalid|whole/i)
 for(const role of ['disabled','missing','unauthenticated']){const {page:denied}=await h.session(role,{gate:false});if(role!=='unauthenticated')await expect.poll(async()=>(await h.rpc(denied,CLIENT,'authIdentity')).uid).toBe('drill-'+role);await unchanged(h,()=>call(h,denied,'postPosReturn',data),/account cannot|Sign in|unauthenticated/i)}
 const before=await h.records(h.base+'/stockMovements'),r=await call(h,page,'postPosReturn',data);expect(r).toMatchObject({refundAmountPaise:0,expenseId:null});expect(await h.records('cashouts')).toEqual([]);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(18);expect(await h.records(h.base+'/stockMovements')).toEqual(before)
})

test('B3-11 original discounted bill refunds integer paise independent of current catalogue',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page,2,'cash',{discount:{mode:'percentage',percentage:5,amountPaise:900},payments:[{method:'cash',amountPaise:17100}]})
 await call(h,page,'changeStockPrices',{operationId:'stock-price-'+randomUUID(),productId:'drill-product-1',expectedRevision:2,mrpPaise:10000,sellingPricePaise:9500,reason:'Synthetic price changed after sale'})
 const d=await intent(h,page,bill);expect(d.refundAmountPaise).toBe(8550);await call(h,page,'postPosReturn',d);expect((await h.get(h.base+'/products/drill-product-1')).sellingPricePaise).toBe(9500);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(8550)
 await call(h,page,'postPosReturn',await intent(h,page,bill));expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0);expect((await h.records('cashouts')).reduce((s,e)=>s+e.amountPaise,0)).toBe(17100)
})

test('B3-12 200-line trusted checkout and cash return preserve source and restore200 deltas exactly once',async({drill:h})=>{
 const {page}=await h.session('billingA'),prototype=await h.get(h.base+'/products/drill-product-1'),b=h.db.batch(),lines=[]
 for(let i=0;i<200;i++){const id='return-limit-'+i,barcode='RET'+i;b.set(h.db.doc(h.base+'/products/'+id),{...prototype,id,barcode,name:'Return limit '+i,currentQuantity:10,sellingPricePaise:100,revision:1});lines.push({id:'L'+i,kind:'product',productId:id,barcode,description:'Return limit '+i,quantity:1,unitPricePaise:100,expectedProductRevision:1,stockAtScan:10})}await b.commit()
 const bill=await call(h,page,'finalizePosCheckout',{operationId:randomUUID(),businessDate:h.date,lines,discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:20000}]}),selection={billId:bill.id,returnCondition:'sellable',returnLines:bill.lines.map(l=>({lineId:l.id,quantity:1}))},q=await call(h,page,'quotePosReturn',selection),data={...selection,operationId:randomUUID(),reason:'Synthetic200-line return',refundMethod:'cash',refundAmountPaise:20000,sourceBillRevision:q.sourceBillRevision,businessDate:q.businessDate,confirmationHash:q.confirmationHash}
 const result=await call(h,page,'postPosReturn',data);expect(await call(h,page,'postPosReturn',data)).toEqual(result);expect(await h.records(h.base+'/stockMovements')).toHaveLength(400);expect((await h.records(h.base+'/products')).filter(p=>p.id.startsWith('return-limit-')).every(p=>p.currentQuantity===10&&p.revision===3)).toBe(true);expect(await h.records('cashouts')).toHaveLength(1);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0);expect((await h.get(h.base+'/bills/'+bill.id)).lines).toEqual(bill.lines)
})

test('B3-13 quoted refund rejects a concurrent catalogue revision and still refunds original90 on fresh quote',async({drill:h})=>{
 const {page}=await h.session('billingA'),{page:other}=await h.session('manager'),bill=await sale(h,page),stale=await intent(h,page,bill)
 await call(h,other,'changeStockPrices',{operationId:'stock-price-'+randomUUID(),productId:'drill-product-1',expectedRevision:2,mrpPaise:10000,sellingPricePaise:9500,reason:'Synthetic competing stock edit'})
 await unchanged(h,()=>call(h,page,'postPosReturn',stale),/quote or counter changed/);const fresh=await intent(h,page,bill);expect(fresh.refundAmountPaise).toBe(9000);await call(h,page,'postPosReturn',fresh);expect((await h.get(h.base+'/products/drill-product-1')).sellingPricePaise).toBe(9500)
})

test('B3-14 closed and reopened counter windows do not double-refund or duplicate gross sales',async({drill:h})=>{
 const {page}=await h.session('owner'),actor=await h.actor(page),bill=await sale(h,page);await call(h,page,'postPosReturn',await intent(h,page,bill))
 async function close(change){await h.nav(page,'Cashout');await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill(change===90?'2':'1');await page.getByRole('spinbutton',{name:'Loose change (₹)',exact:true}).fill(String(change));await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click()}
 await close(90);await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1);const first=(await h.records('dailyCashouts'))[0],counter='/src/features/pos/data/cashierHandoverRepository.ts'
 const closedIntent=await intent(h,page,bill)
 await unchanged(h,()=>call(h,page,'postPosReturn',closedIntent),/Open the current/)
 const reservation=await h.rpc(page,counter,'reserveCount',[actor,'login']);await h.rpc(page,counter,'submitHandover',[actor,'login',{'500':2},0,0,0,reservation.revision,h.date,'Synthetic reopen1000 counted',reservation.id])
 await call(h,page,'postPosReturn',await intent(h,page,bill));const mix=await h.rpc(page,REPO,'getPosCashoutPaymentMix',[h.date,true]);expect(mix).toMatchObject({billCount:0,refundPaise:9000,accounting:{linkedCashRefundPaise:9000,grossMethods:{cash:0}}})
 await close(410);await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(2);expect(await h.get('dailyCashouts/'+first.id)).toEqual(first)
 const closings=await h.records('dailyCashouts');expect(closings.reduce((s,e)=>s+e.cashSales,0)).toBe(180);expect(closings.reduce((s,e)=>s+e.returns,0)).toBe(180);expect(closings.reduce((s,e)=>s+e.drawerTotal,0)).toBe(2000)
 expect((await h.records('sales'))[0]).toMatchObject({totalSales:180,netSalesAmount:0,returnsDiscounts:180});expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20)
})

test('B3-15 another staff member refunds and continues billing before review, then completes mandatory logout count',async({drill:h})=>{
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB'),bill=await sale(h,a)
 expect((await h.get(h.base+'/cashierStates/drill-billingB')).lastBillId).toBe('')
 const returned=await call(h,b,'postPosReturn',await intent(h,b,bill));expect((await h.get(h.base+'/cashierStates/drill-billingB')).lastBillId).toBe('')
 const next=await sale(h,b,1);expect(next.createdByUid).toBe('drill-billingB');expect((await h.get(h.base+'/approvals/'+returned.id)).ownerReviewStatus).toBe('pending')
 await b.getByRole('button',{name:'Log out',exact:true}).click();const dialog=b.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Logout Count',exact:true})).toBeVisible();await dialog.getByRole('spinbutton',{name:/500.*count/}).fill('2');await dialog.getByRole('textbox',{name:/Other loose coins/}).fill('180');await dialog.getByRole('textbox',{name:/machine UPI/}).fill('0');await dialog.getByRole('textbox',{name:/machine card/}).fill('0');await dialog.getByRole('button',{name:/Save.*Count/i}).click()
 await expect.poll(async()=>(await h.get(h.base+'/cashierStates/drill-billingB')).closed).toBe(true);expect((await h.get(h.base+'/handover/main')).counterSession.status).toBe('open');expect((await h.records(h.base+'/reconciliations'))[0]).toMatchObject({uid:'drill-billingB',actual:{cash:118000},expected:{cash:118000},hasDiscrepancy:false});expect((await h.get(h.base+'/approvals/'+returned.id)).ownerReviewStatus).toBe('pending')
})

test('B3-16 prior-month original UPI bill pays current-day cash and leaves old source/day evidence untouched',async({drill:h})=>{
 const stamp='2026-09-30T17:30:00.000Z',bill={id:'historic-september',receiptNumber:'SYNTHETIC-SEP-001',businessDate:'2026-09-30',createdAt:stamp,createdByUid:'drill-billingA',createdByName:'Drill billingA',status:'finalized',lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:9000}],subtotalPaise:18000,discount:{mode:'none',amountPaise:0},totalPaise:18000,payments:[{method:'upi',amountPaise:18000}]},b=h.db.batch()
 b.set(h.db.doc(h.base+'/bills/'+bill.id),bill);b.set(h.db.doc(h.base+'/billStates/'+bill.id),{billId:bill.id,state:'active',revision:1});b.update(h.db.doc(h.base+'/products/drill-product-1'),{currentQuantity:18,revision:2});b.update(h.db.doc(h.base+'/handover/main'),{'dailyTotals.2026-09-30':{upi:18000,card:0}});await b.commit()
 const {page}=await h.session('billingA'),before=await h.get(h.base+'/handover/main'),r=await call(h,page,'postPosReturn',await intent(h,page,bill))
 expect(r).toMatchObject({refundDate:h.date,refundMethod:'cash',sourceBillCreatedAt:stamp,refundAmountPaise:9000});expect(await h.get(h.base+'/bills/'+bill.id)).toEqual(bill);expect((await h.get(h.base+'/handover/main')).dailyTotals).toEqual(before.dailyTotals);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(-9000);expect((await h.get('cashouts/'+r.expenseId)).date).toBe(h.date)
})

test('B3-17 recovery survives account switch and storage rejection sends no financial request',async({drill:h})=>{
 const {page}=await h.session('billingA'),bill=await sale(h,page),d=await intent(h,page,bill),actor=await h.actor(page),module='/src/features/pos/data/refundRepository.ts'
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('alphahub:refund:'))throw new DOMException('Synthetic storage full','QuotaExceededError');return original.call(this,key,value)};window.__drillStorageRestore=()=>{Storage.prototype.setItem=original}})
 await unchanged(h,()=>h.rpc(page,module,'postPosReturn',[d,actor]),/Synthetic storage full/);expect(h.evidence.requests.filter(r=>r.url.endsWith('/postPosReturn'))).toHaveLength(0);await page.evaluate(()=>window.__drillStorageRestore())
 await page.route(endpoint,async route=>{if(route.request().method()!=='POST')return route.fallback();const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);await route.abort('failed')})
 expect(await rejected(()=>h.rpc(page,module,'postPosReturn',[d,actor]))).toMatch(/internal|unavailable|fetch|network/i);await page.unroute(endpoint);const before=await snapshot(h)
 await h.rpc(page,CLIENT,'restoreAccount',['billingb@drill.invalid',h.PASSWORD]);await unchanged(h,()=>h.rpc(page,module,'recoverRefund',[actor]),/original account/)
 expect((await h.rpc(page,module,'pendingRefund',[actor.id])).input.operationId).toBe(d.operationId)
 await h.rpc(page,CLIENT,'restoreAccount',['billinga@drill.invalid',h.PASSWORD]);const recovered=await h.rpc(page,module,'recoverRefund',[actor]);expect(recovered.id).toBe(d.operationId);expect(await snapshot(h)).toEqual(before);expect(await h.rpc(page,module,'pendingRefund',[actor.id])).toBeNull()
})

test('B3-18 independent299-paise legacy mixed bill labels unmapped stock and restores only mapped unit',async({drill:h})=>{
 const bill={id:'legacy299',receiptNumber:'SYNTHETIC-299',businessDate:h.date,createdAt:new Date().toISOString(),status:'finalized',subtotalPaise:300,discount:{mode:'amount',amountPaise:1},totalPaise:299,payments:[{method:'cash',amountPaise:299}],lines:[{id:'A',kind:'temporary',description:'Historical unmapped',quantity:2,unitPricePaise:100},{id:'B',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:1,unitPricePaise:100}]},batch=h.db.batch()
 batch.set(h.db.doc(h.base+'/bills/'+bill.id),bill);batch.set(h.db.doc(h.base+'/billStates/'+bill.id),{billId:bill.id,state:'active',revision:1});batch.update(h.db.doc(h.base+'/products/drill-product-1'),{currentQuantity:19,revision:2});batch.update(h.db.doc(h.base+'/handover/main'),{cashNetPaise:299});await batch.commit()
 const {page}=await h.session('billingA');await openReturn(h,page);await expect(page.getByText('Historical unmapped item: No stock record')).toBeVisible();await page.getByRole('spinbutton',{name:'Return quantity for Historical unmapped',exact:true}).fill('1');await page.getByRole('spinbutton',{name:'Return quantity for Drill Product A',exact:true}).fill('1');await expect(page.getByRole('textbox',{name:'Refund amount',exact:true})).toHaveValue('1.99');await page.getByRole('textbox',{name:'Mandatory return reason',exact:true}).fill('Synthetic independent299-paise proportional discount');await page.getByRole('button',{name:'Complete return',exact:true}).click();await page.getByRole('button',{name:'Confirm cash return',exact:true}).click();await expect.poll(async()=>(await h.records(h.base+'/approvals')).length).toBe(1)
 expect((await h.records('cashouts'))[0].amountPaise).toBe(199);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(100);expect((await h.records(h.base+'/stockMovements'))[0].quantityDelta).toBe(1)
 const d=await intent(h,page,bill,1);expect(d.refundAmountPaise).toBe(100);await call(h,page,'postPosReturn',d);expect((await h.records('cashouts')).reduce((s,e)=>s+e.amountPaise,0)).toBe(299);expect(await h.records(h.base+'/stockMovements')).toHaveLength(1);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0)
 await h.nav(page,'Stock');await page.getByRole('tab',{name:'Stock History',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(2);const unmapped=page.getByRole('row').filter({hasText:'Historical unmapped return'});await expect(unmapped).toContainText('No stock record');await unmapped.getByRole('button',{name:'View',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('SYNTHETIC-299');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('textbox',{name:'Product / barcode',exact:true}).fill('00001');await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('B3-19 paise refund closes1001.99 and protected source totals survive a physical-count correction',async({drill:h})=>{
 const bill={id:'legacy398',receiptNumber:'SYNTHETIC-398',businessDate:h.date,createdAt:new Date().toISOString(),status:'finalized',subtotalPaise:398,discount:{mode:'none',amountPaise:0},totalPaise:398,payments:[{method:'cash',amountPaise:398}],lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:199}]},batch=h.db.batch()
 batch.set(h.db.doc(h.base+'/bills/'+bill.id),bill);batch.set(h.db.doc(h.base+'/billStates/'+bill.id),{billId:bill.id,state:'active',revision:1});batch.update(h.db.doc(h.base+'/products/drill-product-1'),{currentQuantity:18,revision:2});batch.update(h.db.doc(h.base+'/handover/main'),{cashNetPaise:398});await batch.commit()
 const {page}=await h.session('owner'),r=await call(h,page,'postPosReturn',await intent(h,page,bill));expect(r.refundAmountPaise).toBe(199);await h.nav(page,'Cashout');await expect(page.getByLabel('Gross cash collections (before refunds)',{exact:true})).toHaveValue('3.98');await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'Loose change (₹)',exact:true}).fill('1.99');await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const closing=(await h.records('dailyCashouts'))[0],before=await snapshot(h);expect(closing).toMatchObject({drawerTotal:1001.99,cashRemovedPaise:100199,returns:1.99,cashExpense:1.99,refundAccountingVersion:1,posCashRefundPaise:199,auditDifference:0})
 await h.nav(page,'Logs');await page.getByRole('tab',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'View refund receipt',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(bill.receiptNumber);await page.getByRole('button',{name:'Close',exact:true}).click()
 await page.getByRole('tab',{name:'Daily Cashouts',exact:true}).click();await page.getByRole('button',{name:'Edit cashout',exact:true}).first().click();await expect(page.getByRole('spinbutton',{name:'Returns',exact:true})).toHaveAttribute('readonly','');await expect(page.getByRole('spinbutton',{name:'Change',exact:true})).toHaveValue('1.99');await expect(page.getByRole('spinbutton',{name:'Change',exact:true})).toHaveAttribute('step','0.01')
 await expect(page.getByRole('spinbutton',{name:'Cash Expense',exact:true})).toHaveAttribute('readonly','');await page.getByRole('spinbutton',{name:'Change',exact:true}).fill('2.99');await page.getByRole('textbox',{name:'Reason For Correction',exact:true}).fill('Synthetic physical count correction, linked source totals retained');await page.getByRole('button',{name:'Apply Owner Correction',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'Confirm Cashout edit'});await expect(confirmation.getByRole('button',{name:'OK',exact:true})).toBeDisabled();await confirmation.getByLabel('Type CONFIRM to proceed').fill('CONFIRM');await confirmation.getByRole('button',{name:'OK',exact:true}).click();await expect.poll(async()=>(await h.get('dailyCashouts/'+closing.id)).revision).toBe(2)
 const changed=await h.get('dailyCashouts/'+closing.id);expect(changed).toMatchObject({returns:1.99,cashExpense:1.99,posCashRefundPaise:199,financeQuoteId:closing.financeQuoteId,drawerTotal:1002.99});expect(await snapshot(h)).toEqual(before);expect((await h.records('sales'))[0]).toMatchObject({totalSales:3.98,netSalesAmount:1.99,returnsDiscounts:1.99})
})

test('B3-20 independent paise Cashout correction preserves source history despite blocked receipt viewer',async({drill:h})=>{
 const bill={id:'legacy398',receiptNumber:'SYNTHETIC-398',businessDate:h.date,createdAt:new Date().toISOString(),status:'finalized',subtotalPaise:398,discount:{mode:'none',amountPaise:0},totalPaise:398,payments:[{method:'cash',amountPaise:398}],lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:199}]},batch=h.db.batch()
 batch.set(h.db.doc(h.base+'/bills/'+bill.id),bill);batch.set(h.db.doc(h.base+'/billStates/'+bill.id),{billId:bill.id,state:'active',revision:1});batch.update(h.db.doc(h.base+'/products/drill-product-1'),{currentQuantity:18,revision:2});batch.update(h.db.doc(h.base+'/handover/main'),{cashNetPaise:398});await batch.commit()
 const {page}=await h.session('owner'),r=await call(h,page,'postPosReturn',await intent(h,page,bill));expect(r.refundAmountPaise).toBe(199);await h.nav(page,'Cashout');await expect(page.getByLabel('Gross cash collections (before refunds)',{exact:true})).toHaveValue('3.98');await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'Loose change (₹)',exact:true}).fill('1.99');await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const closing=(await h.records('dailyCashouts'))[0],before=await snapshot(h);expect(closing).toMatchObject({drawerTotal:1001.99,cashRemovedPaise:100199,returns:1.99,cashExpense:1.99,refundAccountingVersion:1,posCashRefundPaise:199,auditDifference:0})
 await h.nav(page,'Logs') // Receipt viewer remains separately failing B3-19/F45-13; this case isolates the financial correction.
 await page.getByRole('tab',{name:'Daily Cashouts',exact:true}).click();await page.getByRole('button',{name:'Edit cashout',exact:true}).first().click();await expect(page.getByRole('spinbutton',{name:'Returns',exact:true})).toHaveAttribute('readonly','');await expect(page.getByRole('spinbutton',{name:'Change',exact:true})).toHaveValue('1.99');await expect(page.getByRole('spinbutton',{name:'Change',exact:true})).toHaveAttribute('step','0.01')
 await expect(page.getByRole('spinbutton',{name:'Cash Expense',exact:true})).toHaveAttribute('readonly','');await page.getByRole('spinbutton',{name:'Change',exact:true}).fill('2.99');await page.getByRole('textbox',{name:'Reason For Correction',exact:true}).fill('Synthetic physical count correction, linked source totals retained');await page.getByRole('button',{name:'Apply Owner Correction',exact:true}).click();const confirmation=page.getByRole('dialog',{name:'Confirm Cashout edit'});await expect(confirmation.getByRole('button',{name:'OK',exact:true})).toBeDisabled();await confirmation.getByLabel('Type CONFIRM to proceed').fill('CONFIRM');await confirmation.getByRole('button',{name:'OK',exact:true}).click();await expect.poll(async()=>(await h.get('dailyCashouts/'+closing.id)).revision).toBe(2)
 const changed=await h.get('dailyCashouts/'+closing.id);expect(changed).toMatchObject({returns:1.99,cashExpense:1.99,posCashRefundPaise:199,financeQuoteId:closing.financeQuoteId,drawerTotal:1002.99});expect(await snapshot(h)).toEqual(before);expect((await h.records('sales'))[0]).toMatchObject({totalSales:3.98,netSalesAmount:1.99,returnsDiscounts:1.99})
})
