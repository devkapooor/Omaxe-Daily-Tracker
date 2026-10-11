import { createContext, useContext } from 'react'
import type { CountReservation, HandoverLedger } from '../domain/cashierHandover'

export const HandoverContext = createContext<{ ledger: HandoverLedger | null; requestSetup: () => void; counterOpen: boolean; joined: boolean; reservation: CountReservation | null }>({ ledger: null, requestSetup: () => {}, counterOpen: false, joined: false, reservation: null })
export function useCashierHandover() { return useContext(HandoverContext) }
