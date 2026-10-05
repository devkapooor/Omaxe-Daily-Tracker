import type { HandoverLedger } from './cashierHandover'
import { expectedHandover, handoverDate } from './cashierHandover'

export type PosDrawerClosure = {
  id: string
  cashoutId: string
  businessDate: string
  kind: 'daily-cashout' | 'historical-repair'
  expectedBeforePaise: number
  countedPaise: number
  differencePaise: number
  removedPaise: number
  closingBalancePaise: number
  subsequentNetCashPaise: number
  resultingBalancePaise: number
  ledgerRevisionBefore: number
  recordedByUid: string
  recordedByName: string
  createdAt: string
}

export function buildDailyCashoutClosure(args: {
  cashoutId: string
  businessDate: string
  countedPaise: number
  ledger: HandoverLedger
  recordedByUid: string
  recordedByName: string
  createdAt: string
}): PosDrawerClosure {
  const expectedBeforePaise = expectedHandover(args.ledger, handoverDate(args.createdAt)).cash
  return {
    id: args.cashoutId,
    cashoutId: args.cashoutId,
    businessDate: args.businessDate,
    kind: 'daily-cashout',
    expectedBeforePaise,
    countedPaise: args.countedPaise,
    differencePaise: args.countedPaise - expectedBeforePaise,
    removedPaise: args.countedPaise,
    closingBalancePaise: 0,
    subsequentNetCashPaise: 0,
    resultingBalancePaise: 0,
    ledgerRevisionBefore: args.ledger.revision,
    recordedByUid: args.recordedByUid,
    recordedByName: args.recordedByName,
    createdAt: args.createdAt,
  }
}
