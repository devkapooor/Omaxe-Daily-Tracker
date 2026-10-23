const {test,expect}=require('./helpers.cjs')
const crypto=require('node:crypto')
const CLIENT='/tests/drill/client.ts',REPO='/src/features/pos/data/posRepository.ts',VENDOR='/src/store/vendorLedgerV2Repository.ts'
async function attempt(action){try{return {ok:true,value:await action()}}catch(error){if(/DRILL_HELPER_|m\[name\].*not a function|Failed to fetch dynamically imported module/.test(error.message))throw error;return {ok:false,error:error.message}}}
async function purchase(h,page,amount=100000){return h.rpc(page,VENDOR,'createPurchaseV2',[{id:'drill-purchase',vendorId:'drill-alpha',invoiceNumber:'DRILL-API-INVOICE',invoiceDate:h.date,invoiceTotalPaise:amount,notes:'Drill payable',actorUserId:(await h.actor(page)).id,timestamp:new Date().toISOString()}])}
test('AUTH-04 remembered account focus, switching and refresh',async({drill:h})=>{
 await h.seed('closed')
 const {page}=await h.session('owner',{gate:false});await expect(page.getByRole('button',{name:'Log out',exact:true})).toBeVisible();await h.clock(page);await page.reload();await expect(page.getByRole('button',{name:'Log out',exact:true})).toBeVisible();await h.clock(page);await page.getByRole('button',{name:'Log out',exact:true}).click()
 const card=page.getByRole('button').filter({hasText:'owner@drill.invalid'});await expect(card).toBeVisible();await card.click();await expect(page.getByLabel('Password',{exact:true})).toBeFocused()
 const stored=await page.evaluate(()=>Object.entries(localStorage));expect(JSON.stringify(stored)).not.toContain(h.PASSWORD)
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Use another account',exact:true}).click();await page.getByRole('textbox',{name:'Email',exact:true}).fill('manager@drill.invalid');await page.getByLabel('Password',{exact:true}).fill(h.PASSWORD);await page.getByRole('button',{name:'Open Workspace',exact:true}).click()
 await expect(page.getByRole('button',{name:/^Stock\s/}).first()).toBeVisible();expect(await page.getByRole('button',{name:/^Logs\s/}).count()).toBe(0)
})
test('AUTH-05 password reset and own password stay local',async({drill:h})=>{
 const {page:login}=await h.session('unauthenticated');await login.getByRole('textbox',{name:'Email',exact:true}).fill('owner@drill.invalid');await login.getByRole('button',{name:'Forgot password?',exact:true}).click();await expect(login.getByText(/If an account exists/)).toBeVisible()
 const oob=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-alphahub-drill/oobCodes')).json();expect(oob.oobCodes.some(c=>c.email==='owner@drill.invalid'&&c.requestType==='PASSWORD_RESET')).toBe(true)
 const {page}=await h.session('owner');await h.nav(page,'Settings');await page.getByRole('tab',{name:'Update Password',exact:true}).click();await page.getByLabel('New Password',{exact:true}).fill('DrillChanged123!');await page.getByRole('button',{name:'Save Password',exact:true}).click();await expect(page.getByLabel('New Password',{exact:true})).toHaveValue('')
 const signin=async password=>fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=drill-emulator-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@drill.invalid',password,returnSecureToken:true})})
 expect((await signin(h.PASSWORD)).status).toBe(400);expect((await signin('DrillChanged123!')).status).toBe(200)
})
test('AUTH-06 owner creates staff with local secondary Auth and retains the primary session',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'Settings');await page.getByRole('textbox',{name:'Staff Name',exact:true}).fill('Drill New Staff');await page.getByRole('textbox',{name:'Email Address',exact:true}).fill('newstaff@drill.invalid');await page.getByRole('textbox',{name:'Mobile Number',exact:true}).fill('9990000002');await page.getByLabel('Password',{exact:true}).fill(h.PASSWORD);await page.getByRole('button',{name:'Create User',exact:true}).click()
 await expect.poll(async()=>(await h.auth.listUsers()).users.length).toBe(7)
 const created=(await h.auth.listUsers()).users.find(u=>u.email==='newstaff@drill.invalid');expect(created).toBeTruthy()
 await expect.poll(async()=>(await h.get('users/'+created.uid))?.name).toBe('Drill New Staff')
 expect((await h.get('users/'+created.uid))).toMatchObject({disabled:false,approvalStatus:'approved'})
 expect((await h.actor(page)).id).toBe('drill-owner')
 expect(h.evidence.blocked.filter(r=>r.url.includes('identitytoolkit.googleapis.com'))).toEqual([])
 expect(h.evidence.requests.some(r=>r.url.includes('127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp'))).toBe(true)
 const {page:staff}=await h.session('manager');await h.nav(staff,'Settings');expect(await staff.getByRole('button',{name:'Create User',exact:true}).count()).toBe(0)
 const denied=await attempt(()=>h.rpc(staff,CLIENT,'write',['users/forged-staff',{name:'Forged',role:'billing',disabled:false}]));expect(denied.ok).toBe(false);expect(await h.get('users/forged-staff')).toBeNull()
})

