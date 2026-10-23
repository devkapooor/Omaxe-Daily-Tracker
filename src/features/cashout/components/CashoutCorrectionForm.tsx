import { useConfirmationDialog } from '@/shared/ui/confirmation-dialog'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CashoutCorrectionValues, DailyCashoutEntry, DrawerDenominations } from '@/domain/appTypes'
import { correctionValuesFromEntry, drawerTotalFromDenominations } from '@/domain/cashoutCorrections'
import { formatDisplayDate, money, numberValue } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { Textarea } from '@/shared/ui/textarea'

type CashoutCorrectionFormProps = {
  entry: DailyCashoutEntry
  mode: 'request' | 'owner-edit'
  onClose: () => void
  onSubmit: (values: CashoutCorrectionValues, reason: string) => Promise<void> | void
}

type NumericFields = Omit<CashoutCorrectionValues, 'drawerDenominations'>

export function CashoutCorrectionForm({ entry, mode, onClose, onSubmit }: CashoutCorrectionFormProps) {
  const {confirm,dialog}=useConfirmationDialog()
  const initial = correctionValuesFromEntry(entry)
  const [values, setValues] = useState<NumericFields>({
    cashSales: initial.cashSales,
    upiSales: initial.upiSales,
    cardSales: initial.cardSales,
    creditSales: initial.creditSales,
    returns: initial.returns,
    cashExpense: initial.cashExpense,
    cashAudit: initial.cashAudit,
  })
  const [denominations, setDenominations] = useState<DrawerDenominations>(initial.drawerDenominations)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const originalDrawerTotal = entry.drawerTotal ?? entry.remainingBalance
  const nextDrawerTotal = drawerTotalFromDenominations(denominations, entry.refundAccountingVersion === 1)

  function setNumericField(field: keyof NumericFields, value: string) {
    setValues((current) => ({ ...current, [field]: numberValue(value) }))
  }

  function setDenomination(field: keyof DrawerDenominations, value: string) {
    setDenominations((current) => ({ ...current, [field]: numberValue(value) }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 5) {
      setError('Please enter a correction reason of at least 5 characters.')
      return
    }
    if(isSaving)return
    if(!await confirm({title:mode==='owner-edit'?'Confirm Cashout edit':'Confirm correction request',details:[formatDisplayDate(entry.date)+' | '+entry.recordedBy,reason],confirmationText:'CONFIRM',confirmLabel:'OK',warning:mode==='owner-edit'?'This saves an audited correction. Source totals remain protected.':'This requests owner approval; the Cashout will not change yet.'}))return
    setIsSaving(true)
    try {
      await onSubmit({ ...values, drawerDenominations: denominations }, reason)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this correction.')
    } finally {
      setIsSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <><div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 px-3 py-5 backdrop-blur-sm">
      <Card role="dialog" aria-modal="true" aria-label={mode === 'owner-edit' ? 'Edit Daily Cashout' : 'Request Cashout Correction'} className="max-h-[94vh] w-full max-w-4xl overflow-y-auto">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <SectionHeading
              eyebrow={mode === 'owner-edit' ? 'Owner Correction' : 'Correction Request'}
              title={mode === 'owner-edit' ? 'Edit Daily Cashout' : 'Request Cashout Correction'}
            />
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {formatDisplayDate(entry.date)} | {entry.recordedBy}. Date and recorder are locked.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.financePostingVersion===1} label="Cash Sales" value={values.cashSales} onChange={(value) => setNumericField('cashSales', value)} />
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.financePostingVersion===1} label="UPI Sales" value={values.upiSales} onChange={(value) => setNumericField('upiSales', value)} />
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.financePostingVersion===1} label={entry.cardSales === undefined ? 'Card Sales (not captured on legacy record)' : 'Card Sales'} value={values.cardSales ?? 0} onChange={(value) => setNumericField('cardSales', value)} />
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} label="Credit Sales" value={values.creditSales} onChange={(value) => setNumericField('creditSales', value)} />
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.refundAccountingVersion === 1} label="Returns" value={values.returns} onChange={(value) => setNumericField('returns', value)} />
              <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.financePostingVersion===1} label="Cash Expense" value={values.cashExpense} onChange={(value) => setNumericField('cashExpense', value)} />
              {entry.historicalCountOnlyVersion === 1 ? <p className="rounded-lg border border-border/70 p-3 text-sm text-muted-foreground">System Audit unavailable for this historical Cashout; the physical count can still be corrected with a reason.</p> : <AmountField step={entry.refundAccountingVersion === 1 ? "0.01" : "1"} readOnly={entry.financePostingVersion===1} label="System Audit" value={values.cashAudit} onChange={(value) => setNumericField('cashAudit', value)} />}
            </div>

            <div>
              <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">Cash Drawer Denominations</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {(['denom500', 'denom200', 'denom100', 'denom50', 'denom20', 'denom10', 'change'] as const).map((field) => (
                  <AmountField
                    key={field}
                    step={field === 'change' && entry.refundAccountingVersion === 1 ? '0.01' : '1'}
                    label={field === 'change' ? 'Change' : field.replace('denom', '')}
                    value={denominations[field]}
                    onChange={(value) => setDenomination(field, value)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-border/70 bg-secondary/45 p-3 text-sm sm:grid-cols-3">
              <p><span className="text-muted-foreground">Current drawer</span><strong className="block">{money(originalDrawerTotal)}</strong></p>
              <p><span className="text-muted-foreground">Corrected drawer</span><strong className="block">{money(nextDrawerTotal)}</strong></p>
              <p><span className="text-muted-foreground">Cash Movement impact</span><strong className="block">{money(nextDrawerTotal - originalDrawerTotal)}</strong></p>
            </div>

            <FieldLabel label="Reason For Correction">
              <Textarea
                value={reason}
                placeholder="Explain exactly what was entered incorrectly."
                onChange={(event) => {
                  setReason(event.target.value)
                  setError('')
                }}
              />
            </FieldLabel>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : mode === 'owner-edit' ? 'Apply Owner Correction' : 'Submit For Owner Approval'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>{dialog}</>,
    document.body,
  )
}

function AmountField({ label, value, onChange, readOnly = false, step = '1' }: { label: string; value: number; step?: string; readOnly?: boolean; onChange: (value: string) => void }) {
  return (
    <FieldLabel label={label}>
      <Input readOnly={readOnly} type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </FieldLabel>
  )
}
