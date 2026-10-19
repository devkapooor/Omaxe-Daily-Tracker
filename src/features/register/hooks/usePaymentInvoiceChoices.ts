import { useEffect, useRef, useState } from 'react'
import { loadPaymentInvoicePage, loadPaymentInvoiceTarget, type PaymentInvoicePage } from '@/features/register/data/registerInvoiceQueries'

type Result = PaymentInvoicePage & { key: string; error: string; moreLoading: boolean }
export function usePaymentInvoiceChoices(vendorId: string, targetInvoiceId: string, refreshRevision = 0) {
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([vendorId, targetInvoiceId, retry, refreshRevision])
  const [result, setResult] = useState<Result | null>(null)
  const generation = useRef(0)
  const moreRequest = useRef<Promise<void> | null>(null)
  useEffect(() => {
    generation.current += 1
    if (!vendorId) return
    let active = true
    const targetRequest = targetInvoiceId
      ? loadPaymentInvoiceTarget(vendorId, targetInvoiceId).then(invoice => ({ invoice, error: '' })).catch((cause: unknown) => ({ invoice: null, error: cause instanceof Error ? cause.message : 'Unable to load the linked invoice.' }))
      : Promise.resolve({ invoice: null, error: '' })
    void Promise.all([loadPaymentInvoicePage(vendorId), targetRequest]).then(([page, target]) => {
      if (!active) return
      const items = [...new Map([...(target.invoice ? [target.invoice] : []), ...page.items].map(item => [item.id, item])).values()]
      setResult({ ...page, items, key, error: target.error, moreLoading: false })
    }).catch((cause: unknown) => {
      if (active) setResult({ key, items: [], cursor: null, hasMore: false, moreLoading: false, error: cause instanceof Error ? cause.message : 'Unable to load invoices.' })
    })
    return () => { active = false }
  }, [key, vendorId, targetInvoiceId])
  const current = result?.key === key
  function loadMore() {
    if (!current || !result?.cursor || !result.hasMore || moreRequest.current) return
    const epoch = generation.current
    setResult(previous => previous?.key === key ? { ...previous, moreLoading: true, error: '' } : previous)
    const request = loadPaymentInvoicePage(vendorId, result.cursor).then(page => {
      if (generation.current !== epoch) return
      setResult(previous => previous?.key === key ? { ...previous, ...page, items: [...new Map([...previous.items, ...page.items].map(item => [item.id, item])).values()], moreLoading: false, error: '' } : previous)
    }).catch((cause: unknown) => {
      if (generation.current !== epoch) return
      setResult(previous => previous?.key === key ? { ...previous, moreLoading: false, error: cause instanceof Error ? cause.message : 'Unable to load more invoices.' } : previous)
    })
    moreRequest.current = request
    void request.finally(() => { if (moreRequest.current === request) moreRequest.current = null })
  }
  return { items: current ? result.items : [], loading: !!vendorId && !current, moreLoading: current && result.moreLoading, hasMore: current && result.hasMore, error: current ? result.error : '', loadMore, retry: () => setRetry(value => value + 1) }
}
