import type { CashoutCorrectionRequest, DailyCashoutEntry, UserAccount } from '@/domain/appTypes'
import type { VendorLedgerCorrectionRequestV2, VendorReturnV2 } from '@/domain/vendorLedgerV2'
import type { CashierReconciliation } from '@/features/pos/domain/cashierHandover'
import type { PosApprovalRequest } from '@/features/pos/domain/types'
import type { StockPriceChange } from '@/features/stock/domain/stockPriceChange'
import type { HistoryRecord } from '../data/actionHistoryRepository'
import { deriveApprovalQueue } from './approvalItems'
import { actionCentreEntries } from './actionCentreEntries'

export function actionHistoryEntries(records: HistoryRecord[], cashouts: DailyCashoutEntry[], vendorNames: Record<string, string>, users: UserAccount[]) {
  const cashout: CashoutCorrectionRequest[] = []
  const corrections: VendorLedgerCorrectionRequestV2[] = []
  const returns: VendorReturnV2[] = []
  const pos: PosApprovalRequest[] = []
  const handovers: CashierReconciliation[] = []
  const stockChanges: StockPriceChange[] = []
  for (const record of records) {
    if (record.kind === 'cashout') cashout.push(record.value)
    else if (record.kind === 'vendor-correction') corrections.push(record.value)
    else if (record.kind === 'vendor-return') returns.push(record.value)
    else if (record.kind === 'pos') pos.push(record.value)
    else if (record.kind === 'stock-price') stockChanges.push(record.value)
    else handovers.push(record.value)
  }
  const queue = deriveApprovalQueue(cashout, cashouts, { correctionRequests: corrections, returns, settlementStates: [], settlementStatesLoaded: false, vendorNames, recentLimit: Number.MAX_SAFE_INTEGER })
  return actionCentreEntries(queue, pos, handovers, users, stockChanges)
}
