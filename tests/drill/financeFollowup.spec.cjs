const {test,expect}=require('./helpers.cjs')
const CLIENT='/tests/drill/client.ts',FIN='/src/features/register/data/financeRepository.ts'

test('F45-20 explicit historical cash choice prevents another debit while a second billing session remains active',async({drill:h},info)=>{
 const date=historicalDateFor(h,14),{page:owner}=await h.session('owner'),{page:staff}=await h.session('billingA')
 await h.nav(owner,'Cashout');await owner.getByLabel('Cashout For Date',{exact:true}).fill(date)
 const proceed=owner.getByRole('button',{name:'Continue To Cash Drawer',exact:true})
 await expect(proceed).toBeDisabled()
 await owner.getByRole('radio',{name:/^Cash already removed/}).check()
 const before=await h.get(h.base+'/handover/main')
 await proceed.click()
 await expect(owner.getByRole('dialog')).toContainText("No cash is removed from today's drawer.")
 expect(await h.get(h.base+'/handover/main')).toEqual(before)
 // The real second session can bill while the owner records an already-removed historical Cashout.
 await h.nav(staff,'POS');const scan=staff.getByRole('textbox',{name:'Scan barcode or search product name',exact:true})
 await scan.fill('00001');await scan.press('Enter');await staff.getByRole('spinbutton',{name:'Cash received',exact:true}).fill('100');await staff.getByRole('button',{name:'Finalize Bill',exact:true}).click()
 await expect.poll(async()=>(await h.records(h.base+'/bills')).length).toBe(1)
 const afterSale=await h.get(h.base+'/handover/main'),product=await h.get(h.base+'/products/drill-product-1')
 expect(afterSale.cashNetPaise).toBe(before.cashNetPaise+9000)
 expect(afterSale.countReservation).toBeNull()
 await owner.getByRole('spinbutton',{name:'500',exact:true}).fill('3')
 await owner.getByLabel('Why is this historical Cashout being entered now?',{exact:true}).fill('Synthetic cash was removed earlier; recording the missed history only')
 await owner.setViewportSize({width:390,height:844})
 const save=owner.getByRole('button',{name:'Save Historical Cashout - No Drawer Deduction',exact:true})
 await save.scrollIntoViewIfNeeded();const bounds=await save.boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(390)
 const shot=info.outputPath('already-removed-mobile.png');await owner.screenshot({path:shot,fullPage:true});await info.attach('already-removed-mobile',{path:shot,contentType:'image/png'})
 await save.click();await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const entry=(await h.records('dailyCashouts'))[0]
 expect(entry).toMatchObject({date,historicalCashTiming:'already-removed',drawerTotal:1500,drawerDebitPaise:0})
 expect(await h.get(h.base+'/handover/main')).toEqual(afterSale)
 expect(await h.get(h.base+'/products/drill-product-1')).toEqual(product)
 expect((await h.get(h.base+'/drawerClosures/'+entry.id)).removedPaise).toBe(0)
 await expect(owner.getByText("Historical Cashout and sales saved. Cash was already removed earlier; today's drawer is unchanged.",{exact:true})).toBeVisible()
 h.evidence.assertions.push({independentPaise:{opening:100000,sale:9000,earlierCashout:150000,liveDrawer:109000,historicalDebit:0},twoIndependentAuthenticatedSessions:true,realBillingDuringHistoricalReview:true,physicalDevices:false})
})

