const {test,expect}=require('./helpers.cjs')
// Deliberately retain the rejection assertion. This must FAIL while the
// browser owner refund restitution branch exists; never count it as accepted.
test('B2-final AH-SEC-02 owner restitution forgery must reject without a bill source',async({drill:h},info)=>{
 info.annotations.push({type:'blocked-final-cutover',description:'Trusted atomic refund replacement is not approved in B2-A; this residual failure must remain visible'})
 const {page}=await h.session('owner'),product=await h.get(h.base+'/products/drill-product-1'),id='owner-forged-restitution'
 let accepted=false,error=''
 try{
  await h.rpc(page,'/tests/drill/client.ts','batch',[[{path:h.base+'/stockMovements/'+id,value:{id,productId:product.id,barcode:product.barcode,type:'void-reversal',quantityDelta:100,beforeQuantity:20,afterQuantity:120,productRevisionBefore:1,productRevisionAfter:2,actorUid:'drill-owner',actorName:'Drill owner',createdAt:new Date().toISOString()}},{path:h.base+'/products/'+product.id,value:{...product,currentQuantity:120,revision:2,lastMovementId:id,updatedByUid:'drill-owner',updatedByName:'Drill owner',updatedAt:new Date().toISOString()}}]])
  accepted=true
 }catch(e){error=e.message}
 const after=await h.get(h.base+'/products/'+product.id)
 h.evidence.assertions.push({accepted,error,after,missingSource:'No bill, approval, refund, or counter posting accompanies this purported restitution'})
 expect(accepted).toBe(false);expect(after.currentQuantity).toBe(20)
})
