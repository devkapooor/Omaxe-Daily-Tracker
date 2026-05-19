import { useState } from 'react'
import type { CashHolder, DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, numberValue, today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'

type DailyCashoutFormProps = {
  currentUserName: string
  currentUserHolder: CashHolder | null
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void> | void
}

type DailyDetailsDraft = {
  cashExpense: number
  cashSales: number
  creditSales: number
  date: string
  expectedCash: number
  systemAudit: number
  upiSales: number
}

type DrawerFormState = {
  change: string
  denom10: string
  denom100: string
  denom20: string
  denom200: string
  denom50: string
  denom500: string
}

const emptyDrawerFormState: DrawerFormState = {
  change: '0',
  denom10: '0',
  denom100: '0',
  denom20: '0',
  denom200: '0',
  denom50: '0',
  denom500: '0',
}

export function DailyCashoutForm({ currentUserName, currentUserHolder, onSave }: DailyCashoutFormProps) {
  const [entryDate, setEntryDate] = useState(today())
  const [cashSale, setCashSale] = useState('0')
  const [upiSale, setUpiSale] = useState('0')
  const [creditSale, setCreditSale] = useState('0')
  const [cashExpense, setCashExpense] = useState('0')
  const [systemAudit, setSystemAudit] = useState('0')
  const [drawerState, setDrawerState] = useState<DrawerFormState>(emptyDrawerFormState)
  const [pendingDraft, setPendingDraft] = useState<DailyDetailsDraft | null>(null)
  const [isDrawerModalOpen, setIsDrawerModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const cashSaleValue = numberValue(cashSale)
  const upiSaleValue = numberValue(upiSale)
  const creditSaleValue = numberValue(creditSale)
  const cashExpenseValue = numberValue(cashExpense)
  const systemAuditValue = numberValue(systemAudit)
  const expectedCash = cashSaleValue - cashExpenseValue
  const drawerTotal =
    numberValue(drawerState.denom500) * 500 +
    numberValue(drawerState.denom200) * 200 +
    numberValue(drawerState.denom100) * 100 +
    numberValue(drawerState.denom50) * 50 +
    numberValue(drawerState.denom20) * 20 +
    numberValue(drawerState.denom10) * 10 +
    numberValue(drawerState.change)

  function resetForm() {
    setEntryDate(today())
    setCashSale('0')
    setUpiSale('0')
    setCreditSale('0')
    setCashExpense('0')
    setSystemAudit('0')
    setDrawerState(emptyDrawerFormState)
    setPendingDraft(null)
    setIsDrawerModalOpen(false)
  }

  function openDrawerStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!entryDate) {
      setError('Cashout date is required.')
      return
    }

    setPendingDraft({
      date: entryDate,
      cashSales: cashSaleValue,
      upiSales: upiSaleValue,
      creditSales: creditSaleValue,
      cashExpense: cashExpenseValue,
      systemAudit: systemAuditValue,
      expectedCash,
    })
    setError('')
    setIsDrawerModalOpen(true)
  }

  async function saveFinalCashout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingDraft) return

    const auditDifference = pendingDraft.systemAudit - drawerTotal
    const auditStatus =
      auditDifference > 0 ? 'cash-less' : auditDifference < 0 ? 'cash-more' : 'matched'
    const auditMessage =
      auditDifference > 0
        ? `WARNING: Cash is less by ${auditDifference}.`
        : auditDifference < 0
          ? `Cash is more by ${Math.abs(auditDifference)}, probably wrong billings.`
          : 'Cash matches the system audit.'

    const drawerParticulars = [
      `500 x ${numberValue(drawerState.denom500)} = ${numberValue(drawerState.denom500) * 500}`,
      `200 x ${numberValue(drawerState.denom200)} = ${numberValue(drawerState.denom200) * 200}`,
      `100 x ${numberValue(drawerState.denom100)} = ${numberValue(drawerState.denom100) * 100}`,
      `50 x ${numberValue(drawerState.denom50)} = ${numberValue(drawerState.denom50) * 50}`,
      `20 x ${numberValue(drawerState.denom20)} = ${numberValue(drawerState.denom20) * 20}`,
      `10 x ${numberValue(drawerState.denom10)} = ${numberValue(drawerState.denom10) * 10}`,
      `Change = ${numberValue(drawerState.change)}`,
      `Total = ${drawerTotal}`,
    ].join('\n')

    setIsSaving(true)
    try {
      await onSave({
        date: pendingDraft.date,
        recordedBy: currentUserName,
        recordedByHolder: currentUserHolder ?? undefined,
        upiSales: pendingDraft.upiSales,
        cashSales: pendingDraft.cashSales,
        returns: 0,
        creditSales: pendingDraft.creditSales,
        cashAudit: pendingDraft.systemAudit,
        drawerTotal,
        auditDifference,
        auditStatus,
        auditMessage,
        actualCashParticulars: drawerParticulars,
        pendingCashParticulars: `By: ${currentUserName}\nExpected Cash: ${pendingDraft.expectedCash}\nDrawer Total: ${drawerTotal}\nSystem Audit: ${pendingDraft.systemAudit}\nAudit Check: ${auditMessage}`,
        pendingCashBalances: {
          dev: 0,
          arsh: 0,
          farhan: 0,
        },
        remainingBalance: drawerTotal,
      })
      setError('')
      resetForm()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cashout.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader>
          <SectionHeading eyebrow="Daily Details" title="Cashout Register" />
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={openDrawerStep}>
            <FieldLabel label="Cashout For Date">
              <Input
                type="date"
                value={entryDate}
                onChange={(event) => {
                  setEntryDate(event.target.value)
                  setError('')
                }}
                required
              />
            </FieldLabel>

            <FieldLabel label="Cash Sale Recorded (a)">
              <Input type="number" min="0" step="1" value={cashSale} onChange={(event) => setCashSale(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="UPI Sale Recorded (b)">
              <Input type="number" min="0" step="1" value={upiSale} onChange={(event) => setUpiSale(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="Credit Sale Recorded (c)">
              <Input type="number" min="0" step="1" value={creditSale} onChange={(event) => setCreditSale(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="Cash Expense (d)">
              <Input type="number" min="0" step="1" value={cashExpense} onChange={(event) => setCashExpense(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="Expected Cash (a-d)">
              <Input type="number" value={expectedCash} readOnly />
            </FieldLabel>

            <FieldLabel label="System Audit">
              <Input type="number" min="0" step="1" value={systemAudit} onChange={(event) => setSystemAudit(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="By">
              <Input value={currentUserName} readOnly />
            </FieldLabel>

            {error && <p className="text-sm font-semibold text-destructive xl:col-span-3">{error}</p>}

            <Button className="xl:col-span-3" type="submit">
              Continue To Cash Drawer
            </Button>
          </form>
        </CardContent>
      </Card>

      {isDrawerModalOpen && pendingDraft ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
            <CardHeader className="gap-3">
              <SectionHeading eyebrow="Cash Drawer Particulars" title="Complete Daily Cashout" />
              <p className="text-sm font-medium text-muted-foreground">
                Review the drawer count and submit the final daily cashout for {formatDisplayDate(pendingDraft.date)}.
              </p>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={saveFinalCashout}>
                <FieldLabel label="500">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom500}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom500: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="200">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom200}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom200: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="100">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom100}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom100: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="50">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom50}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom50: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="20">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom20}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom20: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="10">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.denom10}
                    onChange={(event) => setDrawerState((current) => ({ ...current, denom10: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="Change">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={drawerState.change}
                    onChange={(event) => setDrawerState((current) => ({ ...current, change: event.target.value }))}
                  />
                </FieldLabel>
                <FieldLabel label="Drawer Total">
                  <Input type="number" value={drawerTotal} readOnly />
                </FieldLabel>
                <FieldLabel label="Cash Difference">
                  <Input type="number" value={pendingDraft.expectedCash} readOnly />
                </FieldLabel>

                <div className="rounded-[18px] border border-border/70 bg-secondary/55 p-4 text-sm font-medium text-foreground md:col-span-2 xl:col-span-3">
                  {pendingDraft.systemAudit > drawerTotal
                    ? `WARNING: Cash is less by ${pendingDraft.systemAudit - drawerTotal}.`
                    : pendingDraft.systemAudit < drawerTotal
                      ? `Cash is more by ${drawerTotal - pendingDraft.systemAudit}, probably wrong billings.`
                      : 'Cash matches the system audit.'}
                </div>

                <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-3 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDrawerModalOpen(false)
                      setPendingDraft(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? 'Saving...' : 'Save Cashout'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}

