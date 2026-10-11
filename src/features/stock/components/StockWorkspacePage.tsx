import { useState } from 'react'
import type { AppUser } from '@/domain/financeTypes'
import { PageHeader, PageHeaderTab, PageHeaderTabsList } from '@/shared/ui/page-header'
import { PageLayout } from '@/shared/ui/page-layout'
import { Tabs } from '@/shared/ui/tabs'
import { CurrentStockPage } from './CurrentStockPage'
import { ReceiveStockPage } from './ReceiveStockPage'
import { StockAuditPage } from './StockAuditPage'
import { StockHistoryPage } from './StockHistoryPage'

export function StockWorkspacePage({ currentUser, showToast, ownerVendorEnabled }: { currentUser: AppUser; showToast: (message: string) => void; ownerVendorEnabled?: boolean }) {
  const [tab, setTab] = useState('current')
  return <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
    <PageLayout className="min-h-0 flex-1 overflow-hidden" header={<PageHeader title="Stock" tools={<div className="w-full min-w-0 sm:w-auto"><PageHeaderTabsList aria-label="Stock sections" className="grid grid-flow-row grid-cols-2 sm:grid-cols-4"><PageHeaderTab value="current">Current Stock</PageHeaderTab><PageHeaderTab value="receive">Receive Stock</PageHeaderTab><PageHeaderTab value="audit">Stock Audit</PageHeaderTab><PageHeaderTab value="history">Stock History</PageHeaderTab></PageHeaderTabsList></div>} />}>
      {tab === 'current' ? <CurrentStockPage currentUser={currentUser} /> : <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'receive' ? <ReceiveStockPage currentUser={currentUser} ownerEnabled={ownerVendorEnabled} showToast={showToast} /> : tab === 'audit' ? <StockAuditPage currentUser={currentUser} showToast={showToast} /> : <StockHistoryPage currentUser={currentUser} />}
      </div>}
    </PageLayout>
  </Tabs>
}
