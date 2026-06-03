import { useState } from 'react'
import type { CashHolder, CashTransfer } from '@/domain/appTypes'
import {
  type CashHolderAssignment,
  money,
  numberValue,
  today,
} from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { SectionHeading } from '@/shared/ui/section-heading'

type CashMovementFormProps = {
  currentUserName: string
  currentHolder: CashHolder | null
  holderAssignments: CashHolderAssignment[]
  balances: Record<CashHolder, number>
  transfers: CashTransfer[]
  onTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => Promise<void>
}

function labelForHolder(holder: CashHolder, holderAssignments: CashHolderAssignment[]) {
  return holderAssignments.find((assignment) => assignment.holder === holder)?.label ?? holder
}

function displayHolder(holder: CashHolder, holderAssignments: CashHolderAssignment[]) {
  return labelForHolder(holder, holderAssignments)
}

export function CashMovementForm({
  currentUserName,
  currentHolder,
  holderAssignments,
  balances,
  transfers,
  onTransfer,
}: CashMovementFormProps) {
  void transfers
  const [transferFrom, setTransferFrom] = useState<CashHolder | ''>(currentHolder ?? '')
  const [transferTo, setTransferTo] = useState<CashHolder | 'bank' | ''>('bank')
  const [amount, setAmount] = useState('0')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!transferFrom) {
      setError('Select the sender.')
      return
    }
    if (!transferTo) {
      setError('Select the destination.')
      return
    }
    if (transferTo !== 'bank' && transferTo === transferFrom) {
      setError('Sender and destination cannot be the same person.')
      return
    }

    const transferAmount = numberValue(amount)

    if (transferAmount <= 0) {
      setError('Movement amount must be greater than zero.')
      return
    }
    if (balances[transferFrom] < transferAmount) {
      setError('Movement amount cannot exceed the sender pending cash balance.')
      return
    }
    if (!reason.trim()) {
      setError('Enter cash movement notes.')
      return
    }

    try {
      await onTransfer({
        date: today(),
        from: transferFrom,
        toType: transferTo === 'bank' ? 'bank' : 'person',
        ...(transferTo !== 'bank' ? { toPerson: transferTo } : {}),
        amount: transferAmount,
        reason: reason.trim(),
        createdBy: currentUserName,
        recordType: transferTo === 'bank' ? 'bank-transfer' : 'cash-movement',
      })
      setTransferFrom(currentHolder ?? '')
      setTransferTo('bank')
      setAmount('0')
      setReason('')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cash movement.')
    }
  }

  return (
    <Card className="flex min-h-full flex-col xl:h-full xl:min-h-0">
      <CardHeader>
        <SectionHeading eyebrow="Cash Control" title="Move Counter Cash To Bank" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {holderAssignments.map((assignment) => (
            <div key={assignment.holder} className="rounded-[18px] border border-border/70 bg-secondary/55 p-3.5">
              <span className="block text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
                {displayHolder(assignment.holder, holderAssignments)}
              </span>
              <strong className="mt-2 block text-xl font-black tracking-tight text-foreground">
                {money(balances[assignment.holder] ?? 0)}
              </strong>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Pending counter cash balance available to move</p>
            </div>
          ))}
        </div>

        <form className="grid gap-3.5 md:grid-cols-2" onSubmit={submitTransfer}>
          <FieldLabel label="From">
            <NativeSelect
              value={transferFrom}
              onChange={(event) => {
                setTransferFrom(event.target.value as CashHolder)
                setError('')
              }}
            >
              <option value="">Select user</option>
              {holderAssignments.map((assignment) => (
                <option key={assignment.holder} value={assignment.holder}>
                  {displayHolder(assignment.holder, holderAssignments)}
                </option>
              ))}
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="To">
            <NativeSelect
              value={transferTo}
              onChange={(event) => {
                setTransferTo(event.target.value as CashHolder | 'bank')
                setError('')
              }}
            >
              <option value="">Select destination</option>
              {holderAssignments.map((assignment) => (
                <option key={assignment.holder} value={assignment.holder}>
                  {displayHolder(assignment.holder, holderAssignments)}
                </option>
              ))}
              <option value="bank">Bank</option>
            </NativeSelect>
          </FieldLabel>

          <FieldLabel label="Movement Amount">
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

          <FieldLabel className="md:col-span-2" label="Cash Movement Notes">
            <Input
              type="text"
              value={reason}
              placeholder="Reason, deposit note, or movement remarks"
              onChange={(event) => {
                setReason(event.target.value)
                setError('')
              }}
            />
          </FieldLabel>

          {error ? <p className="text-sm font-semibold text-destructive md:col-span-2">{error}</p> : null}
          <Button className="md:col-span-2">Save Cash Movement</Button>
        </form>
      </CardContent>
    </Card>
  )
}

