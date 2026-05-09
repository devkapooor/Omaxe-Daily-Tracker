import { useMemo, useState } from 'react'
import type { CashHolder, CashTransfer } from '@/domain/appTypes'
import {
  type CashHolderAssignment,
  money,
  MovementHistoryRange,
  numberValue,
  shiftDate,
  today,
} from '@/app/uiHelpers'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { SectionHeading } from '@/components/ui/section-heading'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type CashMovementFormProps = {
  currentUserName: string
  currentHolder: CashHolder | null
  holderAssignments: CashHolderAssignment[]
  balances: Record<CashHolder, number>
  bankTotal: number
  transfers: CashTransfer[]
  onTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => Promise<void>
}

export function CashMovementForm({
  currentUserName,
  currentHolder,
  holderAssignments,
  balances,
  bankTotal,
  transfers,
  onTransfer,
}: CashMovementFormProps) {
  const labelByHolder = useMemo(
    () => Object.fromEntries(holderAssignments.map((assignment) => [assignment.holder, assignment.label])) as Record<CashHolder, string>,
    [holderAssignments],
  )
  const transferOptions = useMemo(
    () => [...holderAssignments.map((assignment) => assignment.holder).filter((person) => person !== currentHolder), 'Bank'],
    [currentHolder, holderAssignments],
  )
  const [transferTo, setTransferTo] = useState<string>('Bank')
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyRange, setHistoryRange] = useState<MovementHistoryRange>('today')
  const [historyCustomDate, setHistoryCustomDate] = useState(today())

  const filteredTransfers = useMemo(() => {
    const now = today()
    let from = now
    let to = now

    if (historyRange === 'yesterday') {
      const y = shiftDate(now, -1)
      from = y
      to = y
    } else if (historyRange === 'mtd') {
      from = `${now.slice(0, 7)}-01`
      to = now
    } else if (historyRange === 'custom') {
      from = historyCustomDate
      to = historyCustomDate
    }

    return transfers
      .filter((entry) => entry.date >= from && entry.date <= to)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [historyCustomDate, historyRange, transfers])

  async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentHolder) {
      setError('Logged-in user is not mapped for pending-cash transfer.')
      return
    }
    const value = numberValue(amount)
    if (value <= 0) {
      setError('Transfer amount must be greater than zero.')
      return
    }
    if (balances[currentHolder] < value) {
      setError('Insufficient pending cash for selected person.')
      return
    }
    if (!reason.trim()) {
      setError('Transfer reason is required.')
      return
    }

    const destinationType = transferTo === 'Bank' ? 'bank' : 'person'
    const destinationPerson = destinationType === 'person' ? (transferTo as CashHolder) : undefined

    try {
      await onTransfer({
        date: today(),
        from: currentHolder,
        toType: destinationType,
        toPerson: destinationPerson,
        amount: value,
        reason: reason.trim(),
        createdBy: currentUserName,
      })
      setAmount('0')
      setReason('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cash transfer.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="Cash Movement" title="Transfer Pending Cash" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {holderAssignments.map((assignment) => (
            <div key={assignment.holder} className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
              <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">{assignment.label}</span>
              <strong className="mt-3 block text-2xl font-black tracking-tight text-foreground">
                {money(balances[assignment.holder] ?? 0)}
              </strong>
            </div>
          ))}
          <div className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
            <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Transferred To Bank</span>
            <strong className="mt-3 block text-2xl font-black tracking-tight text-foreground">{money(bankTotal)}</strong>
          </div>
        </div>

        <form className="grid gap-5 md:grid-cols-2" onSubmit={submitTransfer}>
          <FieldLabel label="Transfer To">
            <NativeSelect
              value={transferTo}
              onChange={(event) => {
                setTransferTo(event.target.value)
                setError('')
              }}
            >
              {transferOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="Amount">
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          <FieldLabel className="md:col-span-2" label="Reason">
            <Input
              type="text"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setError('')
              }}
              placeholder="e.g. Cash deposited to bank"
              required
            />
          </FieldLabel>

          {error && <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p>}
          <Button className="md:col-span-2">Transfer Cash</Button>
        </form>

        <Button type="button" variant="outline" onClick={() => setShowHistory((current) => !current)}>
          {showHistory ? 'Hide Log / History' : 'Show Log / History'}
        </Button>

        {showHistory && (
          <div className="space-y-4">
            <Tabs value={historyRange} onValueChange={(value) => setHistoryRange(value as MovementHistoryRange)}>
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
                <TabsTrigger value="mtd">Month To Date</TabsTrigger>
                <TabsTrigger value="custom">Custom Date</TabsTrigger>
              </TabsList>
            </Tabs>

            {historyRange === 'custom' && (
              <FieldLabel className="max-w-xs" label="Date">
                <Input type="date" value={historyCustomDate} onChange={(event) => setHistoryCustomDate(event.target.value)} />
              </FieldLabel>
            )}

            <div className="space-y-3">
              {filteredTransfers.length === 0 && <p className="text-sm font-medium text-muted-foreground">No cash movement history for this filter.</p>}
              {filteredTransfers.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-secondary/55 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.date} | {labelByHolder[entry.from] ?? entry.from} to{' '}
                      {entry.toType === 'bank' ? 'Bank' : entry.toPerson ? labelByHolder[entry.toPerson] ?? entry.toPerson : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.reason} | By {entry.createdBy} at{' '}
                      {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit text-sm">
                    {money(entry.amount)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