test('F45-21 audited duplicate-debit correction preserves subsequent expenses and recovers a lost response once',async({drill:h},info)=>{
 const date=historicalDateFor(h,15),{page:owner}=await h.session('owner'),{page:staff}=await h.session('billingA')
 const quote=await h.rpc(owner,FIN,'postFinanceOperation',['cashout-count-start',{date,historicalCashTiming:'remove-now'}])
 const entry=await h.rpc(owner,FIN,'postFinanceOperation',['cashout-close',{quoteId:quote.id,drawerDenominations:{denom500:1,denom200:0,denom100:0,denom50:0,denom20:0,denom10:0,change:0},creditSales:0,reason:'Synthetic wrong historical cash-removal choice'}])
 await h.nav(staff,'Register');await staff.getByLabel('Recipient',{exact:true}).fill('Synthetic later electricity');await staff.getByRole('spinbutton',{name:/^Amount/}).fill('50');await staff.getByRole('button',{name:'Record payment',exact:true}).click()
 await expect.poll(async()=>(await h.records('cashouts')).length).toBe(1)
 const sources=await h.records('cashouts'),sales=await h.get('sales/sale-single-store-'+date),closure=await h.get(h.base+'/drawerClosures/'+entry.id)
 await h.nav(owner,'Cashout');await owner.getByLabel('Cashout For Date',{exact:true}).fill(date)
 await owner.getByText('Correct duplicate drawer deduction',{exact:true}).click()
 const form=owner.getByRole('form',{name:'Correct historical drawer deduction',exact:true})
 await expect(form).toContainText('Correction still needed in the live drawer: ₹500')
 await form.getByLabel('Duplicate deduction correction reason',{exact:true}).fill('Owner confirms this cash had already been removed on the earlier date')
 const save=form.getByRole('button',{name:'Apply audited drawer correction',exact:true})
 await expect(save).toBeDisabled();await form.getByRole('checkbox').check()
 const shot=info.outputPath('duplicate-deduction-preview.png');await owner.screenshot({path:shot,fullPage:true});await info.attach('duplicate-deduction-preview',{path:shot,contentType:'image/png'})
 let dropped=false
 await owner.route('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/postFinanceOperation',async route=>{
  if(route.request().postDataJSON()?.data?.kind==='cashout-drawer-reversal'&&!dropped){const response=await route.fetch();expect(response.status()).toBe(200);dropped=true;await route.abort('failed')}else await route.continue()
 })
 await save.click()
 await expect.poll(async()=>(await h.records('cashoutDrawerCorrections')).length).toBe(1)
 await expect(owner.getByRole('button',{name:'Recover original result',exact:true})).toBeVisible();await owner.getByRole('button',{name:'Recover original result',exact:true}).click()
 await expect(owner.getByText('Original financial result recovered. Review the saved transaction before recording another payment.',{exact:true})).toBeVisible()
 const ledger=await h.get(h.base+'/handover/main')
 expect(ledger.cashNetPaise).toBe(-5000)
 const audit=(await h.records('cashoutDrawerCorrections'))[0]
 expect(audit).toMatchObject({cashoutId:entry.id,originalDebitPaise:50000,restoredPaise:50000,beforePaise:45000,afterPaise:95000})
 expect(await h.records('cashoutDrawerCorrections')).toHaveLength(1)
 expect((await h.records('financeOperations')).filter(op=>op.kind==='cashout-drawer-reversal')).toHaveLength(1)
 expect(await h.records('cashouts')).toEqual(sources);expect(await h.get('sales/sale-single-store-'+date)).toEqual(sales);expect(await h.get(h.base+'/drawerClosures/'+entry.id)).toEqual(closure)
 expect(await h.get('dailyCashouts/'+entry.id)).toMatchObject({drawerTotal:500,drawerDebitPaise:50000,historicalCashTiming:'already-removed',drawerDebitReversalRestoredPaise:50000})
 const denied=await h.rpc(owner,CLIENT,'write',['cashoutDrawerCorrections/forged',{restoredPaise:999}]).then(()=>null,error=>error.message);expect(denied).toMatch(/permission[-_]denied|insufficient permissions/i)
 await h.nav(owner,'Cashout');await owner.getByLabel('Cashout For Date',{exact:true}).fill(date)
 await expect(owner.getByText('Cashout is already saved for this date.',{exact:false})).toBeVisible()
 await expect(owner.getByText('Correct duplicate drawer deduction',{exact:true})).toHaveCount(0)
 h.evidence.assertions.push({independentPaise:{opening:100000,wrongDebit:50000,laterExpense:5000,restore:50000,finalDrawer:95000},lostResponseRecovered:true,reversalCount:1,originalSourcesRetained:true})
})

