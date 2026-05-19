import type { DashboardRange } from '@/app/uiHelpers'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'

type DashboardRangeFilterProps = {
  value: DashboardRange
  onChange: (value: DashboardRange) => void
}

export function DashboardRangeFilter({ value, onChange }: DashboardRangeFilterProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as DashboardRange)}>
      <TabsList className="grid-cols-2">
        <TabsTrigger value="yesterday">Yesterday</TabsTrigger>
        <TabsTrigger value="mtd">Month To Date</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

