import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import type { AppUser } from '@/domain/financeTypes'
import type { CashoutCorrectionRequest, CashoutCorrectionValues, DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, money, shiftDate, today } from '@/app/uiHelpers'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { SectionHeading } from '@/shared/ui/section-heading'
import { CashoutCorrectionForm } from './CashoutCorrectionForm'
import { db } from '@/shared/lib/firebase'
import { StatusPanel } from '@/shared/ui/status-panel'
import { postFinanceOperation } from '@/features/register/data/financeRepository'

type CashoutCorrectionPanelProps = {
  currentUser: AppUser
  dailyCashouts: DailyCashoutEntry[]
  requests: CashoutCorrectionRequest[]
  onSubmit: (entry: DailyCashoutEntry, values: CashoutCorrectionValues, reason: string) => Promise<void>
  onWithdraw: (requestId: string) => Promise<void>
  showToast: (message: string) => void
}

export function CashoutCorrectionPanel({ currentUser, dailyCashouts, requests, onSubmit, onWithdraw, showToast }: CashoutCorrectionPanelProps) {
  const [selectedEntry, setSelectedEntry] = useState<DailyCashoutEntry | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [ownHistory, setOwnHistory] = useState<CashoutCorrectionRequest[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyReady, setHistoryReady] = useState(false)
  useEffect(() => {
    if (currentUser.role !== 'owner') return
    return onSnapshot(query(collection(db, 'cashoutCorrectionRequests'), where('requestedByUserId', '==', currentUser.id)), (snapshot) => {
      setOwnHistory(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as CashoutCorrectionRequest))
      setHistoryReady(true)
      setHistoryError(null)
    }, (cause) => { setHistoryError(cause.message); setHistoryReady(true) })
  }, [currentUser.id, currentUser.role])
  const eligibleEntries = useMemo(() => {
    const earliestDate = shiftDate(today(), -6)
    return dailyCashouts.filter(
      (entry) => entry.date >= earliestDate && entry.date <= today() && (currentUser.role === 'owner' || entry.recordedByUserId === currentUser.id),
    )
  }, [currentUser.id, currentUser.role, dailyCashouts])
  const availableRequests = currentUser.role === 'owner' ? [...new Map([...ownHistory, ...requests].map((request) => [request.id, request])).values()] : requests
  const recentRequests = availableRequests.filter((request) => request.requestedByUserId === currentUser.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)

  async function applyToVirtualDrawer(entry: DailyCashoutEntry) {
    const amount = money(entry.drawerTotal ?? entry.remainingBalance)
    if (!window.confirm(`Apply ${amount} from the ${formatDisplayDate(entry.date)} cashout to the current virtual drawer? This will not change bills or sales totals.`)) return
    setApplyingId(entry.id)
    setApplyError(null)
    try {
      const result = await postFinanceOperation<{ afterPaise: number }>('cashout-drawer-debit', {
        cashoutId: entry.id,
        expectedRevision: entry.revision ?? 1,
        reason: 'Owner confirmed the historical Cashout cash was physically removed; apply it to the current virtual drawer.',
      })
      showToast(`${amount} removed from the virtual drawer. New balance: ${money(result.afterPaise / 100)}.`)
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : 'Unable to apply this cashout to the virtual drawer.')
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader>
        <SectionHeading eyebrow="Controlled Corrections" title={currentUser.role === 'owner' ? 'Recent Cashouts' : 'My Recent Cashouts'} />
        <p className="text-xs font-semibold text-muted-foreground">7-day window · Owner approval required</p>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2">
        {historyError ? <StatusPanel variant="destructive" role="alert" className="lg:col-span-2">{historyError}</StatusPanel> : null}
        {applyError ? <StatusPanel variant="destructive" role="alert" className="lg:col-span-2">{applyError}</StatusPanel> : null}
        {currentUser.role === 'owner' && !historyReady ? <p role="status" className="text-sm text-muted-foreground lg:col-span-2">Loading Correction History…</p> : null}
        <div className="space-y-2">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Eligible Cashouts</span>
          {eligibleEntries.length === 0 ? <p className="text-xs text-muted-foreground">No eligible cashouts from the last 7 days.</p> : null}
          {eligibleEntries.map((entry) => {
            const pendingRequest = requests.find((request) => request.cashoutId === entry.id && request.status === 'pending')
            return (
              <div key={entry.id} className="rounded-xl border border-border/70 bg-secondary/35 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{formatDisplayDate(entry.date)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Drawer {money(entry.drawerTotal ?? entry.remainingBalance)} | Revision {entry.revision ?? 1}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {currentUser.role === 'owner' && entry.historicalCountOnlyVersion === 1 && !entry.drawerDebitOperationId && !Number.isSafeInteger(entry.drawerDebitPaise) ? <Button size="sm" variant="outline" disabled={applyingId !== null} onClick={() => void applyToVirtualDrawer(entry)}>{applyingId === entry.id ? 'Applying…' : 'Apply to drawer'}</Button> : null}
                    {pendingRequest ? <Badge variant="warning">Pending</Badge> : <Button size="sm" onClick={() => setSelectedEntry(entry)}>Request Correction</Button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="space-y-2">
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Request Status</span>
          {recentRequests.length === 0 && (currentUser.role !== 'owner' || historyReady) && !historyError ? <p className="text-xs text-muted-foreground">No correction requests submitted.</p> : null}
          {recentRequests.map((request) => (
            <div key={request.id} className="rounded-xl border border-border/70 bg-secondary/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{formatDisplayDate(request.cashoutDate)}</p>
                <Badge variant={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'destructive' : request.status === 'pending' ? 'warning' : 'secondary'}>{request.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{request.reason}</p>
              {request.reviewReason ? <p className="mt-1 text-xs text-muted-foreground">Owner: {request.reviewReason}</p> : null}
              {request.status === 'pending' ? <Button className="mt-2" size="sm" variant="outline" onClick={() => void onWithdraw(request.id)}>Withdraw</Button> : null}
            </div>
          ))}
        </div>
      </CardContent>
      {selectedEntry ? (
        <CashoutCorrectionForm
          entry={selectedEntry}
          mode="request"
          onClose={() => setSelectedEntry(null)}
          onSubmit={(values, reason) => onSubmit(selectedEntry, values, reason)}
        />
      ) : null}
    </Card>
  )
}
