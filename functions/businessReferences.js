const { HttpsError } = require('firebase-functions/v2/https')
const { activeUser } = require('./cashBalance')
const { hash } = require('./stockOperations')
const base = 'posSandboxes/test/'
const sources = {
  GRN: [base+'goodsReceipts'], AUDIT: [base+'stockAuditBatches'], PRODUCT: [base+'products'], VENDOR: ['vendorsV2'],
  PARTY: ['appMetadata/nameDirectory'], HANDOVER: [base+'reconciliations'], PURCHASE: ['purchasesV2'], PAYMENT: ['vendorSettlementsV2','payments'],
  RETURN: ['vendorReturnsV2'], REFUND: [base+'events'], EXPENSE: ['cashouts'], CASHOUT: ['dailyCashouts'], TRANSFER: ['cashTransfers'],
  LOAN: ['loans'], REPAYMENT: ['payments'], REQUEST: ['cashoutCorrectionRequests','vendorLedgerCorrectionRequestsV2',base+'approvals'],
  PAYCORR: ['vendorLedgerCorrectionRequestsV2','vendorLedgerEntriesV2'], CASHCORR: ['cashoutCorrectionRequests'], OPENCORR: ['vendorLedgerEntriesV2'],
  MOVEMENT: [base+'stockMovements'], REVERSAL: ['vendorLedgerEntriesV2',base+'goodsReceipts'], PRICE: [base+'stockPriceChanges'],
}
const fail = (message, code='invalid-argument') => { throw new HttpsError(code,message) }
const key = (prefix,id) => hash(prefix+':'+id)
const normalizeName = name => name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-IN')
/** All reads precede the returned writes. Registry entries survive source deletion. */
async function reserve(tx,db,requests,actorUid,timestamp) {
  const unique=[...new Map(requests.map(r=>[key(r.prefix,r.id),r])).values()],existing=new Map(),counters=new Map(),writes=[]
  for(const r of unique){if(!Object.hasOwn(sources,r.prefix)||typeof r.id!=='string'||!r.id.trim()||r.id.length>1000)fail('Invalid business reference.');const snap=await tx.get(db.doc('businessReferences/'+key(r.prefix,r.id)));existing.set(key(r.prefix,r.id),snap)}
  for(const prefix of [...new Set(unique.filter(r=>!existing.get(key(r.prefix,r.id)).exists).map(r=>r.prefix))]){const snap=await tx.get(db.doc('businessReferenceCounters/'+prefix)),value=snap.get('lastNumber')??0;if(!Number.isSafeInteger(value)||value<0)fail('Reference counter is inconsistent.','failed-precondition');counters.set(prefix,value)}
  const result=[]
  for(const r of unique){const target=db.doc('businessReferences/'+key(r.prefix,r.id)),old=existing.get(key(r.prefix,r.id));let reference=old.get('reference')
    if(old.exists){if(old.get('prefix')!==r.prefix||old.get('sourceId')!==r.id||!new RegExp('^'+r.prefix+'[0-9]{4,}$').test(reference))fail('Reference registry is inconsistent.','failed-precondition')}
    else{const next=counters.get(r.prefix)+1;if(!Number.isSafeInteger(next))fail('Reference sequence is exhausted.','resource-exhausted');counters.set(r.prefix,next);reference=r.prefix+String(next).padStart(4,'0');writes.push(()=>tx.create(target,{prefix:r.prefix,sourceId:r.id,reference,createdAt:timestamp,createdByUid:actorUid}))}
    result.push({...r,reference})
  }
  for(const [prefix,lastNumber] of counters)writes.push(()=>tx.set(db.doc('businessReferenceCounters/'+prefix),{lastNumber,updatedAt:timestamp}))
  return {result,writes}
}
function createBusinessReferenceHandler(db) {
  return async request=>{
    if(!request.auth?.uid)fail('Sign in to resolve business references.','unauthenticated')
    const data=request.data;if(!data||Object.keys(data).some(k=>k!=='requests')||!Array.isArray(data.requests)||!data.requests.length||data.requests.length>50)fail('Resolve between 1 and 50 references.')
    const requests=data.requests.map(r=>{if(!r||Object.keys(r).some(k=>!['prefix','id'].includes(k))||!Object.hasOwn(sources,r.prefix)||typeof r.id!=='string'||!r.id.trim()||r.id.length>1000||r.id.includes('/'))fail('Invalid business reference.');return{prefix:r.prefix,id:r.prefix==='PARTY'?normalizeName(r.id):r.id}})
    return db.runTransaction(async tx=>{
      const profile=(await tx.get(db.doc('users/'+request.auth.uid))).data();if(!activeUser(profile)||!['owner','manager','billing'].includes(profile.role))fail('Your account cannot resolve these records.','permission-denied')
      const accepted=[]
      for(const r of requests){
        if(r.prefix==='LOAN'&&profile.role!=='owner')continue
        let allowed=false
        for(const collection of sources[r.prefix]){
          const snap=await tx.get(db.doc(r.prefix==='PARTY'?collection:collection+'/'+r.id));if(!snap.exists)continue
          const value=snap.data()
          if(r.prefix==='PARTY'){allowed=[...(value.people??[])].some(name=>normalizeName(name)===r.id);break}
          if(['PAYCORR','CASHCORR','REQUEST','HANDOVER','PRICE'].includes(r.prefix)&&profile.role!=='owner'&&![value.requestedByUserId,value.requestedByUid,value.actorUid,value.uid,value.createdByUserId].includes(request.auth.uid))continue
          if(r.prefix==='REPAYMENT'&&value.entryType!=='loan-payment')continue
          if(r.prefix==='PAYMENT'&&value.entryType==='loan-payment')continue
          if(r.prefix==='PAYCORR'&&collection==='vendorLedgerEntriesV2'&&value.sourceType!=='settlement-correction')continue
          if(r.prefix==='OPENCORR'&&value.eventType!=='opening-adjustment')continue
          if(r.prefix==='REVERSAL'&&value.eventType!=='reversal'&&value.status!=='reversed')continue
          if(r.prefix==='REFUND'&&value.type!=='bill-return-approved')continue
          allowed=true;break
        }
        if(allowed)accepted.push(r)
      }
      const reserved=await reserve(tx,db,accepted,request.auth.uid,new Date().toISOString());reserved.writes.forEach(write=>write());return reserved.result
    })
  }
}
module.exports={createBusinessReferenceHandler,reserveBusinessReferences:reserve,businessReferenceSources:sources}
