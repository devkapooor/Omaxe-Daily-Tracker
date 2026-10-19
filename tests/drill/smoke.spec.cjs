const {test,expect,admin}=require('./helpers.cjs')
test('ENV-01 real emulator isolation and outbound denial',async({drill:h})=>{
 const {page}=await h.session('owner')
 const endpoints=h.evidence.requests.map(r=>r.url)
 expect(endpoints.some(u=>u.startsWith('http://127.0.0.1:9099/'))).toBe(true)
 expect(endpoints.some(u=>u.startsWith('http://127.0.0.1:8080/'))).toBe(true)
 expect(endpoints.some(u=>u.includes('127.0.0.1:5001/demo-alphahub-drill/asia-south1/getServerTime'))).toBe(true)
 const result=await page.evaluate(()=>fetch('https://firestore.googleapis.com/drill-isolation-probe').then(()=>true).catch(()=>false))
 expect(result).toBe(false);expect(h.evidence.blocked.some(r=>r.url.includes('firestore.googleapis.com'))).toBe(true)
 expect(await h.records('loans')).toEqual([])
})
test('AUTH-01 owner and staff navigation with real profile gates',async({drill:h})=>{
 for(const role of ['owner','manager','billingA','billingB']){
  const {page}=await h.session(role)
  for(const label of ['POS','Stock','Vendor Workspace','Party Directory','Register','Cash Movement','Settings'])await expect(page.getByRole('button',{name:new RegExp('^'+label+'(?:\\s|$)')}).first()).toBeVisible()
  expect(await page.getByRole('button',{name:/^Cashout(?:\s|$)/}).count()).toBe(1)
  for(const label of ['Loans','Action Centre','Logs'])expect(await page.getByRole('button',{name:new RegExp('^'+label+'(?:\\s|$)')}).count()).toBe(role==='owner'?1:0)
  await h.nav(page,'Stock');await expect(page.getByRole('tablist',{name:'Stock sections'}).getByRole('tab')).toHaveCount(5)
  await h.nav(page,'POS');await expect(page.getByRole('tablist',{name:'POS sections'}).getByRole('tab')).toHaveCount(3)
 }
 const states=await h.records(admin.base+'/cashierStates');expect(states.filter(s=>s.joinedCounterId==='fixture-opening').length).toBeGreaterThanOrEqual(3)
})
test('AUTH-02 disabled and missing profiles never enter business UI',async({drill:h})=>{
 for(const role of ['disabled','missing']){const {page}=await h.session(role,{gate:false});await expect(page.getByText(role==='missing'?/no matching workspace profile/i:/disabled|deactivated|not active/i).first()).toBeVisible();await expect(page.getByRole('button',{name:/^Stock(?:\s|$)/})).toHaveCount(0)}
 expect(await h.records(admin.base+'/bills')).toEqual([])
})
test('AUTH-03 wrong password and anonymous callable denied',async({drill:h})=>{
 const {page}=await h.session('owner',{password:'SyntheticWrongPassword!',gate:false});await expect(page.getByText(/invalid|password|credential/i).last()).toBeVisible()
 const {page:anonymous}=await h.session('unauthenticated')
 const error=await anonymous.evaluate(async()=>{const {functions}=await import('/src/shared/lib/firebase.ts');const {httpsCallable}=await import('/node_modules/.vite/deps/firebase_functions.js');try{await httpsCallable(functions,'getServerTime')();return null}catch(e){return e.code}})
 expect(error).toBe('functions/unauthenticated')
})
