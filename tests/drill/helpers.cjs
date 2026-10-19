const fs=require('node:fs'),path=require('node:path')
const {test:baseTest,expect}=require(path.join(process.env.DRILL_PLAYWRIGHT_ROOT,'test'))
const admin=require('./safe-admin.cjs')
const BASE='http://127.0.0.1:5178'
const ORIGINS=new Set([BASE,'http://127.0.0.1:9099','http://127.0.0.1:8080','http://127.0.0.1:5001'])
const test=baseTest.extend({drill:[async({browser},use,info)=>{
 const fixture=await admin.seed();const sessions=[];const evidence={fixture,requests:[],blocked:[],console:[],failed:[],assertions:[],records:[]}
 const h={...admin,expect,fixture,evidence,
  async session(role='owner',options={}){
   const context=await browser.newContext({viewport:options.viewport??{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'})
   const page=await context.newPage();sessions.push({context,page,role})
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(!['http:','https:'].includes(url.protocol))return route.continue()
    if(!ORIGINS.has(url.origin)){evidence.blocked.push({role,method:request.method(),url:url.origin+url.pathname});return route.abort('blockedbyclient')}
    if(url.origin==='http://127.0.0.1:5001'&&!url.pathname.startsWith('/demo-alphahub-drill/')){evidence.blocked.push({role,url:url.pathname,reason:'wrong-project'});return route.abort('blockedbyclient')}
    const body=request.postData()??''
    const projects=[...body.matchAll(/projects(?:\/|%2F)([a-z0-9-]+)(?:\/|%2F)/g)].map(m=>m[1])
    if(projects.some(p=>p!==admin.PROJECT))return route.abort('blockedbyclient')
    evidence.requests.push({role,method:request.method(),url:url.origin+url.pathname,projects,query:body.includes('structuredQuery')?body.slice(0,3000):undefined,listen:url.pathname.includes('/Listen/')?[...new URLSearchParams(body).values()].filter(value=>value.includes('addTarget')||value.includes('removeTarget')):undefined})
    await route.continue()
   })
   page.on('console',message=>{if(['error','warning'].includes(message.type()))evidence.console.push({role,type:message.type(),message:message.text()})})
   page.on('pageerror',error=>evidence.console.push({role,type:'pageerror',message:error.message}))
   page.on('requestfailed',request=>evidence.failed.push({role,url:new URL(request.url()).origin+new URL(request.url()).pathname,error:request.failure()?.errorText}))
   await page.goto(BASE)
   const client=await page.evaluate(async()=>{const f=await import('/src/shared/lib/firebase.ts');const a=f.auth.emulatorConfig;return {project:f.firebaseConfig.projectId,auth:a?`${a.protocol}://${a.host}:${a.port}`:null,firestore:f.db._settings.host,functions:f.functions.emulatorOrigin,bypass:f.isLocalAuthBypassEnabled}})
   expect(client).toEqual({project:admin.PROJECT,auth:'http://127.0.0.1:9099',firestore:'127.0.0.1:8080',functions:'http://127.0.0.1:5001',bypass:false})
   evidence.assertions.push({kind:'pre-login-isolation',role,client})
   if(role!=='unauthenticated'){
    await page.getByRole('textbox',{name:'Email',exact:true}).fill(role.toLowerCase()+'@drill.invalid')
    await page.getByLabel('Password',{exact:true}).fill(options.password??admin.PASSWORD)
    await page.getByRole('button',{name:'Open Workspace',exact:true}).click()
    if(options.gate!==false){
     await expect(page.getByRole('button',{name:/^Stock(?:\s|$)/}).first()).toBeVisible();await h.clock(page)
     const ledger=await admin.get(admin.base+'/handover/main')
     if(ledger?.counterSession?.status==='open'&&!ledger.countReservation)await expect.poll(async()=>(await admin.get(admin.base+'/cashierStates/drill-'+role))?.joinedCounterId).toBe(ledger.counterSession.openingReconciliationId)
    }
   }
   return {page,context,role}
  },
  async clock(page){const proof=await page.evaluate(async()=>{const m=await import('/src/shared/lib/serverClock.ts');const sample=await m.synchronizeServerClock();return {sample,browserNow:Date.now(),browserDate:new Date().getTime(),serverIso:m.serverNowIso()}});expect(Number.isFinite(proof.sample)).toBe(true);expect(Math.abs(proof.sample-proof.browserNow),'local emulator/browser trusted clock agreement before business operations').toBeLessThan(5000);expect(Math.abs(proof.browserDate-proof.browserNow),'Date constructor/Date.now agreement').toBeLessThan(1000);evidence.assertions.push({kind:'clock-isolation',role:'session',...proof});return proof.sample},
  async nav(page,label){const open=page.getByRole('button',{name:'Open navigation',exact:true});if(await open.isVisible())await open.click();await page.getByRole('button',{name:new RegExp('^'+label+'(?:\\s|$)')}).first().click()},
  async select(page,label,option){await page.getByRole('textbox',{name:new RegExp('^'+label)}).first().click();await page.getByRole('option',{name:option,exact:true}).click()},
  async rpc(page,module,name,args=[]){
   const target=module.startsWith('/tests/drill/')?module+'?drillAttempt='+process.env.DRILL_ATTEMPT:module
   return page.evaluate(async({module,name,args})=>{const m=await import(module);if(typeof m[name]!=='function')throw Error('DRILL_HELPER_UNAVAILABLE: '+name);return m[name](...args)},{module:target,name,args})
  },
  async actor(page){return h.rpc(page,'/tests/drill/client.ts','who')},
  async get(p){const value=await admin.get(p);evidence.records.push({path:p,value});return value},
  async records(p){const value=await admin.records(p);evidence.records.push({path:p,value});return value},
 }
 try{await use(h)}finally{
  if(info.status!==info.expectedStatus){for(const p of ['posSandboxes/test/bills','posSandboxes/test/billStates','posSandboxes/test/events','posSandboxes/test/stockMovements','posSandboxes/test/stockPriceChanges','posSandboxes/test/approvals','posSandboxes/test/handover','posSandboxes/test/reconciliations','vendorAccountStatesV2','purchasesV2','vendorLedgerEntriesV2','invoiceStatesV2','vendorSettlementsV2','dailyCashouts','cashTransfers','sales','cashouts'])evidence.records.push({forensic:true,path:p,value:await admin.records(p).catch(error=>({error:error.message}))})}
  for(const s of sessions){if(info.status!==info.expectedStatus){await s.page.screenshot({path:info.outputPath('failure-'+s.role+'.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(info.outputPath('dom-'+s.role+'.txt'),await s.page.locator('body').innerText().catch(()=>''))}await s.context.close()}
  fs.writeFileSync(info.outputPath('evidence.json'),JSON.stringify(evidence,null,2))
  await info.attach('isolated-evidence',{path:info.outputPath('evidence.json'),contentType:'application/json'})
 }
},{auto:true}]})
module.exports={test,expect,admin,BASE}
