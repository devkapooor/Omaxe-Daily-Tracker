async function forgedCheckout(h,uid='drill-billingA',id='drill-forged-bill') {
 const ledger=await h.get(h.base+'/handover/main'),cashier=await h.get(h.base+'/cashierStates/'+uid),timestamp=new Date().toISOString()
 delete ledger.id;delete cashier.id
 const bill={id,testOnly:true,status:'finalized',handoverDate:h.date,cashierAuthTime:cashier.authTime,receiptNumber:'DRILL-FORGED',financialYear:'2026-27',sequenceNumber:1,businessDate:h.date,createdAt:timestamp,createdByUid:uid,createdByName:'Drill '+uid.replace('drill-',''),lines:[{id:'fake-line',kind:'product',productId:'drill-product-1',barcode:'00001',description:'Drill Product A',quantity:2,unitPricePaise:5000,expectedProductRevision:1}],subtotalPaise:10000,discount:{mode:'percentage',percentage:99.99,amountPaise:9999},totalPaise:1,payments:[{method:'cash',amountPaise:1}],cashTenderedPaise:1,cashChangePaise:0}
 return [
  {path:h.base+'/bills/'+id,value:bill},
  {path:h.base+'/billStates/'+id,value:{billId:id,state:'active',revision:1,returnedQuantities:{},updatedAt:timestamp,updatedByUid:uid}},
  {path:h.base+'/sequences/2026-27',value:{financialYear:'2026-27',lastNumber:1,updatedAt:timestamp,updatedByUid:uid}},
  {path:h.base+'/handover/main',value:{...ledger,revision:ledger.revision+1,cashNetPaise:ledger.cashNetPaise+1,lastOperation:'bill',lastOperationId:id,updatedByUid:uid}},
  {path:h.base+'/cashierStates/'+uid,value:{...cashier,needsLogoutCheck:true,lastBillId:id,updatedAt:timestamp}},
 ]
}
module.exports={forgedCheckout}
