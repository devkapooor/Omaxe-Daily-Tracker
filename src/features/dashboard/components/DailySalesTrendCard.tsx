import { useState } from 'react'
import { money } from '@/app/uiHelpers'
import type { DailySalesTrendPoint, MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

const chart = { width: 640, height: 190, left: 12, right: 12, top: 14, bottom: 24 }

function tooltipValue(value: number | null) {
  return value === null ? 'No entry' : money(value)
}

function barLayout(index: number, pointCount: number, series: 'selected' | 'previous', value: number, maxValue: number) {
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const slotWidth = plotWidth / Math.max(pointCount, 1)
  const barWidth = Math.min(7, Math.max((slotWidth - 4) / 2, 1))
  const pairWidth = barWidth * 2 + 2
  const x = chart.left + (index * slotWidth) + ((slotWidth - pairWidth) / 2) + (series === 'previous' ? barWidth + 2 : 0)
  const height = Math.max((Math.max(value, 0) / maxValue) * plotHeight, value > 0 ? 1 : 0)
  return { x, y: chart.top + plotHeight - height, width: barWidth, height }
}

function formatDay(date: string, day: number) {
  return date ? `${date.slice(0, 7)}-${String(day).padStart(2, '0')}` : `Day ${day}`
}

export function DailySalesTrendCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const values = performance.dailySalesTrend.flatMap((point) => [point.selected, point.previous]).filter((value): value is number => value !== null)
  const maxValue = Math.max(...values, 1)
  const activePoint: DailySalesTrendPoint | null = activeIndex === null ? null : performance.dailySalesTrend[activeIndex] ?? null
  const plotWidth = chart.width - chart.left - chart.right
  const activeX = activeIndex === null
    ? null
    : chart.left + ((activeIndex + 0.5) / Math.max(performance.dailySalesTrend.length, 1)) * plotWidth
  const tooltipLeft = activeX === null ? 0 : Math.min(Math.max(activeX, 88), chart.width - 88)
  const axisDays = Array.from(new Set([1, Math.ceil((performance.dailySalesTrend.length + 1) / 2), performance.dailySalesTrend.length]))
    .filter((day) => day > 0)

  function activateNearestDay(clientX: number, element: SVGSVGElement) {
    const bounds = element.getBoundingClientRect()
    const viewBoxX = ((clientX - bounds.left) / bounds.width) * chart.width
    const ratio = (viewBoxX - chart.left) / plotWidth
    const nearestIndex = Math.floor(ratio * performance.dailySalesTrend.length)
    setActiveIndex(Math.min(Math.max(nearestIndex, 0), performance.dailySalesTrend.length - 1))
  }

  function handleChartKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const lastIndex = performance.dailySalesTrend.length - 1
    if (lastIndex < 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const direction = event.key === 'ArrowRight' ? 1 : -1
      setActiveIndex((current) => Math.min(Math.max((current ?? 0) + direction, 0), lastIndex))
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : lastIndex)
    }
  }

  return (
    <GlowCard glowColor="blue" className="p-4 lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Daily Sales Trend</span>
          <strong className="mt-1 block text-base font-semibold text-foreground">Selected month vs preceding month</strong>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Selected</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Preceding</span>
        </div>
      </div>

      {values.length > 0 ? (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>{money(maxValue)}</span>
            <span>Daily sales</span>
          </div>
          <div
            className="relative mt-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            role="group"
            tabIndex={0}
            aria-label={`Interactive daily sales comparison for ${performance.monthLabel}. Use the left and right arrow keys to inspect each day.`}
            onFocus={() => setActiveIndex((current) => current ?? 0)}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={handleChartKeyDown}
          >
            {activePoint && activeX !== null ? (
              <div
                className="pointer-events-none absolute z-10 min-w-40 rounded-sm border border-border bg-popover px-3 py-2.5 text-xs font-medium text-popover-foreground shadow-lg"
                style={{ left: `${(tooltipLeft / chart.width) * 100}%`, top: '8%', transform: 'translate(-50%, 0)' }}
                aria-live="polite"
              >
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{formatDay(performance.monthKey, activePoint.day)}</span>
                <span className="mt-1 flex items-center justify-between gap-3"><span className="text-cyan-600 dark:text-cyan-300">Selected</span>{tooltipValue(activePoint.selected)}</span>
                <span className="mt-0.5 flex items-center justify-between gap-3"><span className="text-muted-foreground">Preceding</span>{tooltipValue(activePoint.previous)}</span>
              </div>
            ) : null}
            <svg
              className="h-[150px] w-full overflow-visible"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Grouped daily sales columns for ${performance.monthLabel} and the preceding month`}
              onPointerMove={(event) => activateNearestDay(event.clientX, event.currentTarget)}
              onPointerDown={(event) => {
                activateNearestDay(event.clientX, event.currentTarget)
                if (event.pointerType === 'touch') event.currentTarget.parentElement?.focus()
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'touch') setActiveIndex(null)
              }}
            >
              {[0, 0.5, 1].map((position) => {
                const y = chart.top + position * (chart.height - chart.top - chart.bottom)
                return <line key={position} x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
              })}
              {performance.dailySalesTrend.map((point, index) => {
                const selected = point.selected === null ? null : barLayout(index, performance.dailySalesTrend.length, 'selected', point.selected, maxValue)
                const previous = point.previous === null ? null : barLayout(index, performance.dailySalesTrend.length, 'previous', point.previous, maxValue)
                return (
                  <g key={point.day}>
                    {previous && previous.height > 0 ? <rect {...previous} rx="2" fill="#64748b" opacity="0.85" /> : null}
                    {selected && selected.height > 0 ? <rect {...selected} rx="2" fill="#22d3ee" /> : null}
                  </g>
                )
              })}
              {activeIndex !== null && activeX !== null ? <line x1={activeX} x2={activeX} y1={chart.top} y2={chart.height - chart.bottom} stroke="rgba(34,211,238,0.55)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
            </svg>
          </div>
          <div className={`-mt-4 flex px-1 text-[11px] font-medium text-muted-foreground ${axisDays.length === 1 ? 'justify-center' : 'justify-between'}`}>
            {axisDays.map((day) => <span key={day}>Day {day}</span>)}
          </div>
          <p className="mt-1.5 text-[9px] font-semibold text-muted-foreground">Select a day to compare exact sales · Gaps are unrecorded</p>
        </div>
      ) : (
        <div className="mt-3 rounded-sm border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
          No recorded sales are available for this comparison.
        </div>
      )}
    </GlowCard>
  )
}
