const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')
const { canonical, hash } = require('./stockOperations')
const VERSION = 1
const fail = (message, code = 'invalid-argument') => { throw new HttpsError(code, message) }
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('Unsupported shared-view fields. Reload AlphaHub.')
  return value
}
function number(value, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail('Enter a valid nonnegative setting.')
  return value
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('Enter valid settings text.')
  return value.trim()
}
const expenseKeys = ['rent', 'electricity', 'maintenance', 'salaries', 'royalty', 'caFee', 'miscellaneous']
function notices(value) {
  if (!Array.isArray(value) || value.length > 25) fail('Use at most 25 staff notifications.')
  const ids = new Set()
  return value.map(n => {
    object(n, ['id', 'title', 'message', 'triggerTime', 'targetRoles', 'enabled'])
    const id = text(n.id, 180)
    if (ids.has(id) || typeof n.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(n.triggerTime) || !Array.isArray(n.targetRoles) || !n.targetRoles.length || n.targetRoles.some(r => !['manager', 'billing'].includes(r))) fail('Invalid staff notification.')
    ids.add(id)
    return { id, title: text(n.title, 100), message: text(n.message, 1000), triggerTime: n.triggerTime, targetRoles: [...new Set(n.targetRoles)], enabled: n.enabled }
  })
}
function settingsProjection(source, timestamp) {
  // Explicit allowlist: never spread a private settings object into a staff document.
  const result = { schemaVersion: VERSION, sourceRevision: source.sharedSettingsRevision || 0, publishedAt: timestamp }
  for (const k of ['marginPercentage', 'monthlyOperationalExpense']) if (source[k] !== undefined) result[k] = number(source[k])
  if (source.operationalExpenseBreakdown) result.operationalExpenseBreakdown = Object.fromEntries(expenseKeys.map(k => [k, number(source.operationalExpenseBreakdown[k] ?? 0)]))
  if (source.scheduledNotifications !== undefined) result.scheduledNotifications = notices(source.scheduledNotifications)
  if (source.upgradeAnnouncement === null) result.upgradeAnnouncement = null
  else if (source.upgradeAnnouncement) {
    const a = source.upgradeAnnouncement
    result.upgradeAnnouncement = Object.fromEntries(['id', 'title', 'message', 'publishedAt', 'expiresAt', 'publishedBy'].map(k => [k, text(a[k], k === 'message' ? 500 : 180)]))
  }
  return result
}
// Schemas include only existing staff-facing information. Private planner balances
// and funding/deficit signals are deliberately absent, including on nested rows.
const numeric = 'number', string = 'string', nullableString = 'nullableString'
const labelAmount = { label: string, amount: numeric }
const range = { from: string, to: string, sales: numeric, expenses: numeric, salesLastUpdated: nullableString, expensesLastUpdated: nullableString }
const dailyCashout = Object.fromEntries(['id','date','recordedBy','recordedByUserId','recordedByHolder','createdAt','updatedAt','notes','legacySourceId'].map(k => [k, 'optionalString']))
Object.assign(dailyCashout, Object.fromEntries(['drawerTotal','remainingBalance','cashSales','machineSales','creditSales','cashExpenses','expectedCash','systemAudit','denom500','denom200','denom100','denom50','denom20','denom10','change','auditDifference'].map(k => [k, 'optionalNumber'])))
const transfer = Object.fromEntries(['id','date','from','fromUserId','toType','toUserId','toPerson','bankDepositMethod','notes','createdBy','createdAt','sourceDailyCashoutId'].map(k => [k, 'optionalString']))
transfer.amount = numeric
const summary = { month: string, label: string, marginPercentage: numeric, totalSales: numeric, totalCashoutExpenses: numeric, grossProfitEstimate: numeric, totalPurchases: numeric, vendorPaymentTotal: numeric, totalReturns: numeric, updatedAt: nullableString }
const detail = { ...summary, salesMix: Object.fromEntries(['cashSales','upiSales','cardSales','bankTransferSales','creditSales','returnsDiscounts'].map(k => [k,numeric])), expenseByCategory:[labelAmount], paymentTotals:{totalPaid:numeric,totalReceived:numeric,vendorPayments:numeric,loanPaymentsPaid:numeric}, purchaseTotals:{purchaseCount:numeric,totalPurchases:numeric}, operationalFlow:{dailyCashoutCount:numeric,drawerTotalRecorded:numeric,transferredToBank:numeric,transferredToPeople:numeric,pendingCashSignal:numeric}, liabilitySnapshot:{currentVendorOutstanding:numeric,currentOpenLoanBalance:numeric} }
const metricsSchema = {
  updatedAt: nullableString, generatedForDate: string, dashboardRanges: { yesterday: range, mtd: range },
  registerToday: Object.fromEntries(['cashout','cashExpenses','paymentPaid','paymentReceived','paymentNet'].map(k=>[k,numeric])),
  projections: Object.fromEntries(['averageDailySales','projectedMonthlySales','monthlyOperationalExpense','marginPercentage','projectedMarginValue','projectedProfit','projectedLoss'].map(k=>[k,numeric])),
  latestClosedDaySummary: { date: nullableString, ...Object.fromEntries(['totalSales','cashSales','upiSales','cardSales','creditSales','returns','cashExpenses','cashToHand','transfersToday'].map(k=>[k,numeric])) },
  liabilities:{totalLoans:numeric,totalVendorOutstanding:numeric,openLoanCount:numeric},vendorOutstandingByName:{'*':numeric},
  pendingCash:{bankTotal:numeric,legacyBalances:[{holder:string,label:string,amount:numeric,cashoutCount:numeric,transferInCount:numeric,transferOutCount:numeric}],legacyCashoutEntries:[dailyCashout],legacyTransferEntries:[transfer],migratedCashoutEntries:[dailyCashout],userBalances:[{userId:string,name:string,amount:numeric}],totalCounterCash:numeric},
  dashboardTables:{month:string,expenseByCategory:[labelAmount],monthlyPurchaseTotal:numeric,vendorPaymentTotal:numeric,paymentByMode:[labelAmount]},
  planner:{totalCounterCash:numeric,groupedSchedule:[{date:string,totalAmount:numeric,items:[{id:string,amount:numeric,date:string,note:string,source:string,title:string,chequeNumber:'optionalString'}]}]},
  monthlyReports:{months:[string],defaultSelectedMonth:nullableString,summaries:[summary],detailsByMonth:{'*':detail}},
}
function project(value, schema, path = 'metrics') {
  if (typeof schema === 'string') {
    if (schema.startsWith('optional') && value === undefined) return undefined
    if (schema === nullableString && value === null) return null
    if (schema.endsWith('Number') || schema === numeric) { if (typeof value !== 'number' || !Number.isFinite(value)) fail('Invalid '+path); return value }
    if (typeof value !== 'string' || value.length > 10000) fail('Invalid '+path)
    return value
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length > 10000) fail('Invalid '+path)
    return value.map((v,i)=>project(v,schema[0],path+'.'+i))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid '+path)
  const entries = schema['*'] ? Object.keys(value).map(k=>[k,schema['*']]) : Object.entries(schema)
  return Object.fromEntries(entries.map(([k,s])=>[k,project(value[k],s,path+'.'+k)]).filter(([,v])=>v!==undefined))
}
function metricsProjection(source, timestamp) {
  return { ...project(source, metricsSchema), schemaVersion: VERSION, publishedAt: timestamp }
}
function createSharedViewHandlers(db, clock = () => Date.now()) {
  const ref = key => db.doc('appMetadata/'+key)
  async function owner(tx, request) {
    if (!request.auth?.uid) fail('Sign in to publish workspace settings.', 'unauthenticated')
    const profile = (await tx.get(db.doc('users/'+request.auth.uid))).data()
    if (!activeUser(profile) || profile.role !== 'owner') fail('Only the owner may publish workspace settings.', 'permission-denied')
    return { uid:request.auth.uid, name:profile.name || request.auth.uid }
  }
  async function updateSettings(request) {
    const d=object(request.data,['operationId','kind','value'])
    if (typeof d.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d.operationId)) fail('Invalid settings operation reference.')
    return db.runTransaction(async tx=>{
      const actor=await owner(tx,request), opRef=db.doc('sharedViewOperations/'+d.operationId)
      const [saved,snapshot]=await Promise.all([tx.get(opRef),tx.get(ref('appSettings'))])
      const signature=hash(JSON.stringify(canonical(d)))
      if(saved.exists){const op=saved.data();if(op.actorUid!==actor.uid||op.signature!==signature)fail('This settings operation belongs to a different actor or intent.','already-exists');return op.result}
      const timestamp=new Date(clock()).toISOString(), before=snapshot.data()||{}, patch={}; let action
      if(d.kind==='operations'){
        object(d.value,['marginPercentage','operationalExpenseBreakdown'])
        object(d.value.operationalExpenseBreakdown,expenseKeys)
        patch.marginPercentage=number(d.value.marginPercentage,100)
        patch.operationalExpenseBreakdown=Object.fromEntries(expenseKeys.map(k=>[k,number(d.value.operationalExpenseBreakdown[k])]))
        patch.monthlyOperationalExpense=number(Object.values(patch.operationalExpenseBreakdown).reduce((a,b)=>a+b,0))
        action='Operational settings updated'
      }else if(d.kind==='notifications'){patch.scheduledNotifications=notices(d.value);action='Scheduled blocking notifications updated'}
      else if(d.kind==='announcement'){
        object(d.value,['title','message','durationHours'])
        if(![1,4,24].includes(d.value.durationHours))fail('Choose a valid announcement duration.')
        patch.upgradeAnnouncement={id:d.operationId,title:text(d.value.title,100),message:text(d.value.message,500),publishedAt:timestamp,expiresAt:new Date(clock()+d.value.durationHours*3600000).toISOString(),publishedBy:actor.name}
        action='App upgrade announcement published'
      }else if(d.kind==='clear-announcement'){if(d.value!==null)fail('Invalid clear-announcement intent.');patch.upgradeAnnouncement=null;action='App upgrade announcement cleared'}
      else fail('Unsupported settings operation.')
      patch.sharedSettingsRevision=(before.sharedSettingsRevision||0)+1
      const result={revision:patch.sharedSettingsRevision,operationId:d.operationId}
      tx.set(ref('appSettings'),patch,{merge:true})
      tx.set(ref('staffSettings'),settingsProjection({...before,...patch},timestamp))
      tx.create(db.doc('settingsAudit/'+d.operationId),{action,actor:actor.name,actorUid:actor.uid,createdAt:timestamp})
      tx.create(opRef,{actorUid:actor.uid,signature,result,createdAt:timestamp})
      return result
    })
  }
  async function publishMetrics(request){
    const d=object(request.data,['metrics','expectedUpdatedAt'])
    // Validate and strip unknown/private fields before constructing the shared view.
    project(d.metrics,metricsSchema)
    return db.runTransaction(async tx=>{
      await owner(tx,request)
      const before=(await tx.get(ref('workspaceMetrics'))).data()
      if((before?.updatedAt??null)!==d.expectedUpdatedAt)fail('Reporting cache changed. Wait for it to refresh before publishing.','aborted')
      const timestamp=new Date(clock()).toISOString(), full={...d.metrics,updatedAt:timestamp}
      tx.set(ref('workspaceMetrics'),full)
      tx.set(ref('staffWorkspaceMetrics'),metricsProjection(full,timestamp))
      return {updatedAt:timestamp}
    })
  }
  async function publishExisting(request){
    const d=object(request.data,['dryRun','expectedSettingsRevision','expectedMetricsUpdatedAt'])
    if(typeof d.dryRun!=='boolean')fail('Specify dryRun explicitly.')
    return db.runTransaction(async tx=>{
      await owner(tx,request)
      const [s,m]=await Promise.all([tx.get(ref('appSettings')),tx.get(ref('workspaceMetrics'))])
      if(!s.exists||!m.exists)fail('Canonical settings/reporting cache unavailable. No views published.','failed-precondition')
      const settings=s.data(),metrics=m.data(),timestamp=new Date(clock()).toISOString()
      const safeSettings=settingsProjection(settings,timestamp),safeMetrics=metricsProjection(metrics,timestamp)
      const result={settingsRevision:settings.sharedSettingsRevision||0,metricsUpdatedAt:metrics.updatedAt??null,schemaVersion:VERSION,settingsKeys:Object.keys(safeSettings),metricsKeys:Object.keys(safeMetrics),dryRun:d.dryRun}
      if(!d.dryRun){
        if(d.expectedSettingsRevision!==result.settingsRevision||d.expectedMetricsUpdatedAt!==result.metricsUpdatedAt)fail('Canonical views changed since review. Run the dry-run again.','aborted')
        tx.set(ref('staffSettings'),safeSettings);tx.set(ref('staffWorkspaceMetrics'),safeMetrics)
      }
      return result
    })
  }
  return {updateSettings,publishMetrics,publishExisting}
}
module.exports={createSharedViewHandlers,settingsProjection,metricsProjection,VERSION}