function historicalDateFor(h, days = 14) { const date = new Date(h.date + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0,10) }
async function seedHistoricalExpense(h, date) {
 const source={id:'historical-expense',date,amount:4000,category:'Store Maintenance',paymentMode:'Cash',storeId:'single-store',paidTo:'Synthetic historical maintenance',approvedBy:'Synthetic owner',notes:'Legacy fixture retained unchanged',createdAt:date+'T10:00:00Z',updatedAt:date+'T10:00:00Z'}
 await h.db.doc('cashouts/'+source.id).set(source);return source
}
test('F45-18 owner reconciles past expenses and corrects completed Cashout without another drawer debit',async({drill:h},info)=>{
 const date=historicalDateFor(h),source=await seedHistoricalExpense(h,date)
 const {page}=await h.session('owner'),{page:staff}=await h.session('billingA')
 const ledgerBefore=await h.get(h.base+'/handover/main')
 await h.nav(staff,'Cashout');await staff.getByLabel('Cashout For Date',{exact:true}).fill(date)
 await expect(staff.getByLabel('Cash Paid Out (source-linked)',{exact:true})).toHaveValue('4000')
 await expect(staff.getByText('Review historical cash expenses',{exact:true})).toHaveCount(0)
 const denied=await h.rpc(staff,CLIENT,'call',['getFinanceCashoutSummary',{date,expenseReconciliation:true}]).then(()=>null,error=>error.message)
 expect(denied).toMatch(/cannot perform|permission-denied/)
 await h.nav(page,'Cashout');await page.getByLabel('Cashout For Date',{exact:true}).fill(date)
 await expect(page.getByLabel('Cash Paid Out (source-linked)',{exact:true})).toHaveValue('4000')
 await page.getByText('Review historical cash expenses',{exact:true}).click()
 const review=page.getByRole('region',{name:'Historical cash expense review',exact:true})
 await expect(review).toContainText('Recorded cash expenses: ₹4,000')
 await review.getByLabel('Confirmed total cash expenses',{exact:true}).fill('4656')
 await review.getByLabel('Historical expense reason',{exact:true}).fill('Owner confirmed the complete historical daily cash expenses')
 await expect(review).toContainText('Adjustment against recorded expenses: ₹656')
 await review.getByRole('button',{name:'Confirm historical expenses',exact:true}).click()
 await expect.poll(async()=>(await h.get('cashoutExpenseReconciliations/'+date))?.revision).toBe(1)
 await expect(page.getByLabel('Cash Paid Out (source-linked)',{exact:true})).toHaveValue('4656')
 expect(await h.get(h.base+'/handover/main')).toEqual(ledgerBefore)
 expect(await h.get('cashouts/historical-expense')).toEqual(source)
 expect(await h.records('cashouts')).toHaveLength(1)
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click()
  const shot=info.outputPath('historical-expenses-'+theme+'.png');await page.screenshot({path:shot,fullPage:true});await info.attach('historical-expenses-'+theme,{path:shot,contentType:'image/png'})
 }
 // Only the actual 500 cash count is debited, not the historical reporting adjustment.
 await page.getByRole('radio',{name:/^Removing cash now/}).check()
 await page.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click()
 await page.getByRole('spinbutton',{name:'500',exact:true}).fill('1')
 await page.getByLabel('Why is this historical Cashout being entered now?',{exact:true}).fill('Synthetic missed Cashout with cash physically removed now')
 await page.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click()
 await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const entry=(await h.records('dailyCashouts'))[0],postClose=await h.get(h.base+'/handover/main')
 expect(entry).toMatchObject({date,cashExpense:4656,drawerTotal:500,drawerDebitPaise:50000})
 expect(postClose.cashNetPaise).toBe(ledgerBefore.cashNetPaise-50000)
 const paths=[h.base+'/handover/main',h.base+'/drawerClosures/'+entry.id,'sales/sale-single-store-'+date,'cashMovementControl/main','cashouts/historical-expense']
 const protectedBefore=await Promise.all(paths.map(path=>h.get(path)))
 await review.getByRole('button',{name:'Refresh expense review',exact:true}).click()
 await expect(review.getByRole('checkbox')).toBeVisible()
 await review.getByLabel('Confirmed total cash expenses',{exact:true}).fill('4700.25')
 await review.getByLabel('Historical expense reason',{exact:true}).fill('Owner verified an additional historical expense correction')
 const apply=review.getByRole('button',{name:'Confirm expenses and correct Cashout',exact:true})
 await expect(apply).toBeDisabled();await review.getByRole('checkbox').check();await expect(apply).toBeEnabled()
 await apply.click()
 await expect.poll(async()=>(await h.get('dailyCashouts/'+entry.id)).cashExpense).toBe(4700.25)
 await expect(review).toContainText('Last confirmed total: ₹4,700.25')
 await expect(review).toContainText('Current historical adjustment: ₹700.25')
 await expect(page.getByText('Cashout is already saved for this date.',{exact:false})).toBeVisible()
 await expect(page.getByRole('button',{name:'Continue To Cash Drawer',exact:true})).toHaveCount(0)
 expect(await Promise.all(paths.map(path=>h.get(path)))).toEqual(protectedBefore)
 const audit=await h.records('cashoutCorrectionRequests');expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({status:'approved',before:{cashExpense:4656},proposed:{cashExpense:4700.25},reviewedByUserId:'drill-owner'})
 const direct=await h.rpc(page,CLIENT,'write',['cashoutExpenseReconciliations/forged',{confirmedExpensePaise:1}]).then(()=>null,error=>error.message)
 expect(direct).toMatch(/permission[-_]denied|insufficient permissions/i)
 await page.setViewportSize({width:390,height:844})
 for(const control of [review.getByLabel('Confirmed total cash expenses',{exact:true}),review.getByLabel('Historical expense reason',{exact:true}),review.getByRole('button',{name:'Confirm expenses and correct Cashout',exact:true})]){
  const bounds=await control.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390)
 }
 const shot=info.outputPath('historical-expenses-mobile.png');await page.screenshot({path:shot,fullPage:true});await info.attach('historical-expenses-mobile',{path:shot,contentType:'image/png'})
 await h.nav(page,'Logs');await h.select(page,'Date range','Last 30 days');await page.getByRole('tab',{name:'Daily Cashouts',exact:true}).click();await page.getByRole('button',{name:'View complete cashout',exact:true}).first().click()
 await expect(page.getByRole('dialog')).toContainText('₹4,700.25')
 h.evidence.assertions.push({date,independentPaise:{recorded:400000,confirmed:465600,adjustment:65600,physicalCashout:50000,secondConfirmed:470025},sourcesRetained:true,liveDrawerOnlyChangedByPhysicalCashout:true,physicalDevices:false,serviceWorkers:'blocked'})
})

