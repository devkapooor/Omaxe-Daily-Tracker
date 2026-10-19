import { describe, expect, it } from 'vitest'
import type { FinanceData, Cashout, DailySales } from '@/domain/financeTypes'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { deriveMonthlyPerformance } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { ordinaryExpenseAmount, recordedNetSales } from '@/domain/refundAccounting'

const date='2026-10-16' // Explicit IST business date; all independent fixture values below are paise.
function outflow(id:string,paise:number,sourceKind?:Cashout['sourceKind'],paymentStatus?:Cashout['paymentStatus']):Cashout{return {id,storeId:'single-store',date,paidTo:'Synthetic '+id,amount:paise/100,category:'Synthetic',paymentMode:'Cash',approvedBy:'Synthetic owner',notes:'Independent fixture',createdAt:date+'T04:00:00+05:30',updatedAt:date+'T04:00:00+05:30',...(sourceKind?{sourceKind}:{}),...(paymentStatus?{paymentStatus}:{})}}
describe('independent linked payout financial consumer checks',()=>{
 it('counts operating costs75 once while vendor980 and customer refund90 remain visible outflows',()=>{
 const cashouts=[outflow('utility',5000,'expense'),outflow('vendor-cash',20000,'vendor-payment'),outflow('vendor-cheque',78000,'vendor-payment'),outflow('customer-refund',9000,'pos-return'),outflow('expense-cheque',2500,'expense'),outflow('cancelled-cheque',10000,'expense','cancelled'),outflow('bounced-cheque',15000,'expense','bounced')]
 const data:FinanceData={stores:[],purchases:[],payments:[],cashouts,sales:[{id:'sale',storeId:'single-store',date,totalSales:180,cashSales:180,upiSales:0,cardSales:0,bankTransferSales:0,creditSales:0,returnsDiscounts:90,refundAccountingVersion:1,netSalesAmount:90,notes:'Fixture',createdAt:date,updatedAt:date}]}
 const result=deriveMonthlyPerformance({data,dailyCashouts:[{date,drawerTotal:840,cashSales:180,upiSales:0,creditSales:0,returns:90} as DailyCashoutEntry],currentDate:date,dashboardMonthOffset:0,marginPercentage:25,monthlyOperationalExpense:0})
 expect(Math.round(result.sales*100)).toBe(9000);expect(Math.round(result.expenses*100)).toBe(7500);expect(Math.round(result.operatingBalance*100)).toBe(1500);expect(Math.round(result.cashCollected*100)).toBe(84000);expect(data.cashouts).toHaveLength(7);expect(Math.round(ordinaryExpenseAmount(cashouts[1])*100)).toBe(0);expect(Math.round(ordinaryExpenseAmount(cashouts[2])*100)).toBe(0)
 })
 it('does not silently reinterpret unlinked legacy expense/sales history',()=>{expect(Math.round(ordinaryExpenseAmount(outflow('legacy-unknown',40000))*100)).toBe(40000);expect(Math.round(recordedNetSales({totalSales:180,returnsDiscounts:90} as DailySales)*100)).toBe(18000)})
})
