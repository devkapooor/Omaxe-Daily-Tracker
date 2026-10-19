import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDocFromServer } from 'firebase/firestore'
import { db } from '@/shared/lib/firebase'
import { PosBillView } from '@/features/pos/components/PosBillView'
import type { PosBill } from '@/features/pos/domain/types'
import { Button } from '@/shared/ui/button'

/** Selection belongs to the table's stable parent, not a replaceable row cell. */
export function useRefundReceipt() {
  const [bill, setBill] = useState<PosBill | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const pending = useRef<string | null>(null)
  const generation = useRef(0)
  const sourceId = useRef<string | null>(null)
  useEffect(() => () => { generation.current++; pending.current = null }, [])
  const close = useCallback(() => {
    setBill(null)
    const id = sourceId.current
    requestAnimationFrame(() => {
      if (!id) return
      const candidates = document.querySelectorAll<HTMLButtonElement>('button[data-refund-bill-id="' + CSS.escape(id) + '"]')
      Array.from(candidates).find(node => node.getClientRects().length > 0)?.focus()
    })
  }, [])
  const open = useCallback(async (id: string) => {
    if (pending.current) return
    pending.current = id
    sourceId.current = id
    const request = ++generation.current
    setLoadingId(id); setFailure(null)
    try {
      const saved = await getDocFromServer(doc(db, 'posSandboxes', 'test', 'bills', id))
      if (!saved.exists()) throw new Error('Original receipt unavailable.')
      if (generation.current === request) setBill({ ...saved.data(), id: saved.id } as PosBill)
    } catch (cause) {
      if (generation.current === request) setFailure({ id, message: cause instanceof Error ? cause.message : 'Unable to load receipt.' })
    } finally {
      if (generation.current === request) { pending.current = null; setLoadingId(null) }
    }
  }, [])
  return { open, loadingId, dialog: <>
    {failure ? <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><p>{failure.message}</p><Button variant="outline" onClick={() => void open(failure.id)}>Retry receipt</Button></div> : null}
    {bill ? <PosBillView bill={bill} onClose={close} /> : null}
  </> }
}
