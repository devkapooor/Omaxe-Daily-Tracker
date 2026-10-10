import { useEffect, useState } from 'react'
import { formatDisplayDate, today } from '@/app/uiHelpers'
import { calculatePosDashboard } from '@/features/pos/domain/posDashboard'
import { usePosDashboard } from '@/features/pos/hooks/usePosDashboard'
import { Button } from '@/shared/ui/button'
import { GlowCard } from '@/shared/ui/spotlight-card'

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

function amount(paise: number) {
  return currency.format(paise / 100)
}

function TodayPosSalesSnapshot({ businessDate, onRetry }: { businessDate: string; onRetry: () => void }) {
  const data = usePosDashboard(businessDate, businessDate)

  if (data.error) {
    return <div className="mt-2 space-y-1" role="alert">
      <p className="text-sm text-destructive">Unable to load today's sales.</p>
      <Button type="button" variant="ghost" size="sm" className="h-auto px-0 py-1 text-xs underline" onClick={onRetry}>Retry</Button>
    </div>
  }

  if (data.loading) {
    return <p className="mt-2 text-sm text-muted-foreground" role="status">Loading today's sales…</p>
  }

  const metrics = calculatePosDashboard(data.bills, data.states, data.refunds, businessDate, businessDate)
  const methods = metrics.methods.filter((method) => method.value !== 'bank-transfer' || method.netPaise !== 0)

  return <>
    <strong className="mt-2 block break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">{amount(metrics.netPaise)}</strong>
    <p className="mt-1 text-[11px] font-medium text-muted-foreground">{formatDisplayDate(businessDate)} · {metrics.billCount} bill{metrics.billCount === 1 ? '' : 's'} · Net of refunds</p>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {methods.map((method) => <span key={method.value}>{method.value === 'bank-transfer' ? 'Bank Transfer' : method.label} <span className="font-medium tabular-nums text-foreground">{amount(method.netPaise)}</span></span>)}
    </div>
    {metrics.unassignedRefundsPaise > 0 ? <p className="mt-1 text-[11px] text-muted-foreground">Refunds without a payment method: {amount(metrics.unassignedRefundsPaise)}</p> : null}
  </>
}

export function TodayPosSalesCard() {
  const [businessDate, setBusinessDate] = useState(today)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const refreshDate = () => {
      if (document.visibilityState === 'visible') setBusinessDate(today())
    }
    const timer = window.setInterval(refreshDate, 30_000)
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDate)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [])

  return <GlowCard className="min-h-32 p-4" aria-label="Today's POS Sales">
    <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Today's POS Sales</span>
    {businessDate === '1970-01-01' ? (
      <p className="mt-2 text-sm text-muted-foreground" role="status">Waiting for workspace time…</p>
    ) : (
      <TodayPosSalesSnapshot key={`${businessDate}/${retryCount}`} businessDate={businessDate} onRetry={() => setRetryCount((count) => count + 1)} />
    )}
  </GlowCard>
}
