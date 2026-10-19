import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
const load = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = load('firebase-admin/app')
const { getFirestore } = load('firebase-admin/firestore')
/** Supporting real-handler/emulator checks, not authenticated HTTP acceptance. */
export function trustedFinanceSupport(projectId: string) {
  if (!projectId.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Isolated demo emulator required')
  const app = initializeApp({ projectId }, 'trusted-support-' + projectId)
  const db = getFirestore(app)
  const now = Date.parse('2026-10-11T05:00:00Z')
  const ops = load('./financeOperations').createFinanceOperations(db, () => now)
  const register = load('./registerPayments').createRegisterHandlers(ops)
  const decisions = load('./vendorFinanceDecisions').createVendorDecisionHandlers(ops, register)
  const handlers: Record<string, (request: unknown) => Promise<unknown>> = {
    'vendor-create': register.createVendor, 'vendor-purchase': register.purchase,
    'vendor-payment': register.settlement, 'cheque-issue': register.cheque,
    'cheque-decision': register.transitionCheque, 'vendor-correction': decisions.correct,
    'vendor-correction-decision': decisions.decision,
  }
  return {
    db, close: () => deleteApp(app),
    async seedFunding(uids: string[]) {
      const b = db.batch(), date = '2026-10-11'
      b.set(db.doc('appMetadata/appSettings'), { currentBankBalance: 5000 })
      b.set(db.doc('chequeBooksV2/book-1120-1199'), { active: true, startNumber: 1120, endNumber: 1199 })
      b.set(db.doc('bankBalanceControl/main'), { initialized: true, balancePaise: 500000, revision: 1 })
      b.set(db.doc('posSandboxes/test/handover/main'), { initialized: true, revision: 1, cashNetPaise: 0, dailyTotals: { [date]: { upi: 0, card: 0 } }, countReservation: null, counterSession: { status: 'open', date, openingReconciliationId: 'opening' }, checkpoint: { cashActualPaise: 1000000, cashNetPaise: 0, date, upiActualPaise: 0, cardActualPaise: 0, upiNetPaise: 0, cardNetPaise: 0, reconciliationId: 'opening' } })
      for (const uid of uids) b.set(db.doc('posSandboxes/test/cashierStates/' + uid), { uid, authTime: 42, closed: false, joinedCounterId: 'opening', needsLogoutCheck: false })
      await b.commit()
    },
    async call(kind: string, intent: Record<string, unknown>, uid = 'purchasing-user') {
      const handler = handlers[kind]
      if (!handler) throw new Error('Unexpected trusted support operation: ' + kind)
      return handler({ auth: { uid, token: { auth_time: 42 } }, data: { operationId: randomUUID(), ...intent } }) as Promise<Record<string, unknown>>
    },
  }
}
