import { useMemo, useState } from 'react'
import type { CashHolder, CashTransfer } from '../domain/appTypes'
import { money, MovementHistoryRange, numberValue, resolveCashHolderFromUserName, shiftDate, today } from '../app/uiHelpers'

type CashMovementFormProps = {
  currentUserName: string
  balances: Record<CashHolder, number>
  bankTotal: number
  transfers: CashTransfer[]
  onTransfer: (draft: Omit<CashTransfer, 'id' | 'createdAt'>) => void
}

export function CashMovementForm({ currentUserName, balances, bankTotal, transfers, onTransfer }: CashMovementFormProps) {
  const currentHolder = useMemo(() => resolveCashHolderFromUserName(currentUserName), [currentUserName])
  const transferOptions = useMemo(
    () => [...(['Dev', 'Arsh', 'Farhan'] as CashHolder[]).filter((person) => person !== currentHolder), 'Bank'],
    [currentHolder],
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

  function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
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

    onTransfer({
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
  }

  return (
    <section className="cashout-card pending-cash-panel">
      <div className="card-title">
        <p className="eyebrow">Cash Movement</p>
        <h2>Transfer Pending Cash</h2>
      </div>
      <div className="pending-cash-grid">
        {(['Dev', 'Arsh', 'Farhan'] as CashHolder[]).map((person) => (
          <div className="summary-card compact" key={person}>
            <span>{person}</span>
            <strong>{money(balances[person] ?? 0)}</strong>
          </div>
        ))}
        <div className="summary-card compact">
          <span>Transferred To Bank</span>
          <strong>{money(bankTotal)}</strong>
        </div>
      </div>
      <form className="transfer-form" onSubmit={submitTransfer}>
        <label>
          Transfer To
          <select
            value={transferTo}
            onChange={(event) => {
              setTransferTo(event.target.value)
              setError('')
            }}
          >
            {transferOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Amount
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setError('')
            }}
          />
        </label>
        <label className="full-width">
          Reason
          <input
            type="text"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setError('')
            }}
            placeholder="e.g. Cash deposited to bank"
            required
          />
        </label>
        {error && <p className="form-error light full-width">{error}</p>}
        <button className="primary full-width">Transfer Cash</button>
      </form>
      <button type="button" className="ghost-button history-toggle" onClick={() => setShowHistory((current) => !current)}>
        {showHistory ? 'Hide Log / History' : 'Show Log / History'}
      </button>
      {showHistory && (
        <>
          <div className="settings-tabs dashboard-tabs movement-history-filters">
            <button
              type="button"
              className={`top-nav-link ${historyRange === 'today' ? 'active' : ''}`}
              onClick={() => setHistoryRange('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`top-nav-link ${historyRange === 'yesterday' ? 'active' : ''}`}
              onClick={() => setHistoryRange('yesterday')}
            >
              Yesterday
            </button>
            <button type="button" className={`top-nav-link ${historyRange === 'mtd' ? 'active' : ''}`} onClick={() => setHistoryRange('mtd')}>
              Month To Date
            </button>
            <button
              type="button"
              className={`top-nav-link ${historyRange === 'custom' ? 'active' : ''}`}
              onClick={() => setHistoryRange('custom')}
            >
              Custom Date
            </button>
          </div>
          {historyRange === 'custom' && (
            <label className="movement-history-date">
              Date
              <input type="date" value={historyCustomDate} onChange={(event) => setHistoryCustomDate(event.target.value)} />
            </label>
          )}
          <div className="table-shell movement-history">
            {filteredTransfers.length === 0 && <p className="empty-state">No cash movement history for this filter.</p>}
            {filteredTransfers.map((entry) => (
              <div className="table-row" key={entry.id}>
                <span>
                  {entry.date} | {entry.from} to {entry.toType === 'bank' ? 'Bank' : entry.toPerson} | {entry.reason} | By{' '}
                  {entry.createdBy} at {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <strong>{money(entry.amount)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
