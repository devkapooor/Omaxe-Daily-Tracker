const path = require('node:path')
require('./server-guard.cjs')
const {createRequire}=require('node:module')
const load=createRequire(path.resolve('functions/package.json'))
const PROJECT='demo-alphahub-drill'
if(process.env.GCLOUD_PROJECT!==PROJECT || process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099') throw Error('DRILL_ISOLATION: exact demo project and emulator hosts required before Admin initialization')
const {initializeApp,getApps}=load('firebase-admin/app')
const app=getApps().find(a=>a.name==='drill')??initializeApp({projectId:PROJECT},'drill')
const db=load('firebase-admin/firestore').getFirestore(app)
const auth=load('firebase-admin/auth').getAuth(app)
async function health(){
 const response=await fetch('http://127.0.0.1:4400/emulators');if(!response.ok)throw Error('Emulator hub missing')
 const services=await response.json()
 for(const [name,port] of Object.entries({auth:9099,firestore:8080,functions:5001}))if(services[name]?.port!==port)throw Error('Wrong/missing emulator '+name)
 if((await db.collection('loans').limit(1).get()).size)throw Error('DRILL_ISOLATION: loan records present; reset refused')
 return {project:PROJECT,services,firestoreHost:process.env.FIRESTORE_EMULATOR_HOST,authHost:process.env.FIREBASE_AUTH_EMULATOR_HOST}
}
const base='posSandboxes/test'
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const PASSWORD='DrillSynthetic123!'
async function seed(mode='open'){
 const proof=await health()
 const clear=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,{method:'DELETE'})
 if(!clear.ok)throw Error('Demo Firestore reset failed')
 const accounts=await auth.listUsers(1000);if(accounts.users.length)await auth.deleteUsers(accounts.users.map(u=>u.uid))
 const stamp=new Date().toISOString();const records=[]
 for(const role of ['owner','manager','billingA','billingB','disabled','missing']){
  const uid='drill-'+role,email=role.toLowerCase()+'@drill.invalid'
  await auth.createUser({uid,email,password:PASSWORD,displayName:'Drill '+role})
  if(role!=='missing')records.push(['users/'+uid,{name:'Drill '+role,email,mobileNumber:'9990000000',role:role.startsWith('billing')?'billing':role==='disabled'?'billing':role,disabled:role==='disabled',approvalStatus:'approved',createdAt:stamp}])
 }
 records.push(['stores/single-store',{name:'Drill Store',city:'Synthetic',active:true}])
 records.push(['appMetadata/nameDirectory',{people:['Drill owner','Drill manager','Drill billingA','Drill billingB','Drill Party'],vendors:[]}])
 records.push(['appMetadata/vendorCatalog',{vendors:[]}])
 records.push(['appMetadata/appSettings',{currentBankBalance:0,marginPercentage:25,monthlyOperationalExpense:0,operationalExpenseBreakdown:{rent:0,electricity:0,maintenance:0,salaries:0,royalty:0,caFee:0,miscellaneous:0},scheduledNotifications:[],upgradeAnnouncement:null}])
 const views=require('../../functions/sharedViews')
 const settings=records.find(([p])=>p==='appMetadata/appSettings')[1]
 const metrics={...require('./empty-metrics.json'),generatedForDate:date,updatedAt:stamp}
 records.push(['appMetadata/workspaceMetrics',metrics],['appMetadata/staffSettings',views.settingsProjection(settings,stamp)],['appMetadata/staffWorkspaceMetrics',views.metricsProjection(metrics,stamp)])
 records.push(['appMetadata/vendorLedgerV2Config',{enabled:true,activationDate:'2026-10-01',updatedAt:stamp,updatedByUserId:'drill-owner'}])
 records.push([base+'/configuration/checkout',{billingMaxDiscountPercentage:5}])
 for(let i=1;i<=66;i++){
  const id='drill-product-'+i,barcode=String(i).padStart(5,'0'),name=i===1?'Drill Product A':i===2?'Drill Product B':i===5?'Drill Long Product '+('long label '.repeat(15)):'Drill Product '+i
  const selling=i===1?9000:i===2?4500:2000,cost=i===1?6000:i===2?3000:1000,mrp=i===1?10000:i===2?5000:2500,quantity=i===1?20:i===2?10:i===3?0:i===4?-3:12
  records.push([base+'/products/'+id,{id,barcode,name,searchName:name.toLowerCase(),vendor:'Drill Alpha Vendor',category:'Drill',brand:'Synthetic',active:true,currentQuantity:quantity,sellingPricePaise:selling,sourceValues:{'Printed MRP':(mrp/100).toFixed(2),'Opening Quantity':String(quantity)},revision:1,createdAt:stamp,createdByUid:'drill-owner',createdByName:'Drill owner',updatedAt:stamp,updatedByUid:'drill-owner',updatedByName:'Drill owner'}])
  records.push([base+'/productCosts/'+id,{productId:id,costPaise:cost,updatedAt:stamp,updatedByUid:'drill-owner'}])
 }
 for(let i=0;i<63;i++){const id=i===0?'drill-alpha':i===1?'drill-beta':'drill-vendor-'+i;records.push(['vendorsV2/'+id,{id,canonicalName:i===0?'Drill Alpha Vendor':i===1?'Drill Beta Vendor':'Drill Vendor '+String(i).padStart(3,'0'),ownerName:'Synthetic Contact',contact:'9990000000',address:'Local emulator only',suppliedBrands:['Synthetic'],aliases:[],active:true,openingBalancePaise:0,revision:1,createdAt:stamp,createdByUserId:'drill-owner',updatedAt:stamp,updatedByUserId:'drill-owner'}])}
 if(mode!=='uninitialized')records.push([base+'/handover/main',{initialized:true,revision:1,cashNetPaise:0,dailyTotals:{[date]:{upi:0,card:0}},countReservation:null,lastOperation:'initialize',lastOperationId:'',updatedByUid:'drill-owner',checkpoint:{cashActualPaise:100000,cashNetPaise:0,date,upiActualPaise:0,cardActualPaise:0,upiNetPaise:0,cardNetPaise:0,reconciliationId:'fixture-opening'},...(mode==='open'?{counterSession:{status:'open',date,openingReconciliationId:'fixture-opening',openedByUid:'drill-owner'}}:{})}])
 for(let offset=0;offset<records.length;offset+=400){const batch=db.batch();for(const [p,v] of records.slice(offset,offset+400))batch.set(db.doc(p),v);await batch.commit()}
 return {proof,date,records:records.length,accounts:6,mode,expected:{A:{quantity:20,mrpPaise:10000,sellingPricePaise:9000,costPaise:6000},B:{quantity:10,mrpPaise:5000,sellingPricePaise:4500,costPaise:3000},subtotalTwoAOneBPaise:22500,discount5Paise:1125,totalAfter5Paise:21375}}
}
async function records(collection){return(await db.collection(collection).get()).docs.map(d=>({id:d.id,...d.data()}))}
async function get(p){const doc=await db.doc(p).get();return doc.exists?{id:doc.id,...doc.data()}:null}
module.exports={PROJECT,db,auth,seed,health,records,get,base,date,PASSWORD}
