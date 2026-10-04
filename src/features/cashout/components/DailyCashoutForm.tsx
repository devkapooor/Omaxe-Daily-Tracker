import { useEffect, useState } from 'react'
import type { DailyCashoutEntry } from '@/domain/appTypes'
import { formatDisplayDate, numberValue, today } from '@/app/uiHelpers'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { SectionHeading } from '@/shared/ui/section-heading'
import { calculateCashoutAudit, drawerTotalFromDenominations, formatDrawerParticulars } from '@/domain/cashoutCorrections'
import { getPosCashoutPaymentMix } from '@/features/pos/data/posRepository'
import type { PosPaymentMethod } from '@/features/pos/domain/types'

type DailyCashoutFormProps = {
  currentUserId: string
  currentUserName: string
  todayCashExpenses: number
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => Promise<void> | void
}

type DailyDetailsDraft = {
  cashExpense: number
  cashSales: number
  cardSales: number
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

type PosMixState = { date: string; error: string; billCount: number; refundPaise: number; methods: Record<PosPaymentMethod, number> }
const emptyPosMix: PosMixState = { date: '', error: '', billCount: 0, refundPaise: 0, methods: { cash: 0, upi: 0, card: 0, 'bank-transfer': 0 } }
const rupeesFromPaise = (paise: number) => String(paise / 100)
const formatRupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyDrawerFormState: DrawerFormState = {
  change: '0',
  denom10: '0',
  denom100: '0',
  denom20: '0',
  denom200: '0',
  denom50: '0',
  denom500: '0',
}

export function DailyCashoutForm({ currentUserId, currentUserName, todayCashExpenses, onSave }: DailyCashoutFormProps) {
  const [entryDate, setEntryDate] = useState(today())
  const [posMix, setPosMix] = useState<PosMixState>(emptyPosMix)
  const [cashSale, setCashSale] = useState('0')
  const [upiSale, setUpiSale] = useState('0')
  const [cardSale, setCardSale] = useState('0')
  const [creditSale, setCreditSale] = useState('0')
  const [cashExpense, setCashExpense] = useState(() => String(todayCashExpenses))
  const [cashExpenseEdited, setCashExpenseEdited] = useState(false)
  const [systemAudit, setSystemAudit] = useState('0')
  const [drawerState, setDrawerState] = useState<DrawerFormState>(emptyDrawerFormState)
  const [pendingDraft, setPendingDraft] = useState<DailyDetailsDraft | null>(null)
  const [isDrawerModalOpen, setIsDrawerModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getPosCashoutPaymentMix(entryDate).then((summary) => {
      if (!active) return
      setPosMix({ date: entryDate, error: '', ...summary })
      setCashSale(rupeesFromPaise(summary.methods.cash))
      setUpiSale(rupeesFromPaise(summary.methods.upi))
      setCardSale(rupeesFromPaise(summary.methods.card))
    }).catch((cause: unknown) => {
      if (!active) return
      setPosMix({ ...emptyPosMix, date: entryDate, error: cause instanceof Error ? cause.message : 'Unable to load POS totals.' })
      setCashSale('0')
      setUpiSale('0')
      setCardSale('0')
    })
    return () => { active = false }
  }, [entryDate])

  const posMixForDate = posMix.date === entryDate
  const posMixLoading = !posMixForDate
  const displayPosMix = posMixForDate ? posMix : emptyPosMix
  const cashSaleValue = numberValue(posMixForDate ? cashSale : '0')
  const upiSaleValue = numberValue(posMixForDate ? upiSale : '0')
  const cardSaleValue = numberValue(posMixForDate ? cardSale : '0')
  const creditSaleValue = numberValue(creditSale)
  const cashExpenseInputValue = !cashExpenseEdited && entryDate === today() ? String(todayCashExpenses) : cashExpense
  const cashExpenseValue = numberValue(cashExpenseInputValue)
  const systemAuditValue = numberValue(systemAudit)
  const machineCardTotal = upiSaleValue + cardSaleValue
  const expectedCash = cashSaleValue - cashExpenseValue
  const drawerDenominations = {
    denom500: numberValue(drawerState.denom500),
    denom200: numberValue(drawerState.denom200),
    denom100: numberValue(drawerState.denom100),
    denom50: numberValue(drawerState.denom50),
    denom20: numberValue(drawerState.denom20),
    denom10: numberValue(drawerState.denom10),
    change: numberValue(drawerState.change),
  }
  const drawerTotal = drawerTotalFromDenominations(drawerDenominations)

  function resetForm() {
    setEntryDate(today())
    setCashSale(rupeesFromPaise(posMix.methods.cash))
    setUpiSale(rupeesFromPaise(posMix.methods.upi))
    setCardSale(rupeesFromPaise(posMix.methods.card))
    setCreditSale('0')
    setCashExpense(String(todayCashExpenses))
    setCashExpenseEdited(false)
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
      cardSales: cardSaleValue,
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

    const { auditDifference, auditMessage, auditStatus } = calculateCashoutAudit(pendingDraft.systemAudit, drawerTotal)
    const drawerParticulars = formatDrawerParticulars(drawerDenominations)

    setIsSaving(true)
    try {
      await onSave({
        date: pendingDraft.date,
        recordedBy: currentUserName,
        recordedByUserId: currentUserId,
        upiSales: pendingDraft.upiSales,
        cardSales: pendingDraft.cardSales,
        cashSales: pendingDraft.cashSales,
        returns: 0,
        creditSales: pendingDraft.creditSales,
        cashExpense: pendingDraft.cashExpense,
        cashAudit: pendingDraft.systemAudit,
        drawerDenominations,
        drawerTotal,
        auditDifference,
        auditStatus,
        auditMessage,
        actualCashParticulars: drawerParticulars,
        pendingCashParticulars: `By: ${currentUserName}\nExpected Cash: ${pendingDraft.expectedCash}\nDrawer Total: ${drawerTotal}\nSystem Audit: ${pendingDraft.systemAudit}\nAudit Check: ${auditMessage}`,
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
                  const nextDate = event.target.value
                  setEntryDate(nextDate)
                  setCashExpense(nextDate === today() ? String(todayCashExpenses) : '0')
                  setCashExpenseEdited(false)
                  setError('')
                }}
                required
              />
            </FieldLabel>

            <FieldLabel label="Cash Sale Recorded">
              <Input type="number" step="0.01" value={posMixForDate ? cashSale : '0'} onChange={(event) => setCashSale(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="Machine Total (UPI + Card)">
              <Input type="number" step="0.01" value={machineCardTotal} readOnly />
            </FieldLabel>

            <FieldLabel label="Credit Sale Recorded">
              <Input type="number" min="0" step="1" value={creditSale} onChange={(event) => setCreditSale(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="Cash Expense">
              <Input type="number" min="0" step="1" value={cashExpenseInputValue} onChange={(event) => { setCashExpense(event.target.value); setCashExpenseEdited(true) }} />
            </FieldLabel>

            <FieldLabel label="Expected Cash (Cash Sales - Cash Expense)">
              <Input type="number" value={expectedCash} readOnly />
            </FieldLabel>

            <FieldLabel label="System Audit">
              <Input type="number" min="0" step="1" value={systemAudit} onChange={(event) => setSystemAudit(event.target.value)} />
            </FieldLabel>

            <FieldLabel label="By">
              <Input value={currentUserName} readOnly />
            </FieldLabel>

            <div className="rounded-lg border border-border/70 bg-secondary/35 p-3 text-sm xl:col-span-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>POS totals for {formatDisplayDate(entryDate)}</strong>
                <span className="text-xs text-muted-foreground">{posMixLoading ? 'Loading…' : displayPosMix.error ? 'Unavailable' : `${displayPosMix.billCount} active bills`}</span>
              </div>
              {displayPosMix.error ? <p className="mt-1 text-xs text-destructive">{displayPosMix.error} POS totals could not be loaded. Enter Cash and Credit manually; UPI/Card will be saved as zero unless the POS connection is restored.</p> : <>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                  <span>Cash (net): <strong className="text-foreground">{formatRupees(displayPosMix.methods.cash)}</strong></span>
                  <span>UPI (net): <strong className="text-foreground">{formatRupees(displayPosMix.methods.upi)}</strong></span>
                  <span>Card (net): <strong className="text-foreground">{formatRupees(displayPosMix.methods.card)}</strong></span>
                  {displayPosMix.methods['bank-transfer'] !== 0 ? <span>Legacy Bank Transfer (existing POS bills only): <strong className="text-foreground">{formatRupees(displayPosMix.methods['bank-transfer'])}</strong></span> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">The combined machine total is shown above; POS UPI and Card amounts are saved separately. Approved refunds are already deducted by tender mode; total approved refunds: <strong className="text-foreground">{formatRupees(displayPosMix.refundPaise)}</strong>. Cash and Credit remain editable.</p>
              </>}
            </div>

            {error && <p className="text-sm font-semibold text-destructive xl:col-span-3">{error}</p>}

            <Button className="xl:col-span-3" type="submit" disabled={posMixLoading}>
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

