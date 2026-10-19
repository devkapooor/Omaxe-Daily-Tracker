const { describe, it, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createSharedViewHandlers } = require('./sharedViews')
describe('private bank and staff-safe settings publication', {skip: !process.env.FIRESTORE_EMULATOR_HOST}, () => {
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local emulator required')
  const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore')
  const project='demo-shared-views',app=initializeApp({projectId:project},'shared-view-tests'),db=getFirestore(app),now=Date.parse('2026-10-16T05:00:00Z'),handlers=createSharedViewHandlers(db,()=>now)
  const call=(data,uid='owner')=>({auth:uid?{uid}:null,data}),get=async p=>(await db.doc(p).get()).data()
  let metrics,settings
  beforeEach(async()=>{
    assert.equal((await db.collection('loans').limit(1).get()).size,0)
    assert.equal((await fetch('http://127.0.0.1:8080/emulator/v1/projects/'+project+'/databases/(default)/documents',{method:'DELETE'})).ok,true)
    metrics=structuredClone(require('../tests/drill/empty-metrics.json'))
    metrics.updatedAt='2026-10-16T04:00:00Z'
    metrics.planner.groupedSchedule=[{date:'2026-10-16',totalAmount:300,items:[{id:'cheque-1',amount:300,date:'2026-10-16',note:'Fixture cheque',source:'vendor-cheque',title:'Vendor',runningBalanceAfter:12045.67,status:'available',chequeNumber:'100001',unexpectedPrivate:{balance:12345.67}}]}]
    settings={currentBankBalance:12345.67,marginPercentage:25,monthlyOperationalExpense:0,operationalExpenseBreakdown:{rent:0,electricity:0,maintenance:0,salaries:0,royalty:0,caFee:0,miscellaneous:0},scheduledNotifications:[],upgradeAnnouncement:null}
    const b=db.batch()
    for(const role of ['owner','manager','billing','disabled'])b.set(db.doc('users/'+role),{name:'Synthetic '+role,role:role==='disabled'?'owner':role,disabled:role==='disabled',approvalStatus:'approved'})
    b.set(db.doc('appMetadata/appSettings'),settings);b.set(db.doc('appMetadata/workspaceMetrics'),metrics);b.set(db.doc('bankBalanceControl/main'),{balancePaise:1234567,revision:7,initialized:true});b.set(db.doc('cashouts/historical'),{amountPaise:123,postedByUid:'billing'})
    await b.commit()
  })
  after(()=>deleteApp(app))
  it('dry-run discloses field names/revisions only and does not publish or mutate canonical bank/history',async()=>{
    const result=await handlers.publishExisting(call({dryRun:true}))
    assert.equal(result.dryRun,true);assert.equal(JSON.stringify(result).includes('12345'),false)
    assert.equal(await get('appMetadata/staffSettings'),undefined)
    assert.deepEqual(await get('appMetadata/appSettings'),settings);assert.equal((await get('bankBalanceControl/main')).revision,7)
    assert.deepEqual(await get('cashouts/historical'),{amountPaise:123,postedByUid:'billing'})
  })
  it('publishes safe nonempty planner rows without bank amount, running balance or deficit signals',async()=>{
    await handlers.publishExisting(call({dryRun:false,expectedSettingsRevision:0,expectedMetricsUpdatedAt:metrics.updatedAt}))
    const s=await get('appMetadata/staffSettings'),m=await get('appMetadata/staffWorkspaceMetrics')
    assert.equal(s.schemaVersion,1);assert.equal(s.currentBankBalance,undefined)
    const row=m.planner.groupedSchedule[0].items[0]
    assert.equal(row.amount,300);assert.equal(row.chequeNumber,'100001');assert.equal(row.runningBalanceAfter,undefined);assert.equal(row.status,undefined);assert.equal(row.unexpectedPrivate,undefined)
    assert.equal(JSON.stringify([s,m]).includes('12345.67'),false)
    assert.deepEqual(await get('appMetadata/appSettings'),settings);assert.deepEqual(await get('appMetadata/workspaceMetrics'),metrics)
  })
  it('rejects unauthenticated, staff, missing and disabled publishers on every entry point',async()=>{
    for(const uid of [null,'manager','billing','missing','disabled'])for(const [name,data]of [['publishExisting',{dryRun:true}],['publishMetrics',{metrics,expectedUpdatedAt:metrics.updatedAt}],['updateSettings',{operationId:randomUUID(),kind:'clear-announcement',value:null}]])await assert.rejects(handlers[name](call(data,uid)),e=>['unauthenticated','permission-denied'].includes(e.code))
    assert.equal(await get('appMetadata/staffSettings'),undefined)
  })
  it('rejects stale release publication without writing safe projections',async()=>{
    await assert.rejects(handlers.publishExisting(call({dryRun:false,expectedSettingsRevision:1,expectedMetricsUpdatedAt:metrics.updatedAt})),e=>e.code==='aborted')
    assert.equal(await get('appMetadata/staffSettings'),undefined)
  })
  it('updates operational settings and their projection/audit atomically using the trusted actor',async()=>{
    const operationId=randomUUID(),request=call({operationId,kind:'operations',value:{marginPercentage:30,operationalExpenseBreakdown:{rent:100,electricity:20,maintenance:3,salaries:200,royalty:4,caFee:5,miscellaneous:6}}})
    assert.equal((await handlers.updateSettings(request)).revision,1)
    assert.equal((await get('appMetadata/appSettings')).monthlyOperationalExpense,338)
    assert.equal((await get('appMetadata/staffSettings')).monthlyOperationalExpense,338)
    assert.equal((await get('appMetadata/appSettings')).currentBankBalance,12345.67)
    assert.equal((await get('settingsAudit/'+operationId)).actorUid,'owner')
    assert.deepEqual(await get('bankBalanceControl/main'),{balancePaise:1234567,revision:7,initialized:true})
  })
  it('recovers original settings result and rejects changed intent under the same ID',async()=>{
    const operationId=randomUUID(),data={operationId,kind:'announcement',value:{title:'Update',message:'Synthetic staff notice',durationHours:4}}
    const first=await handlers.updateSettings(call(data));assert.deepEqual(await handlers.updateSettings(call(data)),first)
    assert.equal((await db.collection('settingsAudit').get()).size,1)
    await assert.rejects(handlers.updateSettings(call({...data,value:{...data.value,durationHours:24}})),e=>e.code==='already-exists')
    const notice=(await get('appMetadata/staffSettings')).upgradeAnnouncement
    assert.equal(notice.publishedBy,'Synthetic owner');assert.equal(notice.expiresAt,'2026-10-16T09:00:00.000Z')
  })
  it('rejects forged bank fields, unknown kinds, invalid margins, invalid notifications and extra fields without changes',async()=>{
    for(const data of [
      {kind:'operations',value:{marginPercentage:50,operationalExpenseBreakdown:settings.operationalExpenseBreakdown,currentBankBalance:999}},
      {kind:'operations',value:{marginPercentage:101,operationalExpenseBreakdown:settings.operationalExpenseBreakdown}},
      {kind:'notifications',value:[{id:'x',title:'x',message:'x',enabled:true,targetRoles:['owner'],triggerTime:'12:00'}]},
      {kind:'bank-baseline',value:999},
      {kind:'clear-announcement',value:null,actorUid:'forged'}
    ])await assert.rejects(handlers.updateSettings(call({operationId:randomUUID(),...data})),e=>e.code==='invalid-argument')
    assert.deepEqual(await get('appMetadata/appSettings'),settings);assert.equal((await db.collection('settingsAudit').get()).size,0)
  })
  it('publishes and clears staff notifications/announcements in the same revisioned projection',async()=>{
    const value=[{id:'end',title:'Count',message:'Synthetic notice',enabled:true,targetRoles:['billing','manager'],triggerTime:'23:50'}]
    await handlers.updateSettings(call({operationId:randomUUID(),kind:'notifications',value}))
    assert.deepEqual((await get('appMetadata/staffSettings')).scheduledNotifications,value)
    await handlers.updateSettings(call({operationId:randomUUID(),kind:'clear-announcement',value:null}))
    assert.equal((await get('appMetadata/staffSettings')).sourceRevision,2)
    assert.equal((await get('appMetadata/staffSettings')).upgradeAnnouncement,null)
  })
  it('publishes metrics atomically, sanitises nested rows and rejects stale owner cache publication',async()=>{
    await handlers.publishMetrics(call({metrics,expectedUpdatedAt:metrics.updatedAt}))
    assert.equal((await get('appMetadata/workspaceMetrics')).updatedAt,'2026-10-16T05:00:00.000Z')
    assert.equal((await get('appMetadata/staffWorkspaceMetrics')).planner.groupedSchedule[0].items[0].runningBalanceAfter,undefined)
    await assert.rejects(handlers.publishMetrics(call({metrics,expectedUpdatedAt:metrics.updatedAt})),e=>e.code==='aborted')
    assert.equal((await get('bankBalanceControl/main')).balancePaise,1234567)
  })
})
