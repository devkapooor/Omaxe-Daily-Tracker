import type { PosProduct } from '@/features/pos/domain/types'
import type { VendorReturnV2, VendorStockReturnLine } from '@/domain/vendorLedgerV2'
import { getPosCost } from '@/features/pos/data/posRepository'
import { readSource } from '@/features/stock/data/stockQueries'
import { postFinanceOperation } from '@/features/register/data/financeRepository'
export type ReturnInputLine = Pick<VendorStockReturnLine,'productId'|'sourceReceiptId'|'quantity'|'expectedProductRevision'|'expectedReceiptRevision'|'unitCostPaise'>
export async function returnProduct(product:PosProduct){
  if(!product.active)throw new Error('This product is inactive.')
  const unitCostPaise=await getPosCost(product.id);if(unitCostPaise===null||!Number.isSafeInteger(unitCostPaise)||unitCostPaise<=0)throw new Error('No cost price is recorded for this product. Add its cost in Stock before returning it.')
  return{product,unitCostPaise}
}
export function returnLine(product:PosProduct,unitCostPaise:number,quantity=1):VendorStockReturnLine{return{productId:product.id,productName:product.name,barcode:product.barcode,sourceInvoiceNumber:'Current product cost',quantity,unitCostPaise,lineTotalPaise:quantity*unitCostPaise,expectedProductRevision:product.revision,stockAtScan:product.currentQuantity}}
export const saveVendorReturnDraft=(input:{id:string;expectedRevision:number;vendorId:string;date:string;reason:string;lines:ReturnInputLine[]})=>postFinanceOperation<VendorReturnV2>('vendor-return-draft',input)
export const dispatchVendorReturn=(source:VendorReturnV2)=>postFinanceOperation<VendorReturnV2>('vendor-return-dispatch',{id:source.id,expectedRevision:source.revision})
export const deleteVendorReturnDraft=(source:VendorReturnV2)=>postFinanceOperation('vendor-return-draft-delete',{id:source.id,expectedRevision:source.revision})
export const receiveVendorReturnGoods=(source:VendorReturnV2,date:string,lines:{productId:string;quantity:number;expectedRevision:number}[])=>postFinanceOperation<{receiptId:string;reference:string;return:VendorReturnV2}>('vendor-return-receive',{id:source.id,expectedRevision:source.revision,date,lines})
export const refreshReturnProduct=(id:string)=>readSource<PosProduct>('products',id)
