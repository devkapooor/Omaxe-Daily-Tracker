const { test, expect } = require('./helpers.cjs')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const CLIENT = '/tests/drill/client.ts', POST = '/src/features/stock/data/stockPostingRepository.ts'
const call = (h, page, name, input) => h.rpc(page, CLIENT, 'call', [name, input])
const attempt = async fn => { try { return { ok: true, value: await fn() } } catch (e) { if (/DRILL_HELPER_|not a function|Failed to fetch dynamically/.test(e.message)) throw e; return { ok: false, message: e.message } } }
function draft(h, id = randomUUID(), line = {}) { return { operationId: randomUUID(), id, expectedRevision: 0, vendorId: 'drill-alpha', invoiceNumber: 'STOCK-ACCEPT-1', invoiceDate: h.date, receiptDate: h.date, invoiceTotalPaise: 100000, lines: [{ productId: 'drill-product-1', barcode: '00001', productName: 'Drill Product A', category: 'Drill', quantity: 3, unitCostPaise: 6000, mrpPaise: 10000, sellingPricePaise: 9000, expectedRevision: 1, ...line }] } }
async function receive(h, page, input = draft(h)) { const saved = await call(h, page, 'saveStockReceiptDraft', input), intent = { operationId: randomUUID(), id: saved.id, expectedRevision: saved.revision }; return { saved, intent, result: await call(h, page, 'submitStockReceipt', intent) } }
async function reverse(h, page, id) { const preview = await call(h, page, 'previewStockReceiptReversal', { id }); return call(h, page, 'reverseStockReceipt', { operationId: randomUUID(), id, reason: 'Synthetic reversal acceptance', expectedRevision: preview.expectedRevision, confirmationHash: preview.confirmationHash }) }
async function stockSnapshot(h) {
  const result = {}
  for (const collection of ['products','productCosts','stockMovements','goodsReceipts','stockAudits','stockAuditBatches','stockOperations','stockPriceChanges']) result[collection] = (await h.records(h.base+'/'+collection)).sort((a,b)=>a.id.localeCompare(b.id))
  for (const collection of ['purchasesV2','invoiceStatesV2','vendorAccountStatesV2','vendorLedgerEntriesV2','invoiceReservationsV2']) result[collection] = (await h.records(collection)).sort((a,b)=>a.id.localeCompare(b.id))
  return result
}
test('B2-03 B2-04 trusted partial receipts reconcile stock and one full payable', async ({drill:h}) => {
  const {page}=await h.session('billingA'), original=await receive(h,page), partial=await receive(h,page,draft(h,undefined,{quantity:2,expectedRevision:2}))
  expect(original.result).toMatchObject({totalPaise:100000,payableCreated:true}); expect(partial.result.payableCreated).toBe(false)
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(25)
  expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(100000)
  expect(await h.records('purchasesV2')).toHaveLength(1); expect(await h.records(h.base+'/stockMovements')).toHaveLength(2)
  expect(await call(h,page,'submitStockReceipt',partial.intent)).toEqual(partial.result)
})
test('B2-02 authentication roles, malformed intent and cross-actor replay reject with no effects',async({drill:h})=>{
  const {page}=await h.session('billingA'), {page:manager}=await h.session('manager'), {page:anonymous}=await h.session('unauthenticated',{gate:false})
  const input=draft(h), before=await stockSnapshot(h)
  expect((await attempt(()=>call(h,anonymous,'saveStockReceiptDraft',input))).ok).toBe(false)
  expect((await attempt(()=>call(h,page,'saveStockReceiptDraft',{...input,actor:{role:'owner'}}))).ok).toBe(false)
  expect(await stockSnapshot(h)).toEqual(before)
  const saved=await call(h,page,'saveStockReceiptDraft',input)
  expect((await attempt(()=>call(h,manager,'saveStockReceiptDraft',input))).ok).toBe(false)
  expect((await attempt(()=>call(h,manager,'previewStockReceiptReversal',{id:saved.id}))).ok).toBe(false)
  expect(await h.records('purchasesV2')).toHaveLength(0)
})
test('B2-05 real partial payment and owner reversal preserve original payment and credit40000',async({drill:h})=>{
  const {page}=await h.session('billingA'), r=await receive(h,page), actor=await h.actor(page)
  await h.rpc(page,'/src/store/vendorLedgerV2Repository.ts','createSettlementV2',[{id:'stock-payment',vendorId:'drill-alpha',date:h.date,amountPaise:40000,mode:'cash',invoiceId:r.result.purchaseId,actorUserId:actor.id,timestamp:new Date().toISOString()}])
  expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(60000)
  const {page:owner}=await h.session('owner'); await reverse(h,owner,r.saved.id)
  expect(await h.get('vendorAccountStatesV2/drill-alpha')).toMatchObject({outstandingPaise:0,vendorCreditPaise:40000})
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20)
  expect(await h.records('vendorSettlementsV2')).toHaveLength(1);expect(await h.records('purchasesV2')).toHaveLength(1)
})
test('B2-07 stale catalogue rejects complete receipt; mixed forged SDK writes remain unchanged',async({drill:h})=>{
  const {page}=await h.session('billingA'), saved=await call(h,page,'saveStockReceiptDraft',draft(h))
  await call(h,page,'changeStockPrices',{operationId:'stock-price-'+randomUUID(),productId:'drill-product-1',expectedRevision:1,mrpPaise:10000,sellingPricePaise:9500,reason:'Synthetic concurrent price correction'})
  const before=await stockSnapshot(h)
  expect((await attempt(()=>call(h,page,'submitStockReceipt',{operationId:randomUUID(),id:saved.id,expectedRevision:1}))).ok).toBe(false)
  expect((await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/productCosts/drill-product-1',{costPaise:1,updatedByUid:'drill-billingA'},'update']))).ok).toBe(false)
  expect(await stockSnapshot(h)).toEqual(before)
})
test('B2-08 B2-09 owner review retains latest price; price history finds one GRN source row',async({drill:h})=>{
  const {page}=await h.session('billingA'), r=await receive(h,page,draft(h,undefined,{sellingPricePaise:10000}))
  const review=(await h.records(h.base+'/stockPriceChanges'))[0];expect(review).toMatchObject({sourceRecordId:r.saved.id,sourceKind:'goods-receipt',actorUid:'drill-billingA',reviewStatus:'pending',before:{sellingPricePaise:9000},after:{sellingPricePaise:10000}})
  await call(h,page,'changeStockPrices',{operationId:'stock-price-'+randomUUID(),productId:'drill-product-1',expectedRevision:2,mrpPaise:10000,sellingPricePaise:9500,reason:'Later correction must survive owner review'})
  const {page:owner}=await h.session('owner');await call(h,owner,'reviewStockPriceChange',{id:review.id})
  expect((await h.get(h.base+'/products/drill-product-1')).sellingPricePaise).toBe(9500)
  const entries=await owner.evaluate(async({date})=>{const m=await import('/src/features/stock/data/stockHistoryRepository.ts');return (await m.createStockHistoryPager({from:date,to:date,identifier:'00001',identifierMode:'barcode',event:'prices',undated:false}).next()).items},{date:h.date})
  expect(entries.filter(e=>e.goodsReceiptId===r.saved.id)).toHaveLength(1);expect(entries).toHaveLength(2)
})
test('B2-10 B2-11 audit manifest replays group after refresh and server derives totals',async({drill:h})=>{
  const {page}=await h.session('billingA'), id='AUD-DRILL-'+randomUUID(), begin={operationId:randomUUID(),id,note:'Synthetic independent shelf count',counts:[{productId:'drill-product-1',expectedRevision:1,physicalQuantity:17}]}, group={operationId:randomUUID(),id,groupIndex:0}
  await call(h,page,'beginStockAudit',begin); const result=await call(h,page,'postStockAuditGroup',group)
  await page.reload();await expect(page.getByRole('button',{name:/^Stock(?:\s|$)/}).first()).toBeVisible();await h.clock(page)
  expect(await call(h,page,'postStockAuditGroup',group)).toEqual(result)
  await call(h,page,'finishStockAudit',{operationId:randomUUID(),id,interrupted:false})
  expect(await h.get(h.base+'/stockAuditBatches/'+id)).toMatchObject({itemCount:1,adjustedItemCount:1,netValuePaise:-18000})
  expect(await h.records(h.base+'/stockAudits')).toHaveLength(1);expect(await h.records(h.base+'/stockMovements')).toHaveLength(1)
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(17)
})
test('B2-12 concurrent independent terminals share one new barcode identity',async({drill:h})=>{
  const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB'),input={barcode:'036000291452',name:'Synthetic shared barcode',sellingPricePaise:1200}
  const result=await Promise.all([call(h,a,'createStockProduct',{...input,operationId:randomUUID()}),call(h,b,'createStockProduct',{...input,barcode:'0036000291452',operationId:randomUUID()})])
  expect(result[0].id).toBe(result[1].id);expect(result[0].currentQuantity).toBe(0)
  expect((await h.records(h.base+'/products')).filter(p=>p.name===input.name)).toHaveLength(1)
})
test('B2-15 B2-18 real Receive Stock UI posts canonical receipt and opens source',async({drill:h})=>{
  const {page}=await h.session('billingA');await h.nav(page,'Stock');await page.getByRole('tab',{name:'Receive Stock',exact:true}).click()
  await page.getByPlaceholder('Choose vendor').click();await page.getByRole('option',{name:'Drill Alpha Vendor',exact:true}).click()
  await page.getByRole('textbox',{name:'Vendor invoice number',exact:true}).fill('UI-STOCK-RECEIPT')
  await page.getByRole('textbox',{name:'Scan product barcode',exact:true}).fill('00001');await page.getByRole('button',{name:'Scan item',exact:true}).click()
  await page.getByRole('spinbutton',{name:'Received quantity for Drill Product A',exact:true}).fill('3')
  await page.getByRole('textbox',{name:'Selling price for Drill Product A',exact:true}).fill('90')
  await page.getByRole('spinbutton',{name:'Full invoice payable',exact:true}).fill('1000')
  await page.getByRole('button',{name:'Submit GRN',exact:true}).click()
  await page.getByRole('button',{name:'Confirm GRN submission',exact:true}).click()
  await expect.poll(async()=>(await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(23)
  await page.getByRole('tab',{name:'GRN History',exact:true}).click();await page.getByRole('button',{name:'View',exact:true}).first().click()
  await expect(page.getByRole('heading',{name:/GRN/}).last()).toBeVisible()
  await page.screenshot({path:path.resolve('output/playwright',process.env.DRILL_RUN_ID,'receive-stock-desktop.png'),fullPage:true})
})
test('B2-06 B2-18 lost real submit acknowledgement preserves ID across refresh and recovery',async({drill:h})=>{
  const {page,context}=await h.session('billingA'),actor=await h.actor(page),saved=await call(h,page,'saveStockReceiptDraft',draft(h))
  await h.nav(page,'Stock');await page.getByRole('tab',{name:'Receive Stock',exact:true}).click()
  let lost=false
  await context.route('**/asia-south1/submitStockReceipt',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);return route.abort('failed')}return route.continue()})
  expect((await attempt(()=>h.rpc(page,POST,'submitStockReceipt',[saved.id,actor]))).ok).toBe(false)
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(23)
  const pending=await h.rpc(page,POST,'pendingStockOperation',[actor.id]);expect(pending.input.id).toBe(saved.id)
  await page.reload();await h.clock(page);await h.nav(page,'Stock');await page.getByRole('tab',{name:'Receive Stock',exact:true}).click()
  await expect(page.getByRole('button',{name:'Recover stock operation',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Recover stock operation',exact:true}).click()
  await expect.poll(()=>h.rpc(page,POST,'pendingStockOperation',[actor.id])).toBeNull()
  expect(await h.records('purchasesV2')).toHaveLength(1);expect(await h.records(h.base+'/stockMovements')).toHaveLength(1)
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(23)
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve('output/playwright',process.env.DRILL_RUN_ID,'stock-recovered-phone.png'),fullPage:true})
})
test('B2-01 B2-19 direct source-shaped stock and control writes are denied for every role',async({drill:h})=>{
  const before=await stockSnapshot(h)
  for(const role of ['owner','manager','billingA']){
    const {page}=await h.session(role),uid='drill-'+role
    for(const collection of ['products','productCosts','goodsReceipts','stockAudits','stockAuditBatches','stockOperations','stockAuditManifests','barcodeReservations','stockPriceChanges']){
      expect((await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/'+collection+'/forged-'+role,{id:'forged-'+role,actorUid:uid,createdByUid:uid,updatedByUid:uid,revision:1,currentQuantity:0,sellingPricePaise:0,createdFromPosBarcode:true,active:true,name:'Forged',category:'Uncategorized',barcode:'FORGED'}]))).ok).toBe(false)
    }
    expect((await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/products/drill-product-1',{sellingPricePaise:1,sourceValues:{'Printed MRP':'0.01'},revision:2,updatedByUid:uid},'update']))).ok).toBe(false)
    expect((await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/products/drill-product-1',{},'delete']))).ok).toBe(false)
    expect((await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/events/forged-'+role,{type:'goods-receipt-submitted',actorUid:uid}]))).ok).toBe(false)
  }
  expect(await stockSnapshot(h)).toEqual(before)
})
test('B2-11 B2-18 real Audit UI recovers a committed group after refresh and finishes once',async({drill:h})=>{
  const {page,context}=await h.session('billingA');await h.nav(page,'Stock');await page.getByRole('tab',{name:'Stock Audit',exact:true}).click()
  await page.getByRole('textbox',{name:'Scan audit barcode',exact:true}).fill('00001');await page.getByRole('button',{name:'Scan',exact:true}).click()
  await page.getByRole('spinbutton',{name:'Physical quantity for Drill Product A',exact:true}).fill('17');await page.getByRole('textbox',{name:'Mandatory Audit note',exact:true}).fill('Synthetic shelf count with lost response')
  let lost=false
  await context.route('**/asia-south1/postStockAuditGroup',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);return route.abort('failed')}return route.continue()})
  await page.getByRole('button',{name:'Review & save 1 products',exact:true}).click();await page.getByRole('button',{name:'Confirm and reconcile stock',exact:true}).click()
  await expect(page.getByRole('button',{name:'Recover stock operation',exact:true})).toBeVisible()
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(17)
  await page.reload();await h.clock(page);await h.nav(page,'Stock');await page.getByRole('tab',{name:'Stock Audit',exact:true}).click()
  await page.getByRole('button',{name:'Recover stock operation',exact:true}).click();await expect(page.getByRole('button',{name:'Recover stock operation',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Resume audit',exact:true}).click();await expect(page.getByRole('button',{name:'Resume audit',exact:true})).toHaveCount(0)
  const batches=await h.records(h.base+'/stockAuditBatches');expect(batches).toHaveLength(1);expect(batches[0]).toMatchObject({status:'completed',itemCount:1,netValuePaise:-18000})
  expect(await h.records(h.base+'/stockAudits')).toHaveLength(1);expect(await h.records(h.base+'/stockMovements')).toHaveLength(1)
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve('output/playwright',process.env.DRILL_RUN_ID,'stock-audit-recovered-phone.png'),fullPage:true})
})
test('B2-06 lost draft acknowledgement retains source identity and survives account permission interruption',async({drill:h})=>{
  const {page,context}=await h.session('billingA'),actor=await h.actor(page),input=draft(h)
  const {operationId:_operationId,...form}=input;void _operationId
  let lost=false
  await context.route('**/asia-south1/saveStockReceiptDraft',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);return route.abort('failed')}return route.continue()})
  expect((await attempt(()=>h.rpc(page,POST,'saveStockReceiptDraft',[form,actor]))).ok).toBe(false)
  const pending=await h.rpc(page,POST,'pendingStockOperation',[actor.id]);expect(pending.input.id).toBe(input.id)
  await h.db.doc('users/'+actor.id).update({disabled:true})
  expect((await attempt(()=>h.rpc(page,POST,'recoverStockOperation',[actor]))).ok).toBe(false)
  expect((await h.rpc(page,POST,'pendingStockOperation',[actor.id])).input.operationId).toBe(pending.input.operationId)
  await h.db.doc('users/'+actor.id).update({disabled:false})
  await h.rpc(page,CLIENT,'restoreAccount',['billinga@drill.invalid',h.PASSWORD])
  await h.rpc(page,POST,'recoverStockOperation',[actor]);expect(await h.rpc(page,POST,'pendingStockOperation',[actor.id])).toBeNull()
  expect(await h.records(h.base+'/goodsReceipts')).toHaveLength(1);expect(await h.records(h.base+'/stockMovements')).toHaveLength(0);expect(await h.records('purchasesV2')).toHaveLength(0)
})
test('B2-15 stale GRN confirmation cannot silently submit a newer owner-edited draft',async({drill:h})=>{
  const {page}=await h.session('billingA');await h.nav(page,'Stock');await page.getByRole('tab',{name:'Receive Stock',exact:true}).click()
  await page.getByPlaceholder('Choose vendor').click();await page.getByRole('option',{name:'Drill Alpha Vendor',exact:true}).click();await page.getByRole('textbox',{name:'Vendor invoice number',exact:true}).fill('STALE-REVIEW')
  await page.getByRole('textbox',{name:'Scan product barcode',exact:true}).fill('00001');await page.getByRole('button',{name:'Scan item',exact:true}).click();await page.getByRole('spinbutton',{name:'Received quantity for Drill Product A',exact:true}).fill('3');await page.getByRole('textbox',{name:'Selling price for Drill Product A',exact:true}).fill('90');await page.getByRole('spinbutton',{name:'Full invoice payable',exact:true}).fill('1000')
  await page.getByRole('button',{name:'Submit GRN',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm GRN submission',exact:true})).toBeVisible()
  const source=(await h.records(h.base+'/goodsReceipts'))[0],{page:owner}=await h.session('owner')
  await call(h,owner,'saveStockReceiptDraft',{...draft(h,source.id,{quantity:9}),expectedRevision:1,invoiceNumber:'STALE-REVIEW'})
  await page.getByRole('button',{name:'Confirm GRN submission',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/source revision changed/}).first()).toBeVisible()
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20);expect(await h.records('purchasesV2')).toHaveLength(0);expect((await h.get(h.base+'/goodsReceipts/'+source.id)).status).toBe('draft')
})
test('B2-05 B2-18 owner reversal UI exposes exact effects and keeps historical sources',async({drill:h})=>{
  const {page:staff}=await h.session('billingA'),r=await receive(h,staff,draft(h,undefined,{sellingPricePaise:10000}))
  const {page}=await h.session('owner',{viewport:{width:390,height:844}});await h.nav(page,'Stock');await page.getByRole('tab',{name:'GRN History',exact:true}).click();await page.getByRole('button',{name:'Reverse',exact:true}).first().click()
  const modal=page.getByRole('dialog',{name:'Reverse GRN',exact:true});await expect(modal.getByText(/Quantity 23 → 20/)).toBeInViewport();await expect(modal.getByText(/Receipt-owned prices will be restored/)).toBeVisible()
  await page.screenshot({path:path.resolve('output/playwright',process.env.DRILL_RUN_ID,'stock-reversal-phone.png'),fullPage:true})
  await modal.getByRole('textbox',{name:'Reason for reversal',exact:true}).fill('Synthetic owner confirmed reversal');await modal.getByRole('button',{name:'Confirm reversal',exact:true}).click()
  await expect.poll(async()=>(await h.get(h.base+'/goodsReceipts/'+r.saved.id)).status).toBe('reversed')
  expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(20);expect((await h.get(h.base+'/products/drill-product-1')).sellingPricePaise).toBe(9000);expect(await h.records('purchasesV2')).toHaveLength(1)
  expect((await h.records(h.base+'/stockPriceChanges')).filter(change=>change.sourceKind==='goods-receipt-reversal')).toHaveLength(1)
})
