import { useEffect, useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { acknowledgeReconciliation, subscribeReconciliations } from '../data/cashierHandoverRepository'
import type { CashierReconciliation } from '../domain/cashierHandover'

export function CashierDiscrepanciesPanel({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  const [records, setRecords] = useState<CashierReconciliation[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  useEffect(() => { if (currentUser.role !== 'owner') return; return subscribeReconciliations(setRecords, (next) => setError(next.message)) }, [currentUser.role])
  if (currentUser.role !== 'owner') return null
  const pending = records.filter((record) => record.reviewStatus === 'pending')
  return <Card><CardHeader><h3 className="font-semibold">Cashier handover discrepancies · {pending.length} pending</h3><p className="text-xs text-muted-foreground">Shared POS drawer. Review only; staff are not waiting for permission to continue.</p></CardHeader><CardContent className="space-y-2">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!pending.length ? <p className="text-sm text-muted-foreground">No handover discrepancies waiting.</p> : pending.map((record) => <article key={record.id} className="rounded border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{record.name} · {record.kind}</strong><span>{new Date(record.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></div>
      <div className="my-2 grid grid-cols-4 gap-2 text-xs"><strong>Payment</strong><strong>Expected</strong><strong>Actual</strong><strong>Difference</strong>{(['cash', 'upi', 'card'] as const).map((method) => <div key={method} className="contents"><span className="capitalize">{method}</span><span>₹{(record.expected[method] / 100).toLocaleString('en-IN')}</span><span>₹{(record.actual[method] / 100).toLocaleString('en-IN')}</span><span className={record.delta[method] ? 'text-destructive' : ''}>₹{(record.delta[method] / 100).toLocaleString('en-IN')}</span></div>)}</div>
      {record.note ? <p className="mb-2">{record.note}</p> : null}
      <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { setBusy(record.id); try { await acknowledgeReconciliation(record.id, currentUser.id); showToast('Handover discrepancy marked reviewed. No balances changed.') } catch (next) { showToast(next instanceof Error ? next.message : 'Review failed.') } finally { setBusy('') } }}>Mark reviewed</Button>
    </article>)}
    <details className="text-xs"><summary className="cursor-pointer">Recent handover audit</summary>{records.filter((record) => record.reviewStatus !== 'pending').slice(0, 20).map((record) => <p key={record.id} className="mt-2">{record.name} · {record.kind} · {record.date} · {record.reviewStatus}</p>)}</details>
  </CardContent></Card>
}
