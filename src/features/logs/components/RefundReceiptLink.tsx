import { useContext } from 'react'
import { RefundReceiptLoadingContext } from '../hooks/refundReceiptContext'
import { Button } from '@/shared/ui/button'

export function RefundReceiptLink({ billId, onOpen, busy: explicitBusy = false }: { billId: string; onOpen: (billId: string) => void; busy?: boolean }) {
  const busy = useContext(RefundReceiptLoadingContext) === billId || explicitBusy
  return <Button data-refund-bill-id={billId} size="sm" variant="outline" disabled={busy} onClick={() => onOpen(billId)}>{busy ? 'Loading receipt…' : 'View refund receipt'}</Button>
}
