const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
async function open(tool,out){
 const lock=path.resolve('output/playwright/.drill-browser-run.lock')
 if(fs.existsSync(lock)){
  const prior=JSON.parse(fs.readFileSync(lock));let alive=false
  try{process.kill(prior.pid,0);alive=true}catch(error){if(error.code!=='ESRCH')throw error}
  if(alive)throw Error('Another browser batch/preview owns the demo fixtures; do not reset it.')
  fs.unlinkSync(lock)
 }
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,runId:process.env.DRILL_RUN_ID,batch:'stock-preview'}),{flag:'wx'})
 process.once('exit',()=>{if(fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock)})
 const admin=require('./safe-admin.cjs');await admin.health();const fixture=await admin.seed()
 const {chromium,expect}=require(path.join(tool,'test')),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-networking']})
 const origins=new Set(['http://127.0.0.1:5178','http://127.0.0.1:9099','http://127.0.0.1:8080','http://127.0.0.1:5001']),proofs=[],blocked=[]
 async function session(role){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage()
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&!origins.has(url.origin)){blocked.push(url.origin+url.pathname);return route.abort('blockedbyclient')}return route.continue()})
  await page.goto('http://127.0.0.1:5178/')
  const proof=await page.evaluate(async()=>{const f=await import('/src/shared/lib/firebase.ts');return {project:f.firebaseConfig.projectId,authHost:f.auth.emulatorConfig?.host,authPort:f.auth.emulatorConfig?.port,firestore:f.db._settings.host,functions:f.functions.emulatorOrigin,bypass:f.isLocalAuthBypassEnabled}})
  expect(proof).toEqual({project:'demo-alphahub-drill',authHost:'127.0.0.1',authPort:9099,firestore:'127.0.0.1:8080',functions:'http://127.0.0.1:5001',bypass:false});proofs.push({role,proof})
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(role.toLowerCase()+'@drill.invalid');await page.getByLabel('Password',{exact:true}).fill(admin.PASSWORD);await page.getByRole('button',{name:'Open Workspace',exact:true}).click()
  await expect(page.getByRole('button',{name:/^Stock(?:\s|$)/}).first()).toBeVisible()
  await page.evaluate(async()=>{const c=await import('/src/shared/lib/serverClock.ts');await c.synchronizeServerClock()})
  return {page,context}
 }
 async function call(page,name,data){return page.evaluate(async({name,data})=>{const c=await import('/tests/drill/client.ts');return c.call(name,data)},{name,data})}
 async function nav(page,label){await page.getByRole('button',{name:new RegExp('^'+label+'(?:\\s|$)')}).first().click()}
 const staff=await session('billingA'),id=randomUUID()
 const draft=await call(staff.page,'saveStockReceiptDraft',{operationId:randomUUID(),id,expectedRevision:0,vendorId:'drill-alpha',invoiceNumber:'LOCAL-REVIEW-STOCK',invoiceDate:admin.date,receiptDate:admin.date,invoiceTotalPaise:100000,lines:[{productId:'drill-product-1',barcode:'00001',productName:'Drill Product A',category:'Drill',quantity:3,unitCostPaise:6000,mrpPaise:10000,sellingPricePaise:10000,expectedRevision:1}]})
 await call(staff.page,'submitStockReceipt',{operationId:randomUUID(),id,expectedRevision:draft.revision})
 await nav(staff.page,'Stock');await staff.page.getByRole('tab',{name:'Stock Audit',exact:true}).click();await staff.page.getByRole('textbox',{name:'Scan audit barcode',exact:true}).fill('00001');await staff.page.getByRole('button',{name:'Scan',exact:true}).click()
 await staff.page.getByRole('spinbutton',{name:'Physical quantity for Drill Product A',exact:true}).fill('22');await staff.page.getByRole('textbox',{name:'Mandatory Audit note',exact:true}).fill('Local synthetic review: audit acknowledgement recovery')
 let dropped=false
 await staff.context.route('**/asia-south1/postStockAuditGroup',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;const response=await route.fetch({maxRedirects:0});expect(response.status()).toBe(200);return route.abort('failed')}return route.continue()})
 await staff.page.getByRole('button',{name:'Review & save 1 products',exact:true}).click();await staff.page.getByRole('button',{name:'Confirm and reconcile stock',exact:true}).click();await expect(staff.page.getByRole('button',{name:'Recover stock operation',exact:true})).toBeVisible()
 const owner=await session('owner');await nav(owner.page,'Action Centre');await owner.page.getByRole('button',{name:'View Details',exact:true}).first().click();await expect(owner.page.getByRole('heading',{name:'Stock Price Change',exact:true})).toBeVisible()
 await owner.page.screenshot({path:path.join(out,'review-owner-price-desktop.png'),fullPage:true});await staff.page.screenshot({path:path.join(out,'review-audit-recovery-desktop.png'),fullPage:true})
 const product=await admin.get(admin.base+'/products/drill-product-1');expect(product.currentQuantity).toBe(22);expect(product.sellingPricePaise).toBe(10000)
 fs.writeFileSync(path.join(out,'stock-preview.json'),JSON.stringify({openedAt:new Date().toISOString(),project:admin.PROJECT,fixture,proofs,blocked,receiptId:id,product,expected:{received3:23,auditCount22:22,afterReceiptReversal:19,fullInvoicePaise:100000,sellingBeforePaise:9000,sellingAfterPaise:10000,auditNetPaise:-6000},review:'Owner price source review + billing audit recovery. Recovery must not repost the committed count; Resume finishes it.'},null,2))
 console.log('Guarded local Stock review open: owner price review and billing audit recovery. Synthetic quantity22, pending owner price change, audit group already committed. No production connection.')
 await new Promise(resolve=>browser.on('disconnected',resolve))
}
module.exports={open}
