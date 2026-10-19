import { useEffect, useRef, type RefObject } from 'react'

/** Table refreshes can replace the opener while a lazy receipt is loading. */
export function useReceiptDialog(ref: RefObject<HTMLDialogElement | null>, fallbackLabel?: string) {
  const original = useRef<{ opener: HTMLElement | null; label: string | null; rowId: string | null } | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!original.current) { const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; original.current = { opener, label: opener?.getAttribute('aria-label') ?? null, rowId: opener?.getAttribute('data-source-row') ?? null } }
    const { opener, label, rowId } = original.current
    node?.showModal()
    return () => {
      node?.close()
      requestAnimationFrame(() => {
        const stableLabel = label || fallbackLabel
        const current = stableLabel ? document.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(stableLabel)}"]`) : rowId ? document.querySelector<HTMLElement>(`[data-source-row="${CSS.escape(rowId)}"]`) : opener?.isConnected ? opener : null
        current?.focus()
      })
    }
  }, [ref, fallbackLabel])
}
