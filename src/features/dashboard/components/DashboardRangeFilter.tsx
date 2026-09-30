import type { DashboardMonthOffset } from '@/app/uiHelpers'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type DashboardRangeFilterProps = {
  value: DashboardMonthOffset
  onChange: (value: DashboardMonthOffset) => void
}

export function DashboardRangeFilter({ value, onChange }: DashboardRangeFilterProps) {
  return (
    <Tabs value={String(value)} onValueChange={(next) => onChange(Number(next) as DashboardMonthOffset)}>
      <TabsList aria-label="Dashboard month" className="min-h-8 grid-cols-3">
        <TabsTrigger value="0">T</TabsTrigger>
        <TabsTrigger value="1">T-1</TabsTrigger>
        <TabsTrigger value="2">T-2</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

