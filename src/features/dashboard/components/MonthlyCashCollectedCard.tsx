import { useMemo, useState } from 'react'
import { Banknote, Landmark, WalletCards } from 'lucide-react'
import type { CashTransfer, DailyCashoutEntry, UserAccount } from '@/domain/appTypes'
import { IST_TIMEZONE, money, today } from '@/app/uiHelpers'
import { cn } from '@/shared/lib/utils'
import { GlowCard } from '@/shared/ui/spotlight-card'
import { derivePendingCash } from '@/store/deriveWorkspaceMetrics'

type MonthOffset = 0 | 1 | 2

type MonthlyCashCollectedCardProps = {
  cashTransfers: CashTransfer[]
  dailyCashouts: DailyCashoutEntry[]
  users: UserAccount[]
}

function monthKeyForOffset(offset: MonthOffset) {
  const [year, month] = today().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 - offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

const ranges: Array<{ label: string; offset: MonthOffset }> = [
  { label: 'T', offset: 0 },
  { label: 'T-1', offset: 1 },
  { label: 'T-2', offset: 2 },
]

export function MonthlyCashCollectedCard({ cashTransfers, dailyCashouts, users }: MonthlyCashCollectedCardProps) {
  const [selectedOffset, setSelectedOffset] = useState<MonthOffset>(0)
  const selectedMonth = monthKeyForOffset(selectedOffset)

  const { bankTotal, cashoutDays, holderBalances, totalCash } = useMemo(() => {
    const entries = dailyCashouts.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
    const transfers = cashTransfers.filter((entry) => entry.date.slice(0, 7) === selectedMonth)
    const pendingCash = derivePendingCash(users, entries, transfers)

    return {
      bankTotal: pendingCash.bankTotal,
      cashoutDays: new Set(entries.map((entry) => entry.date)).size,
      holderBalances: [
        ...pendingCash.userBalances.map((entry) => ({ id: entry.userId, name: entry.name, amount: entry.amount })),
        ...pendingCash.legacyBalances
          .filter((entry) => entry.amount !== 0)
          .map((entry) => ({ id: `legacy-${entry.holder}`, name: entry.label, amount: entry.amount })),
      ],
      totalCash: entries.reduce((total, entry) => total + (entry.drawerTotal ?? entry.remainingBalance), 0),
    }
  }, [cashTransfers, dailyCashouts, selectedMonth, users])

  return (
    <GlowCard glowColor="blue" className="p-3 sm:p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/70 text-primary">
            <Banknote className="h-4.5 w-4.5" />
          </span>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#c5a56a] sm:text-[11px]">
              Total Cash Collected
            </span>
            <strong className="mt-0.5 block text-[1.65rem] font-black tracking-[-0.04em] text-foreground sm:text-[1.9rem]">
              {money(totalCash)}
            </strong>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
              {monthLabel(selectedMonth)} | {cashoutDays} cashout {cashoutDays === 1 ? 'day' : 'days'} recorded
            </p>
          </div>
        </div>

        <div aria-label="Cash collection month" className="grid grid-cols-3 rounded-xl border border-border/80 bg-background/60 p-0.5">
          {ranges.map((range) => (
            <button
              key={range.label}
              type="button"
              className={cn(
                'min-w-14 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition-colors',
                selectedOffset === range.offset
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              onClick={() => setSelectedOffset(range.offset)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-border/70 pt-3">
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {holderBalances.map((holder) => (
            <div key={holder.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
                <WalletCards className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{holder.name}</span>
              </span>
              <strong className="shrink-0 text-sm font-black text-foreground">{money(holder.amount)}</strong>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-muted-foreground">
              <Landmark className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">Transferred to Bank</span>
            </span>
            <strong className="shrink-0 text-sm font-black text-foreground">{money(bankTotal)}</strong>
          </div>
        </div>
      </div>
    </GlowCard>
  )
}
