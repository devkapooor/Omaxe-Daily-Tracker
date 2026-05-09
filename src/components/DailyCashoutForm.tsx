import { useState } from 'react'
import type { CashHolder, DailyCashoutEntry } from '@/domain/appTypes'
import { numberValue, today } from '@/app/uiHelpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { SectionHeading } from '@/components/ui/section-heading'

type DailyCashoutFormProps = {
  currentUserName: string
  currentUserHolder: CashHolder | null
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => void
}

export function DailyCashoutForm({ currentUserName, currentUserHolder, onSave }: DailyCashoutFormProps) {
  const [entryDate, setEntryDate] = useState(today())
  const [cashSale, setCashSale] = useState('0')
  const [upiSale, setUpiSale] = useState('0')
  const [creditSale, setCreditSale] = useState('0')
  const [cashExpense, setCashExpense] = useState('0')
  const [systemAudit, setSystemAudit] = useState('0')
  const [denom500, setDenom500] = useState('0')
  const [denom200, setDenom200] = useState('0')
  const [denom100, setDenom100] = useState('0')
  const [denom50, setDenom50] = useState('0')
  const [denom20, setDenom20] = useState('0')
  const [denom10, setDenom10] = useState('0')
  const [change, setChange] = useState('0')
  const [error, setError] = useState('')

  const cashSaleValue = numberValue(cashSale)
  const upiSaleValue = numberValue(upiSale)
  const creditSaleValue = numberValue(creditSale)
  const cashExpenseValue = numberValue(cashExpense)
  const systemAuditValue = numberValue(systemAudit)
  const drawerTotal =
    numberValue(denom500) * 500 +
    numberValue(denom200) * 200 +
    numberValue(denom100) * 100 +
    numberValue(denom50) * 50 +
    numberValue(denom20) * 20 +
    numberValue(denom10) * 10 +
    numberValue(change)
  const cashDifference = cashSaleValue - cashExpenseValue
  const drawerParticulars = [
    `500 x ${numberValue(denom500)} = ${numberValue(denom500) * 500}`,
    `200 x ${numberValue(denom200)} = ${numberValue(denom200) * 200}`,
    `100 x ${numberValue(denom100)} = ${numberValue(denom100) * 100}`,
    `50 x ${numberValue(denom50)} = ${numberValue(denom50) * 50}`,
    `20 x ${numberValue(denom20)} = ${numberValue(denom20) * 20}`,
    `10 x ${numberValue(denom10)} = ${numberValue(denom10) * 10}`,
    `Change = ${numberValue(change)}`,
    `Total = ${drawerTotal}`,
  ].join('\n')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!entryDate) {
      setError('Cashout date is required.')
      return
    }

    onSave({
      date: entryDate,
      recordedBy: currentUserName,
      recordedByHolder: currentUserHolder ?? undefined,
      upiSales: upiSaleValue,
      cashSales: cashSaleValue,
      returns: 0,
      creditSales: creditSaleValue,
      cashAudit: systemAuditValue,
      actualCashParticulars: drawerParticulars,
      pendingCashParticulars: `By: ${currentUserName}\nCash Difference: ${cashDifference}\nSystem Audit: ${systemAuditValue}`,
      pendingCashBalances: {
        dev: 0,
        arsh: 0,
        farhan: 0,
      },
      remainingBalance: cashDifference,
    })

    setError('')
    setEntryDate(today())
    setCashSale('0')
    setUpiSale('0')
    setCreditSale('0')
    setCashExpense('0')
    setSystemAudit('0')
    setDenom500('0')
    setDenom200('0')
    setDenom100('0')
    setDenom50('0')
    setDenom20('0')
    setDenom10('0')
    setChange('0')
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeading eyebrow="Daily Details" title="Cashout Register" />
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSubmit}>
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

          <FieldLabel label="Cash Difference (a-d)">
            <Input type="number" value={cashDifference} readOnly />
          </FieldLabel>

          <FieldLabel label="System Audit">
            <Input type="number" min="0" step="1" value={systemAudit} onChange={(event) => setSystemAudit(event.target.value)} />
          </FieldLabel>

          <FieldLabel label="By">
            <Input value={currentUserName} readOnly />
          </FieldLabel>

          <div className="space-y-1 xl:col-span-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Cash Drawer Particulars</p>
            <h3 className="text-xl font-black tracking-tight text-foreground">Denomination Count</h3>
          </div>

          <FieldLabel label="500">
            <Input type="number" min="0" step="1" value={denom500} onChange={(event) => setDenom500(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="200">
            <Input type="number" min="0" step="1" value={denom200} onChange={(event) => setDenom200(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="100">
            <Input type="number" min="0" step="1" value={denom100} onChange={(event) => setDenom100(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="50">
            <Input type="number" min="0" step="1" value={denom50} onChange={(event) => setDenom50(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="20">
            <Input type="number" min="0" step="1" value={denom20} onChange={(event) => setDenom20(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="10">
            <Input type="number" min="0" step="1" value={denom10} onChange={(event) => setDenom10(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="Change">
            <Input type="number" min="0" step="1" value={change} onChange={(event) => setChange(event.target.value)} />
          </FieldLabel>
          <FieldLabel label="Total">
            <Input type="number" value={drawerTotal} readOnly />
          </FieldLabel>

          {error && <p className="text-sm font-semibold text-destructive xl:col-span-3">{error}</p>}

          <Button className="xl:col-span-3">Save Cashout</Button>
        </form>
      </CardContent>
    </Card>
  )
}
