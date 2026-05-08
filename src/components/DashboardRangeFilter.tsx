import type { DashboardRange } from '../app/uiHelpers'

type DashboardRangeFilterProps = {
  value: DashboardRange
  onChange: (value: DashboardRange) => void
}

export function DashboardRangeFilter({ value, onChange }: DashboardRangeFilterProps) {
  return (
    <div className="settings-tabs dashboard-tabs">
      <button type="button" className={`top-nav-link ${value === 'today' ? 'active' : ''}`} onClick={() => onChange('today')}>
        Today
      </button>
      <button
        type="button"
        className={`top-nav-link ${value === 'yesterday' ? 'active' : ''}`}
        onClick={() => onChange('yesterday')}
      >
        Yesterday
      </button>
      <button type="button" className={`top-nav-link ${value === 'mtd' ? 'active' : ''}`} onClick={() => onChange('mtd')}>
        Month To Date
      </button>
    </div>
  )
}
