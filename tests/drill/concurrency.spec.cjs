const {test,expect}=require('./helpers.cjs')
const {forgedCheckout}=require('./payloads.cjs')
const {Timestamp}=require('node:module').createRequire(require('node:path').resolve('functions/package.json'))('firebase-admin/firestore')
const REPO='/src/features/pos/data/posRepository.ts',HAND='/src/features/pos/data/cashierHandoverRepository.ts',CLIENT='/tests/drill/client.ts'
async function attempt(action){try{return {ok:true,value:await action()}}catch(error){if(/DRILL_HELPER_|m\[name\].*not a function|Failed to fetch dynamically imported module/.test(error.message))throw error;return {ok:false,error:error.message}}}
async function submit(h,page,reservation,kind='logout',amountPaise=100000){return h.rpc(page,HAND,'submitHandover',[await h.actor(page),kind,{'500':Math.floor(amountPaise/50000)},amountPaise%50000,0,0,reservation.revision,h.date,'Drill count',reservation.id])}
test('COUNTER-01 first opening once and independent staff joins',async({drill:h})=>{
 await h.seed('closed')
 const {page:a}=await h.session('billingA',{gate:false});await a.getByRole('button',{name:'Open Counter',exact:true}).click();await expect(a.getByRole('heading',{name:'Open Shared Counter',exact:true})).toBeVisible()
 await a.getByRole('button',{name:'Start Opening Count',exact:true}).click();const opening=a.getByRole('dialog')
 await opening.getByRole('spinbutton',{name:/500.*count/}).fill('2');await opening.getByRole('textbox',{name:/Other loose coins/}).fill('0');await opening.getByRole('textbox',{name:/machine UPI/}).fill('0');await opening.getByRole('textbox',{name:/machine card/}).fill('0');await opening.getByRole('button',{name:/Save.*count.*continue/i}).click();await expect(a.getByRole('dialog')).toHaveCount(0)
 const {page:b}=await h.session('billingB');await h.nav(b,'POS')
 const ledger=await h.get(h.base+'/handover/main'),states=await h.records(h.base+'/cashierStates')
 expect((await h.records(h.base+'/reconciliations')).length).toBe(1);expect(ledger.counterSession.status).toBe('open');expect(states.every(s=>s.joinedCounterId===ledger.counterSession.openingReconciliationId)).toBe(true)
 const second=await attempt(async()=>h.rpc(b,HAND,'reserveCount',[await h.actor(b),'login']));expect(second.ok).toBe(false)
})
test('COUNTER-02 COUNTER-03 SEC-04 simultaneous reservations and server bill prohibition',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Independent real Auth contexts + Rules API reservation race and forged valid-shaped bill batch'})
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB'),actorA=await h.actor(a),actorB=await h.actor(b)
 const outcomes=await Promise.all([attempt(()=>h.rpc(a,HAND,'reserveCount',[actorA,'logout'])),attempt(()=>h.rpc(b,HAND,'reserveCount',[actorB,'logout']))])
 expect(outcomes.filter(o=>o.ok)).toHaveLength(1)
 const ledger=await h.get(h.base+'/handover/main'),who=ledger.countReservation.uid,loser=who==='drill-billingA'?b:a,uid=who==='drill-billingA'?'drill-billingB':'drill-billingA'
 const forged=await attempt(async()=>h.rpc(loser,CLIENT,'batch',[await forgedCheckout(h,uid)]));expect(forged.ok).toBe(false);expect(forged.error).toMatch(/permission[-_]denied|insufficient permissions/i);expect(await h.get(h.base+'/bills/drill-forged-bill')).toBeNull()
 const unrelated=await attempt(async()=>h.rpc(loser,HAND,'releaseCount',[await h.actor(loser),ledger.countReservation.id]));expect(unrelated.ok).toBe(false)
 const {page:owner}=await h.session('owner');await h.rpc(owner,HAND,'releaseCount',[await h.actor(owner),ledger.countReservation.id]);expect((await h.get(h.base+'/handover/main')).countReservation).toBeNull()
})
test('COUNTER-04 COUNTER-05 expiry rejects stale count and refresh retains reservation',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real reservation/refresh plus explicitly aged synthetic server-start fixture; not five-minute real-time acceptance'})
 const {page}=await h.session('billingA');const actor=await h.actor(page),reservation=await h.rpc(page,HAND,'reserveCount',[actor,'logout'])
 await page.reload();await h.clock(page);expect((await h.get(h.base+'/handover/main')).countReservation.id).toBe(reservation.id)
 await h.db.doc(h.base+'/handover/main').update({'countReservation.startedAt':Timestamp.fromMillis(Date.now()-300001)})
 const stale=await attempt(()=>submit(h,page,reservation));expect(stale.ok).toBe(false);expect(await h.records(h.base+'/reconciliations')).toEqual([])
 const next=await h.rpc(page,HAND,'reserveCount',[actor,'logout']);expect(next.id).not.toBe(reservation.id)
})
test('COUNTER-06 mandatory UI logout count with discrepancy, counter stays open',async({drill:h})=>{
 const {page}=await h.session('billingA');await page.getByRole('button',{name:'Log out',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Logout Count',exact:true})).toBeVisible()
 await dialog.getByRole('spinbutton',{name:/500.*count/}).fill('2');await dialog.getByRole('textbox',{name:/Other loose coins/}).fill('5');await dialog.getByRole('textbox',{name:/machine UPI/}).fill('0');await dialog.getByRole('textbox',{name:/machine card/}).fill('0')
 await dialog.getByRole('button',{name:/Save.*Count/i}).click();await expect(page.getByRole('button',{name:/Drill billingA/}).filter({hasText:'billinga@drill.invalid'})).toBeVisible()
 const counts=await h.records(h.base+'/reconciliations');expect(counts).toHaveLength(1);expect(counts[0]).toMatchObject({actual:{cash:100500,upi:0,card:0},expected:{cash:100000,upi:0,card:0},delta:{cash:500,upi:0,card:0},hasDiscrepancy:true,reviewStatus:'pending',uid:'drill-billingA'})
 expect((await h.get(h.base+'/handover/main')).counterSession.status).toBe('open');expect((await h.get(h.base+'/cashierStates/drill-billingA')).closed).toBe(true)
})
test('POS-07 AUD-03 concurrent sale revisions prevent silent stock overwrite',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Independent Auth contexts with real repository transactions and canonical quantity/revision proof'})
 const {page:a}=await h.session('billingA'),{page:b}=await h.session('billingB')
 const input={businessDate:h.date,lines:[{id:'line-A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:9000,expectedProductRevision:1,stockAtScan:20}],discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:18000}]}
 const actors=await Promise.all([h.actor(a),h.actor(b)])
 const outcomes=await Promise.all([attempt(()=>h.rpc(a,REPO,'finalizePosBill',[input,actors[0]])),attempt(()=>h.rpc(b,REPO,'finalizePosBill',[input,actors[1]]))])
 expect(outcomes.filter(o=>o.ok)).toHaveLength(1);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(18);expect((await h.records(h.base+'/bills')).length).toBe(1)
 const stockBeforeCount=await h.get(h.base+'/products/drill-product-1');expect(stockBeforeCount.currentQuantity).toBe(18)
 const count=await h.rpc(a,REPO,'reconcilePosStockAuditBatch',[[{productId:'drill-product-1',physicalQuantity:17,expectedRevision:stockBeforeCount.revision}],actors[0],{id:'drill-concurrent-audit',note:'Drill post-sale count'}]);h.evidence.assertions.push({count})
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(17);expect((await h.records(h.base+'/stockAudits'))[0].systemQuantityBefore).toBe(18)
})
test('SEC-01 forged bill discount/price without stock source must be rejected',async({drill:h})=>{
 const {page}=await h.session('billingA'),records=await forgedCheckout(h)
 const result=await attempt(()=>h.rpc(page,CLIENT,'batch',[records]));const saved=await h.get(h.base+'/bills/drill-forged-bill'),product=await h.get(h.base+'/products/drill-product-1');h.evidence.assertions.push({result,saved,product,independentAllowedDiscountPaise:500})
 expect(result.ok).toBe(false);expect(saved).toBeNull();expect(product.currentQuantity).toBe(20)
})