test('AUTH-07 SEC-05 FIN-08 restricted navigation, direct permission matrix and read-only Loans',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real UI navigation and Auth/Rules read/write denials; loans are read-only and empty'})
 const {page:owner}=await h.session('owner');await h.nav(owner,'Loans');await expect(owner.getByRole('heading',{name:/Loans/}).first()).toBeVisible();expect(await h.rpc(owner,CLIENT,'list',['loans'])).toEqual([])
 for(const role of ['manager','billingA']){
  const {page}=await h.session(role)
  for(const key of ['loans','actions','logs','dashboard']){await page.evaluate(k=>localStorage.setItem('alphahub.active-page',k),key);await page.reload();await expect(page.getByRole('heading',{name:'POS',exact:true})).toBeVisible()}
  const uid='drill-'+role,profile=await h.get('users/'+uid)
  const escalation=await attempt(()=>h.rpc(page,CLIENT,'write',['users/'+uid,{...profile,role:'owner'},'update']));expect(escalation.ok).toBe(false);expect((await h.get('users/'+uid)).role).toBe(role==='manager'?'manager':'billing')
  for(const source of ['loans','posSandboxes/test/stockPriceChanges']){const denied=await attempt(()=>h.rpc(page,CLIENT,'list',[source]));expect(denied.ok).toBe(false)}
 }
 expect(await h.records('loans')).toEqual([])
})
test('STK-01 STK-02 STK-03 STK-04 AUD-04 barcode/status pages, sorting and lazy details',async({drill:h})=>{
 const {page}=await h.session('billingA');await h.nav(page,'Stock');await expect(page.getByText('Enter a barcode or choose a stock status to load stock.',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Stock Filters'}).getByRole('textbox')).toHaveCount(2)
 await page.getByRole('textbox',{name:'Barcode',exact:true}).fill('00001');await page.getByRole('button',{name:'Edit Stock Prices For Drill Product A',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit Stock Prices',exact:true})).toBeVisible();expect(await page.locator('details[open]').count()).toBe(0);await page.getByRole('button',{name:'Close Product Details',exact:true}).click()
 await page.getByRole('textbox',{name:'Barcode',exact:true}).fill('Drill Product');await expect(page.getByText('No products match these filters.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear Filters',exact:true}).click()
 await h.select(page,'Stock Status','In Stock');await expect(page.locator('tbody tr')).toHaveCount(50);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(14);await expect(page.getByText(/^Page 2/)).toBeVisible()
 await page.getByRole('button',{name:'Sort By MRP',exact:true}).click();await expect(page.getByText(/^Page 1/)).toBeVisible();await expect(page.getByText(/MRP sorted on this page only/)).toBeVisible();await h.select(page,'Stock Status','Zero Stock');await expect(page.getByRole('cell',{name:'00003',exact:true})).toBeVisible();await h.select(page,'Stock Status','Negative Stock');await expect(page.getByRole('cell',{name:'00004',exact:true})).toBeVisible()
 await page.getByRole('tab',{name:'Stock Audit',exact:true}).click();expect(await page.getByRole('heading',{name:/Audit History/}).count()).toBe(0)
})
test('STK-05 API required fields/reasons/paise for all allowed roles',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real Auth/Functions validation matrix; independent unchanged-source assertions; complements UI ceiling test'})
 for(const role of ['billingA','manager','owner']){const {page}=await h.session(role);for(const patch of [{mrpPaise:null},{sellingPricePaise:20001},{mrpPaise:-1},{sellingPricePaise:0.5},{reason:'four'},{reason:'x'.repeat(1001)}]){
  const result=await attempt(()=>h.rpc(page,CLIENT,'call',['changeStockPrices',{operationId:'stock-price-'+crypto.randomUUID(),productId:'drill-product-1',expectedRevision:1,mrpPaise:20000,sellingPricePaise:1000,reason:'Drill valid independent reason',...patch}]))
  expect(result.ok).toBe(false)
 } }
 expect((await h.get(h.base+'/products/drill-product-1')).revision).toBe(1);expect(await h.records(h.base+'/stockPriceChanges')).toEqual([])
})
test('GRN-03 GRN-06 GRN-07 new product, retired correction and vendor paging',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real receive UI picker/history plus real Rules new-product posting; independent source quantities'})
 const {page}=await h.session('billingA');await h.nav(page,'Stock');await page.getByRole('tab',{name:'Receive Stock',exact:true}).click();const vendor=page.getByPlaceholder('Choose vendor');await vendor.click();await expect(page.getByRole('option')).toHaveCount(25);await page.getByRole('button',{name:'Load more vendors',exact:true}).click();await expect(page.getByRole('option')).toHaveCount(50);await vendor.fill('Drill Vendor 062');await page.getByRole('option',{name:'Drill Vendor 062',exact:true}).click();await expect(vendor).toHaveValue('Drill Vendor 062')
 const actor=await h.actor(page),id=await h.rpc(page,REPO,'savePosGoodsReceiptDraft',[{vendorId:'drill-alpha',vendorName:'Drill Alpha Vendor',invoiceNumber:'DRILL-NEW-GRN',invoiceDate:h.date,receiptDate:h.date,invoiceTotalPaise:6000,lines:[{productId:'drill-new-product',barcode:'99999',productName:'Drill New GRN Product',category:'Drill',quantity:3,unitCostPaise:2000,lineTotalPaise:6000,mrpPaise:5000,sellingPricePaise:4500,mrpChanged:true,newProduct:true}]},actor])
 await h.rpc(page,REPO,'submitPosGoodsReceipt',[id,actor]);expect((await h.get(h.base+'/products/drill-new-product')).currentQuantity).toBe(3);expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(6000)
 await page.getByRole('tab',{name:'GRN History',exact:true}).click();expect(await page.getByRole('button',{name:/Correct MRP/}).count()).toBe(0)
 const retired=await attempt(()=>h.rpc(page,CLIENT,'write',[h.base+'/events/retired',{actorUid:'drill-billingA',type:'goods-receipt-mrp-corrected'}]));expect(retired.ok).toBe(false)
})
test('POS-02 POS-08 unknown barcode, hold/resume and refresh',async({drill:h})=>{
 const {page}=await h.session('billingA');const scanner=page.getByRole('textbox',{name:'Scan barcode or search product name',exact:true});await scanner.fill('99999');await scanner.press('Enter');await expect(page.getByRole('alertdialog')).toBeVisible();expect(await h.records(h.base+'/bills')).toEqual([])
 await page.getByRole('textbox',{name:'Product name',exact:true}).fill('Drill Unknown Product');await page.getByRole('spinbutton',{name:'Selling price',exact:true}).fill('30');await page.getByRole('button',{name:'Create product & resolve barcode',exact:true}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0)
 const products=await h.records(h.base+'/products');expect(products.find(p=>p.barcode==='99999').currentQuantity).toBe(0)
 await page.getByRole('button',{name:'Hold cart',exact:true}).click();await expect.poll(async()=>(await h.records(h.base+'/heldCarts')).length).toBe(1);await page.reload();await h.clock(page);await page.getByRole('button',{name:'Resume',exact:true}).click();await expect(page.getByLabel('1 items in cart')).toBeVisible();await expect.poll(async()=>(await h.records(h.base+'/heldCarts')).length).toBe(0)
})
test('POS-06 UPI/card and split payment totals',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real POS UI payment selection plus actual Rules posting for payment mix'})
 const {page}=await h.session('billingA');const actor=await h.actor(page)
 for(const [i,payments] of [[0,[{method:'upi',amountPaise:9000}]],[1,[{method:'card',amountPaise:9000}]],[2,[{method:'cash',amountPaise:4500},{method:'upi',amountPaise:4500}]]]){
  const current=await h.get(h.base+'/products/drill-product-1');await h.rpc(page,REPO,'finalizePosBill',[{businessDate:h.date,lines:[{id:'line-'+i,kind:'product',productId:current.id,barcode:current.barcode,description:current.name,quantity:1,unitPricePaise:9000,expectedProductRevision:current.revision,stockAtScan:current.currentQuantity}],discount:{mode:'none',amountPaise:0},payments},actor])
 }
 expect((await h.records(h.base+'/bills')).reduce((s,b)=>s+b.totalPaise,0)).toBe(27000);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(17);expect((await h.get(h.base+'/handover/main')).dailyTotals[h.date]).toEqual({upi:13500,card:9000});expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(4500)
 await page.getByRole('button',{name:'UPI',exact:true}).click();await expect(page.getByRole('button',{name:'UPI',exact:true})).toHaveAttribute('aria-pressed','true')
})
test('VEN-08 accepted vendor return credit and no loan/cash effect',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real Auth/Rules vendor return posting and independent ledger reconciliation'})
 const {page}=await h.session('billingA');await purchase(h,page);await h.rpc(page,VENDOR,'createVendorReturnV2',[{id:'drill-return',vendorId:'drill-alpha',sourcePurchaseId:'drill-purchase',date:h.date,description:'Drill expired goods',quantity:1,unit:'piece',valuePaise:10000,reason:'Drill expired goods return',actorUserId:'drill-billingA',timestamp:new Date().toISOString()}])
 const {page:owner}=await h.session('owner');await h.rpc(owner,VENDOR,'resolveVendorReturnV2',['drill-return',{outcome:'vendor-credit',creditedValuePaise:10000,outcomeReason:'Drill accepted partial credit',actor:await h.actor(owner),timestamp:new Date().toISOString()}])
 expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(90000);expect(await h.records('cashTransfers')).toEqual([]);expect(await h.records('loans')).toEqual([])
})
test('VEN-09 cheque lifecycle exactly once debit and duplicate leaf',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real Auth/Rules cheque register posting; independent account delta and immutable debit proof'})
 const {page}=await h.session('owner');await purchase(h,page);await h.db.doc('bankBalanceControl/main').set({initialized:true,balancePaise:500000,revision:1});await h.db.doc('appMetadata/appSettings').set({currentBankBalance:5000},{merge:true})
 await h.db.doc('chequeBooksV2/book-1120-1199').set({id:'book-1120-1199',bankAccountLabel:'Drill Bank',startNumber:1120,endNumber:1199,active:true,revision:1,createdAt:new Date().toISOString(),createdByUserId:'drill-owner'})
 await h.rpc(page,VENDOR,'createVendorChequeV2',[{chequeBookId:'book-1120-1199',chequeNumber:'1120',vendorId:'drill-alpha',date:h.date,amountPaise:30000,actorUserId:'drill-owner',timestamp:new Date().toISOString()}])
 await h.rpc(page,CLIENT,'call',['presentDueCheque',{chequeNumber:'1120'}]);const pending=(await h.records('chequesV2'))[0];expect(pending.status).toBe('presented');await h.rpc(page,VENDOR,'transitionVendorChequeV2',[{chequeNumber:'1120',expectedRevision:pending.revision,toStatus:'debited',actorUserId:'drill-owner',timestamp:new Date().toISOString()}]);expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(0)
 expect((await h.get('vendorAccountStatesV2/drill-alpha')).outstandingPaise).toBe(70000);const before=await h.records('vendorLedgerEntriesV2'),current=(await h.records('chequesV2'))[0];await attempt(()=>h.rpc(page,VENDOR,'transitionVendorChequeV2',[{chequeNumber:'1120',expectedRevision:current.revision,toStatus:'debited',actorUserId:'drill-owner',timestamp:new Date().toISOString()}]));expect((await h.records('vendorLedgerEntriesV2')).length).toBe(before.length)
})
test('FIN-03 FIN-04 trusted cash transfer idempotency and sender limits',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Real cash-transfer callable with real Auth and independent canonical holder arithmetic'})
 await h.db.doc('dailyCashouts/drill-holder').set({date:h.date,recordedBy:'Drill billingA',recordedByUserId:'drill-billingA',drawerTotal:1000,remainingBalance:1000,createdAt:new Date().toISOString(),revision:1})
 const {page}=await h.session('billingA'),payload={operationId:'cash-transfer-'+crypto.randomUUID(),date:h.date,fromUserId:'drill-billingA',toType:'person',toUserId:'drill-billingB',amount:300,reason:'Drill independent transfer'}
 await h.rpc(page,CLIENT,'call',['createCashTransfer',payload]);await h.rpc(page,CLIENT,'call',['createCashTransfer',payload]);expect((await h.records('cashTransfers')).length).toBe(1);expect((await h.records('cashTransfers'))[0]).toMatchObject({amount:300,fromUserId:'drill-billingA',toUserId:'drill-billingB'})
 const over=await attempt(()=>h.rpc(page,CLIENT,'call',['createCashTransfer',{...payload,operationId:'cash-transfer-'+crypto.randomUUID(),amount:701}]));expect(over.ok).toBe(false)
 const other=await attempt(()=>h.rpc(page,CLIENT,'call',['createCashTransfer',{...payload,operationId:'cash-transfer-'+crypto.randomUUID(),fromUserId:'drill-billingB',amount:1}]));expect(other.ok).toBe(false);expect((await h.records('cashTransfers')).length).toBe(1)
})
test('FIN-05 FIN-06 COUNTER-07 Cashout cancel, denominations and closure',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'Cashout');await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('button',{name:'Cancel count',exact:true}).click();expect(await h.records('dailyCashouts')).toEqual([]);await expect.poll(async()=>(await h.get(h.base+'/handover/main')).countReservation).toBeNull()
 await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'100',exact:true}).fill('1');await page.getByRole('spinbutton',{name:'Loose change (₹)',exact:true}).fill('5');await expect(page.getByLabel('Drawer Total',{exact:true})).toHaveValue('1105')
 await page.getByLabel('Discrepancy reason / closing note',{exact:true}).fill('Independent counted excess105 fixture');await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const cashout=(await h.records('dailyCashouts'))[0];expect(cashout.drawerTotal).toBe(1105);expect(cashout.auditDifference).toBe(-105);expect(cashout.auditStatus).toBe('cash-more');expect(cashout.reviewStatus).toBe('pending');expect(cashout.recordedByUserId).toBe('drill-owner');expect((await h.get(h.base+'/handover/main')).counterSession.status).toBe('closed');expect((await h.get(h.base+'/handover/main')).checkpoint.cashActualPaise).toBe(0)
 expect((await h.records(h.base+'/drawerClosures')).length).toBe(1)
})
test('LOG-01 LOG-02 SET-01 Vendor/Logs/Settings tab and empty-source coverage',async({drill:h})=>{
 const {page}=await h.session('owner');await h.nav(page,'Vendor Workspace');for(const title of ['Vendors','Invoices','Returns','Corrections','Balances']){await page.getByRole('tab',{name:title,exact:true}).click();await expect(page.getByRole('tab',{name:title,exact:true})).toHaveAttribute('aria-selected','true')}
 await h.nav(page,'Logs');for(const title of ['Sales','Expenses','Purchases','Payments','Daily Cashouts','Cash Transfers','Settings Audit','Stock Audits']){await page.getByRole('tab',{name:title,exact:true}).click();await expect(page.getByRole('tab',{name:title,exact:true})).toHaveAttribute('aria-selected','true')}
 await h.nav(page,'Settings');for(const title of ['Staff','Operations','POS','Announcements','Staff Notifications','Update Password']){await page.getByRole('tab',{name:title,exact:true}).click();await expect(page.getByRole('tab',{name:title,exact:true})).toHaveAttribute('aria-selected','true')}
 expect(await h.records('sales')).toEqual([]);expect(await h.records('cashouts')).toEqual([])
})
test('UX-01 UX-02 UX-03 phone, keyboard focus, offline and reconnect',async({drill:h})=>{
 const {page,context}=await h.session('billingA');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();await h.nav(page,'Stock');await expect(page.getByRole('textbox',{name:'Barcode',exact:true})).toBeVisible()
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false)
 await page.getByRole('textbox',{name:/^Stock Status/}).click();await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0)
 await context.setOffline(true);await expect(page.getByText(/offline|connection/i).first()).toBeVisible();expect(await h.records(h.base+'/bills')).toEqual([]);await context.setOffline(false);await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toBeVisible();await page.screenshot({path:require('node:path').resolve('output/playwright',process.env.DRILL_RUN_ID,'phone-stock.png'),fullPage:true})
})
test('PWA-01 static manifest and SW contract inspection',async({drill:h},info)=>{
 info.annotations.push({type:'layer',description:'Read-only asset/source inspection; dev session does not certify native installed PWA'})
 const {page}=await h.session('unauthenticated');const manifest=await page.request.get('/manifest.webmanifest');expect(manifest.ok()).toBe(true);const body=await manifest.json();expect(body.display).toBe('standalone');expect(body.icons.length).toBeGreaterThanOrEqual(2)
 const sw=await page.request.get('/sw.js');expect(sw.ok()).toBe(true);expect(await sw.text()).toContain('cache');expect(await page.evaluate(async()=>navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:0)).toBe(0)
})
test('PWA-02 native installation/scanner/printer requires manual verification',async({drill:h},info)=>{h.evidence.assertions.push({manualRequired:true});info.annotations.push({type:'blocker',description:'Physical hardware and native installed Android launch cannot be accepted through desktop headless automation.'});test.skip(true,'Manual verification required')})