test('F45-19 lost historical reconciliation response recovers original save without duplicate adjustment',async({drill:h})=>{
 const date=historicalDateFor(h,20),source=await seedHistoricalExpense(h,date),{page}=await h.session('owner')
 await h.nav(page,'Cashout');await page.getByLabel('Cashout For Date',{exact:true}).fill(date)
 await page.getByText('Review historical cash expenses',{exact:true}).click()
 const review=page.getByRole('region',{name:'Historical cash expense review',exact:true})
 await review.getByLabel('Confirmed total cash expenses',{exact:true}).fill('4656')
 await review.getByLabel('Historical expense reason',{exact:true}).fill('Synthetic successful save followed by a lost response')
 const before=await h.get(h.base+'/handover/main');let dropped=false
 await page.route('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/postFinanceOperation',async route=>{
  const data=route.request().postDataJSON()?.data
  if(data?.kind==='cashout-expense-reconcile'&&!dropped){const response=await route.fetch();expect(response.status()).toBe(200);dropped=true;await route.abort('failed')}else await route.continue()
 })
 await review.getByRole('button',{name:'Confirm historical expenses',exact:true}).click()
 await expect.poll(async()=>(await h.get('cashoutExpenseReconciliations/'+date))?.revision).toBe(1)
 await expect(page.getByRole('button',{name:'Recover original result',exact:true})).toBeVisible()
 const pending=await h.rpc(page,FIN,'pendingFinanceOperation');expect(pending).toMatchObject({kind:'cashout-expense-reconcile'})
 await page.getByRole('button',{name:'Recover original result',exact:true}).click()
 await expect(page.getByText('Original financial result recovered. Review the saved transaction before recording another payment.',{exact:true})).toBeVisible()
 expect(dropped).toBe(true)
 expect((await h.get('cashoutExpenseReconciliations/'+date))).toMatchObject({revision:1,confirmedExpensePaise:465600,adjustmentPaise:65600})
 expect((await h.records('financeOperations')).filter(row=>row.kind==='cashout-expense-reconcile')).toHaveLength(1)
 expect(await h.get(h.base+'/handover/main')).toEqual(before)
 expect(await h.get('cashouts/historical-expense')).toEqual(source)
 expect(await h.rpc(page,FIN,'pendingFinanceOperation')).toBeNull()
 h.evidence.assertions.push({lostResponseAfterSuccessfulWrite:true,originalOperationRecovered:true,adjustmentCount:1,drawerImpactPaise:0})
})
test('F45-17 overnight counter current count supports expense return and Cashout without another opening',async({drill:h},info)=>{
 const {randomUUID}=require('node:crypto'),previous=new Date(h.date+'T00:00:00Z');previous.setUTCDate(previous.getUTCDate()-1)
 const openingDate=previous.toISOString().slice(0,10),opening={id:'fixture-opening',kind:'login',date:openingDate,actual:{cash:100000,upi:0,card:0}},latest={id:'overnight-count',kind:'logout',date:h.date,actual:{cash:100000,upi:0,card:0}}
 await h.db.doc(h.base+'/reconciliations/fixture-opening').set(opening);await h.db.doc(h.base+'/reconciliations/overnight-count').set(latest)
 await h.db.doc(h.base+'/handover/main').update({'counterSession.date':openingDate,'checkpoint.reconciliationId':latest.id})
 const {page:staff}=await h.session('billingA'),{page:owner}=await h.session('owner')
 await h.nav(staff,'POS');await expect(staff.getByRole('button',{name:'Open Counter',exact:true})).toHaveCount(0)
 const bill=await h.rpc(staff,CLIENT,'call',['finalizePosCheckout',{operationId:randomUUID(),businessDate:h.date,lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:9000,expectedProductRevision:1,stockAtScan:20}],discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:18000}]}])
 await h.nav(owner,'Register');await owner.getByLabel('Recipient',{exact:true}).fill('Synthetic overnight utility');await owner.getByRole('spinbutton',{name:/^Amount/}).fill('50');await owner.getByRole('button',{name:'Record payment',exact:true}).click()
 await expect.poll(async()=>(await h.records('cashouts')).filter(x=>x.sourceKind==='expense').length).toBe(1)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(13000)
 await staff.getByRole('tab',{name:'Bills',exact:true}).click();await staff.getByRole('button',{name:'Return items',exact:true}).first().click();await staff.getByRole('spinbutton',{name:'Return quantity for Drill Product A',exact:true}).fill('1');await expect(staff.getByRole('textbox',{name:'Refund amount',exact:true})).toHaveValue('90.00');await staff.getByRole('textbox',{name:'Mandatory return reason',exact:true}).fill('Synthetic overnight customer return');await staff.getByRole('button',{name:'Complete return',exact:true}).click();await staff.getByRole('button',{name:'Confirm cash return',exact:true}).click()
 await expect.poll(async()=>(await h.records(h.base+'/approvals')).length).toBe(1)
 expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(4000)
 expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(19)
 await h.nav(owner,'Cashout');await owner.getByRole('button',{name:'Continue To Cash Drawer',exact:true}).click();await owner.getByRole('spinbutton',{name:'500',exact:true}).fill('2');await owner.getByRole('spinbutton',{name:'20',exact:true}).fill('2');await expect(owner.getByLabel('Drawer Total',{exact:true})).toHaveValue('1040');await owner.getByRole('button',{name:'Save Cashout and Close Drawer',exact:true}).click()
 await expect.poll(async()=>(await h.records('dailyCashouts')).length).toBe(1)
 const entry=(await h.records('dailyCashouts'))[0],closed=await h.get(h.base+'/handover/main')
 expect(entry).toMatchObject({date:h.date,drawerTotal:1040,cashSales:180,returns:90,cashExpense:140,cashRemovedPaise:104000})
 expect(closed.counterSession).toMatchObject({status:'closed',date:openingDate,openingReconciliationId:'fixture-opening'})
 expect(closed.checkpoint).toMatchObject({date:h.date,cashActualPaise:0})
 expect(await h.get(h.base+'/reconciliations/fixture-opening')).toEqual(opening);expect(await h.get(h.base+'/reconciliations/overnight-count')).toEqual(latest)
 expect((await h.get(h.base+'/bills/'+bill.id)).totalPaise).toBe(18000)
 await staff.getByRole('tab',{name:'Billing',exact:true}).click();await expect(staff.getByRole('button',{name:'Open Counter',exact:true})).toBeVisible()
 const screenshot=info.outputPath('overnight-closed-opening-option.png');await staff.screenshot({path:screenshot,fullPage:true});await info.attach('opening-option-after-real-cashout',{path:screenshot,contentType:'image/png'})
 h.evidence.assertions.push({independentPaise:{count:100000,sale:18000,expense:5000,refund:9000,cashout:104000,remaining:0},originalOpeningPreserved:true,currentCountUsed:true,twoIndependentSessions:true})
})
const denoms={denom500:2,denom200:0,denom100:0,denom50:0,denom20:0,denom10:0,change:0}
async function close(h,page){await h.db.doc('bankBalanceControl/main').set({initialized:true,balancePaise:500000,revision:1});await h.db.doc('appMetadata/appSettings').set({currentBankBalance:5000},{merge:true});const q=await h.rpc(page,FIN,'postFinanceOperation',['cashout-count-start',{date:h.date}]);const source=await h.rpc(page,FIN,'postFinanceOperation',['cashout-close',{quoteId:q.id,drawerDenominations:denoms,creditSales:0,reason:''}]);expect(source.drawerTotal).toBe(1000);return source}
async function fillMove(h,page,to,amount){await h.nav(page,'Cash Movement');await h.select(page,'From','Drill owner');await h.select(page,'To',to);await page.getByRole('spinbutton',{name:'Movement Amount',exact:true}).fill(String(amount));await page.getByRole('textbox',{name:'Cash Movement Notes',exact:true}).fill('Independent full financial acceptance movement')}
test('F45-10 trusted Cashout to staff transfer double-click preserves1000 total held cash and zero drawer',async({drill:h})=>{const {page}=await h.session('owner');const source=await close(h,page);await fillMove(h,page,'Drill billingA',300);await page.getByRole('button',{name:'Save Cash Movement',exact:true}).dblclick();await expect.poll(async()=>(await h.records('cashTransfers')).length).toBe(1);const [movement]=await h.records('cashTransfers');expect(movement).toMatchObject({amount:300,fromUserId:'drill-owner',toUserId:'drill-billingA',createdBy:'Drill owner'});expect((await h.get('dailyCashouts/'+source.id)).drawerTotal).toBe(1000);expect((await h.get(h.base+'/handover/main')).checkpoint.cashActualPaise).toBe(0);expect((await h.get('bankBalanceControl/main')).balancePaise).toBe(500000);const balances=await page.locator('main').innerText();expect(balances).toContain('₹700');expect(balances).toContain('₹300');await h.nav(page,'Logs');await page.getByRole('tab',{name:'Cash Transfers',exact:true}).click();await expect(page.locator('main')).toContainText('300');h.evidence.assertions.push({independentPaise:{source:100000,ownerAfter:70000,staffAfter:30000,drawer:0,bank:500000},sourceId:source.id,movement})})
test('F45-11 cash bank deposit lost acknowledgement recovers once without a balance mirror or drawer debit', async ({ drill: h }) => {
  const { page } = await h.session('owner');
  const source = await close(h, page);
  await h.db.doc('bankBalanceControl/main').delete();
  await h.db.doc('appMetadata/appSettings').delete();
  await fillMove(h, page, 'Bank', 300);
  await h.select(page, 'Bank deposit method', 'Bank Deposit');
  let dropped = false;
  await page.route('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/createCashTransfer', async route => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      expect((await route.fetch({ maxRedirects: 0 })).status()).toBe(200);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save Cash Movement', exact: true }).click();
  await expect.poll(async () => (await h.records('cashTransfers')).length).toBe(1);
  await expect(page.getByText('Financial operation needs recovery', { exact: true })).toBeVisible();
  await page.reload();
  await h.nav(page, 'Cash Movement');
  await expect(page.getByText('Financial operation needs recovery', { exact: true })).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Recover original result', exact: true }).click()]);
  await h.nav(page, 'Cash Movement');
  await expect(page.getByText('Financial operation needs recovery', { exact: true })).toHaveCount(0);
  expect(dropped).toBe(true);
  const movements = await h.records('cashTransfers');
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({ fromUserId: 'drill-owner', toType: 'bank', amount: 300 });
  expect(await h.get('bankBalanceControl/main')).toBeNull();
  expect(await h.get('appMetadata/appSettings')).toBeNull();
  expect((await h.get(h.base + '/handover/main')).checkpoint.cashActualPaise).toBe(0);
  expect((await h.get('dailyCashouts/' + source.id)).drawerTotal).toBe(1000);
  expect(source.drawerTotal * 100 - movements.reduce((total, movement) => total + movement.amount * 100, 0)).toBe(70000);
  await expect(page.locator('main')).toContainText('₹700');
  h.evidence.assertions.push({ independentPaise: { openingHeldCash: 100000, deposit: 30000, remainingHeld: 70000, drawer: 0 }, dropped });
});
test('F45-12 staff must not read owner bank balance through shared settings mirror',async({drill:h})=>{await h.db.doc('appMetadata/appSettings').set({currentBankBalance:12345.67},{merge:true});const leaks=[];for(const role of ['manager','billingA']){const {page}=await h.session(role);let settings;try{settings=await h.rpc(page,CLIENT,'read',['appMetadata/appSettings'])}catch(e){expect(e.message).toMatch(/permission|insufficient/i);settings=null}h.evidence.assertions.push({role,legacyBalanceVisible:settings?.currentBankBalance!==undefined});if(settings?.currentBankBalance!==undefined)leaks.push({role,balance:settings.currentBankBalance})}expect(leaks,'Shared operational settings must not disclose owner-only bank balance to either staff role').toEqual([])})

test('F45-13 Logs refund receipt remains visible through workspace clock refresh',async({drill:h})=>{const {page}=await h.session('owner');const bill=await h.rpc(page,CLIENT,'call',['finalizePosCheckout',{operationId:require('node:crypto').randomUUID(),businessDate:h.date,lines:[{id:'A',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:9000,expectedProductRevision:1,stockAtScan:20}],discount:{mode:'none',amountPaise:0},payments:[{method:'cash',amountPaise:18000}]}]);const selection={billId:bill.id,returnCondition:'sellable',returnLines:[{lineId:'A',quantity:1}]};const q=await h.rpc(page,CLIENT,'call',['quotePosReturn',selection]);await h.rpc(page,CLIENT,'call',['postPosReturn',{...selection,operationId:require('node:crypto').randomUUID(),reason:'Independent Logs receipt persistence probe',refundMethod:'cash',refundAmountPaise:9000,businessDate:q.businessDate,sourceBillRevision:q.sourceBillRevision,confirmationHash:q.confirmationHash}]);await h.nav(page,'Logs');await page.getByRole('tab',{name:'Expenses',exact:true}).click();await page.getByRole('button',{name:'View refund receipt',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText(bill.receiptNumber);for(let second=0;second<32;second++){await page.waitForTimeout(1000);await expect(dialog,'Source details must stay open until the user dismisses them').toBeVisible()}await dialog.getByRole('button',{name:'Close',exact:true}).click();expect((await h.records('cashouts'))[0].amountPaise).toBe(9000)})

test('F45-14 Logs date sorting changes chronology in both directions', async ({ drill: h }) => {
  const dateAt = offset => new Date(Date.parse(h.date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const earliest = dateAt(-2), middle = dateAt(-1), latest = h.date;
  const display = date => date.split('-').reverse().join('/');
  const b = h.db.batch();
  for (const [id, date, amount] of [['a', earliest, 10], ['b', latest, 20], ['c', middle, 30]]) b.set(h.db.doc('cashouts/drill-date-' + id), { id: 'drill-date-' + id, storeId: 'single-store', date, paidTo: 'Chronology ' + id, amount, category: 'Rent', paymentMode: 'Cash', approvedBy: 'Drill owner', notes: 'Independent dated source', createdAt: date + 'T10:00:00+05:30', updatedAt: date + 'T10:00:00+05:30' });
  await b.commit();
  const { page } = await h.session('owner');
  await h.nav(page, 'Logs');
  await page.getByRole('tab', { name: 'Expenses', exact: true }).click();
  await h.select(page, 'Date range', 'Custom range');
  await page.getByLabel('From', { exact: true }).fill(earliest);
  await page.getByLabel('To', { exact: true }).fill(latest);
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(display(latest));
  await expect(rows.first()).toContainText('Chronology b');
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await expect(rows.first()).toContainText(display(earliest));
  await expect(rows.first()).toContainText('Chronology a');
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await expect(rows.first()).toContainText(display(latest));
  expect(new Set((await rows.allTextContents()).map(row => row.match(/Chronology [abc]/)?.[0])).size).toBe(3);
  expect(await h.records('cashouts')).toHaveLength(3);
});

test('F45-15 staff payout permits billing before owner informational review and review never posts again',async({drill:h})=>{const {page:staff}=await h.session('billingA');await h.nav(staff,'Register');await staff.getByLabel('Recipient',{exact:true}).fill('Independent owner notification');await staff.getByLabel('Amount (₹)',{exact:true}).fill('25');await staff.getByRole('button',{name:'Record payment',exact:true}).click();await expect.poll(async()=>(await h.records('cashouts')).length).toBe(1);const [source]=await h.records('cashouts');expect(source).toMatchObject({amountPaise:2500,postedByUid:'drill-billingA',reviewStatus:'pending'});await h.nav(staff,'POS');const scanner=staff.getByRole('textbox',{name:'Scan barcode or search product name',exact:true});await scanner.fill('00001');await scanner.press('Enter');await expect(scanner).toHaveValue('');await staff.getByRole('spinbutton',{name:'Cash received',exact:true}).fill('100');await staff.getByRole('button',{name:'Finalize Bill',exact:true}).click();await expect.poll(async()=>(await h.records(h.base+'/bills')).length).toBe(1);expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(6500);const {page:owner}=await h.session('owner');await h.nav(owner,'Action Centre');const feed=owner.getByRole('region',{name:'Posted financial activity',exact:true});await expect(feed).toContainText('Independent owner notification');await feed.getByRole('button',{name:'View posted activity',exact:true}).click();const dialog=owner.getByRole('dialog',{name:'Posted financial activity details',exact:true});await expect(dialog).toContainText('Drill billingA');await dialog.getByRole('button',{name:'Mark Reviewed',exact:true}).click();await expect.poll(async()=>(await h.get('cashouts/'+source.id)).reviewStatus).toBe('reviewed');expect((await h.get(h.base+'/handover/main')).cashNetPaise).toBe(6500);expect(await h.records('cashouts')).toHaveLength(1);expect((await h.get('cashouts/'+source.id)).amountPaise).toBe(2500);expect((await h.get(h.base+'/products/drill-product-1')).currentQuantity).toBe(19);await owner.getByRole('tab',{name:'History',exact:true}).click();await expect(owner.getByRole('region',{name:'Posted financial activity',exact:true})).toContainText('Independent owner notification');h.evidence.assertions.push({independentPaise:{sale:9000,payout:2500,cashNet:6500},sourceId:source.id})})


test('OPS-01 actual Chrome process restart restores real Auth and recovers one committed expense', async ({ drill: h }, info) => {
 test.setTimeout(150000)
 info.annotations.push({ type: 'layer', description: 'Two successive owned Chrome processes using one synthetic persistent profile on this PC; actual Auth persistence, no storage copying, service workers blocked. Not physical-device/PWA acceptance.' })
 const path = require('node:path'), { execFileSync } = require('node:child_process')
 const { chromium } = require(process.env.DRILL_PLAYWRIGHT_ROOT)
 const marker = 'restart-profile-' + require('node:crypto').randomUUID()
 const profile = path.resolve('output/playwright', process.env.DRILL_RUN_ID, marker)
 const processes = () => {
  const script = `$drillChromeRows = @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; started = $_.CreationDate.ToUniversalTime().ToString('o') } }); ConvertTo-Json -InputObject $drillChromeRows -Compress`
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true }))
 }
 const launch = () => chromium.launchPersistentContext(profile, { executablePath: process.env.DRILL_BROWSER_EXECUTABLE, headless: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce', args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] })
 let first, second
 try {
  first = await launch()
  const beforeProcesses = processes()
  expect(beforeProcesses).toHaveLength(1)
  const { page } = await h.session('billingA', { context: first })
  await h.nav(page, 'Register')
  let dropped = false
  await page.route('**/asia-south1/postFinanceOperation', async route => {
   const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null
   if (!dropped && body?.data?.kind === 'expense') {
    expect(route.request().url().startsWith('http://127.0.0.1:5001/demo-alphahub-drill/asia-south1/')).toBe(true)
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    dropped = true
    await route.abort('failed')
   } else await route.fallback()
  })
  await page.getByLabel('Recipient', { exact: true }).fill('Synthetic process restart')
  await page.getByLabel('Amount (\u20b9)', { exact: true }).fill('50')
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(page.getByText('Financial operation needs recovery', { exact: true })).toBeVisible()
  const expenses = await h.records('cashouts'), operations = await h.records('financeOperations')
  expect(expenses).toHaveLength(1)
  expect(expenses[0]).toMatchObject({ amountPaise: 5000, postedByUid: 'drill-billingA' })
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-5000)
  await first.close()
  await expect.poll(processes).toEqual([])
  second = await launch()
  const afterProcesses = processes()
  expect(afterProcesses).toHaveLength(1)
  expect(afterProcesses[0]).not.toEqual(beforeProcesses[0])
  const { page: restored } = await h.session('billingA', { context: second, resume: true })
  await h.nav(restored, 'Register')
  await expect(restored.getByText('Financial operation needs recovery', { exact: true })).toBeVisible()
  await Promise.all([restored.waitForEvent('load'), restored.getByRole('button', { name: 'Recover original result', exact: true }).click()])
  await h.nav(restored, 'Register')
  await expect(restored.getByLabel('Amount (\u20b9)', { exact: true })).toHaveValue('')
  expect(await h.records('cashouts')).toEqual(expenses)
  expect(await h.records('financeOperations')).toEqual(operations)
  expect((await h.get(h.base + '/handover/main')).cashNetPaise).toBe(-5000)
  expect((await h.get(h.base + '/cashierStates/drill-billingA')).needsLogoutCheck).toBe(true)
  expect(dropped).toBe(true)
  const screenshot = info.outputPath('restart-recovered.png')
  await restored.screenshot({ path: screenshot, fullPage: true })
  await info.attach('restart-recovered', { path: screenshot, contentType: 'image/png' })
  h.evidence.assertions.push({ kind: 'actual-browser-process-restart', profile, beforeProcesses, afterProcesses, firstProcessGoneBeforeRelaunch: true, storageStateCopied: false, independentExpensePaise: 5000, independentDrawerDeltaPaise: -5000 })
 } finally {
  await second?.close()
  await first?.close()
  await expect.poll(processes).toEqual([])
 }
})
