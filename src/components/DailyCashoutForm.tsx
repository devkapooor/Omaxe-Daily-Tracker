import { useState } from 'react'
import type { DailyCashoutEntry } from '../domain/appTypes'
import { numberValue, today } from '../app/uiHelpers'

type DailyCashoutFormProps = {
  currentUserName: string
  onSave: (draft: Omit<DailyCashoutEntry, 'id' | 'createdAt'>) => void
}

export function DailyCashoutForm({ currentUserName, onSave }: DailyCashoutFormProps) {
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
    <form className="cashout-card purchase-form" onSubmit={handleSubmit}>
      <div className="card-title">
        <p className="eyebrow">Daily Details</p>
        <h2>Cashout Register</h2>
      </div>

      <label>
        Cashout For Date
        <input
          type="date"
          value={entryDate}
          onChange={(event) => {
            setEntryDate(event.target.value)
            setError('')
          }}
          required
        />
      </label>

      <label>
        Cash Sale Recorded (a)
        <input type="number" min="0" step="1" value={cashSale} onChange={(event) => setCashSale(event.target.value)} />
      </label>

      <label>
        UPI Sale Recorded (b)
        <input type="number" min="0" step="1" value={upiSale} onChange={(event) => setUpiSale(event.target.value)} />
      </label>

      <label>
        Credit Sale Recorded (c)
        <input type="number" min="0" step="1" value={creditSale} onChange={(event) => setCreditSale(event.target.value)} />
      </label>

      <label>
        Cash Expense (d)
        <input type="number" min="0" step="1" value={cashExpense} onChange={(event) => setCashExpense(event.target.value)} />
      </label>

      <label>
        Cash Difference (a-d)
        <input type="number" value={cashDifference} readOnly />
      </label>

      <label>
        System Audit
        <input type="number" min="0" step="1" value={systemAudit} onChange={(event) => setSystemAudit(event.target.value)} />
      </label>

      <label>
        By
        <input value={currentUserName} readOnly />
      </label>

      <div className="full-width">
        <p className="denomination-title">Cash Drawer Particulars</p>
      </div>
      <label>
        500
        <input type="number" min="0" step="1" value={denom500} onChange={(event) => setDenom500(event.target.value)} />
      </label>
      <label>
        200
        <input type="number" min="0" step="1" value={denom200} onChange={(event) => setDenom200(event.target.value)} />
      </label>
      <label>
        100
        <input type="number" min="0" step="1" value={denom100} onChange={(event) => setDenom100(event.target.value)} />
      </label>
      <label>
        50
        <input type="number" min="0" step="1" value={denom50} onChange={(event) => setDenom50(event.target.value)} />
      </label>
      <label>
        20
        <input type="number" min="0" step="1" value={denom20} onChange={(event) => setDenom20(event.target.value)} />
      </label>
      <label>
        10
        <input type="number" min="0" step="1" value={denom10} onChange={(event) => setDenom10(event.target.value)} />
      </label>
      <label>
        Change
        <input type="number" min="0" step="1" value={change} onChange={(event) => setChange(event.target.value)} />
      </label>

      <label>
        Total
        <input type="number" value={drawerTotal} readOnly />
      </label>

      {error && <p className="form-error light full-width">{error}</p>}

      <button className="primary full-width">Save Cashout</button>
    </form>
  )
}
