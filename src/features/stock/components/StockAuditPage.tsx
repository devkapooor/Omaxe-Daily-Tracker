import { useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import type { PosStockAuditBatch } from '@/features/pos/domain/types'
import { PosStockAuditPage } from '@/features/pos/components/PosGoodsReceipt'
import { StockAuditLogTable } from '@/features/logs/components/StockAuditLogTable'
import { Button } from '@/shared/ui/button'
import { FieldLabel } from '@/shared/ui/field-label'
import { Input } from '@/shared/ui/input'
import { StatusPanel } from '@/shared/ui/status-panel'
import { today } from '@/app/uiHelpers'
import { dateConstraints, readPage } from '../data/stockQueries'
import { useServerPage } from '../hooks/useServerPage'
import { StockPageControls } from './StockPageControls'
import { recentStockDate } from '../domain/stockDates'
export function StockAuditHistoryPage() {
  const [from, setFrom] = useState(recentStockDate)
  const [to, setTo] = useState(today)
  const key = `${from}:${to}`
  const data = useServerPage<PosStockAuditBatch>(key, (cursor) => readPage('stockAuditBatches', dateConstraints(from, to), cursor, 25, key))
  return <div className="grid gap-3"><div className="grid grid-cols-2 gap-2"><FieldLabel label="From"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FieldLabel><FieldLabel label="To"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FieldLabel></div>{data.error ? <StatusPanel variant="destructive">{data.error}<Button size="sm" variant="outline" onClick={data.retry}>Retry</Button></StatusPanel> : data.loading ? <StatusPanel>Loading audit history…</StatusPanel> : <StockAuditLogTable entries={data.items} serverPage />}<StockPageControls {...data} /></div>
}
export function StockAuditPage({ currentUser, showToast }: { currentUser: AppUser; showToast: (message: string) => void }) {
  return <div className="grid gap-3"><PosStockAuditPage currentUser={currentUser} showToast={showToast} /></div>
}
