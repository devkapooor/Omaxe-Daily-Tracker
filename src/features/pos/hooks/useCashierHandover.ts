import { createContext, useContext } from 'react'
import type { HandoverLedger } from '../domain/cashierHandover'

export const HandoverContext = createContext<{ ledger: HandoverLedger | null; requestSetup: () => void }>({ ledger: null, requestSetup: () => {} })
export function useCashierHandover() { return useContext(HandoverContext) }
