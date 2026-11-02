import { useEffect, useRef, type RefObject } from 'react'

/** Table refreshes can replace the opener while a lazy receipt is loading. */
export function useReceiptDialog(ref: RefObject<HTMLDialogElement | null>, fallbackLabel?: string) {
  const original = useRef<{ opener: HTMLElement | null; label: string | null; rowId: string | null } | null>(null)
  const restoreFrame = useRef<number | null>(null)
  useEffect(() => {
    if (restoreFrame.current !== null) cancelAnimationFrame(restoreFrame.current)
    const node = ref.current
    if (!original.current) { const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null; original.current = { opener, label: opener?.getAttribute('aria-label') ?? null, rowId: opener?.closest('[data-source-row]')?.getAttribute('data-source-row') ?? null } }
    const { opener, label, rowId } = original.current
    node?.showModal()
    return () => {
      node?.close()
      const visible = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected && element !== document.body && element !== document.documentElement && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.matches(':disabled') && !element.closest('[hidden],[inert],[aria-hidden="true"]'))
      const restore = (remainingFrames: number) => {
        restoreFrame.current = null
        if (document.querySelector('dialog[open]')) return
        const active = document.activeElement
        // Respect a new user-selected control instead of taking focus back later.
        if (active instanceof HTMLElement && visible(active) && active !== opener && active !== node && !node?.contains(active)) return
        const stableLabel = label || fallbackLabel
        const candidates = [opener,
          ...(stableLabel ? document.querySelectorAll<HTMLElement>(`button[aria-label="${CSS.escape(stableLabel)}"]`) : []),
          ...(rowId ? document.querySelectorAll<HTMLElement>(`[data-source-row="${CSS.escape(rowId)}"]`) : []),
        ]
        const current = candidates.find(visible)
        current?.focus({ preventScroll: true })
        // A table commit can replace the restored control in the same paint.
        if (remainingFrames > 0) restoreFrame.current = requestAnimationFrame(() => restore(remainingFrames - 1))
      }
      restoreFrame.current = requestAnimationFrame(() => restore(2))
    }
  }, [ref, fallbackLabel])
}
