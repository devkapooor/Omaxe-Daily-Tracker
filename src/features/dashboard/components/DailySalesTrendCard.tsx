import { useState } from 'react'
import { money } from '@/app/uiHelpers'
import type { DailySalesTrendPoint, MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

const chart = {
  width: 640,
  height: 190,
  left: 12,
  right: 12,
  top: 14,
  bottom: 24,
}

function pointCoordinates(points: DailySalesTrendPoint[], key: 'selected' | 'previous', maxValue: number) {
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const lastIndex = Math.max(points.length - 1, 1)

  return points.map((point, index) => {
    const value = point[key]
    if (value === null) return null
    return {
      x: chart.left + (index / lastIndex) * plotWidth,
      y: chart.top + plotHeight - (value / maxValue) * plotHeight,
    }
  })
}

function lineSegments(points: Array<{ x: number; y: number } | null>) {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []

  points.forEach((point) => {
    if (point) {
      current.push(point)
      return
    }
    if (current.length) segments.push(current)
    current = []
  })
  if (current.length) segments.push(current)
  return segments
}

function TrendLine({ points, color }: { points: Array<{ x: number; y: number } | null>; color: string }) {
  return (
    <>
      {lineSegments(points).map((segment, index) => (
        segment.length > 1 ? (
          <polyline
            key={index}
            points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <circle key={index} cx={segment[0].x} cy={segment[0].y} r="3" fill={color} />
        )
      ))}
    </>
  )
}

function tooltipValue(value: number | null) {
  return value === null ? 'No entry' : money(value)
}

export function DailySalesTrendCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const values = performance.dailySalesTrend.flatMap((point) => [point.selected, point.previous]).filter((value): value is number => value !== null)
  const maxValue = Math.max(...values, 1)
  const selectedPoints = pointCoordinates(performance.dailySalesTrend, 'selected', maxValue)
  const previousPoints = pointCoordinates(performance.dailySalesTrend, 'previous', maxValue)
  const activePoint = activeIndex === null ? null : performance.dailySalesTrend[activeIndex]
  const activeCoordinates = activeIndex === null ? null : selectedPoints[activeIndex] ?? previousPoints[activeIndex]
  const activeX = activeIndex === null
    ? null
    : chart.left + (activeIndex / Math.max(performance.dailySalesTrend.length - 1, 1)) * (chart.width - chart.left - chart.right)
  const tooltipLeft = activeX === null ? 0 : Math.min(Math.max(activeX, 84), chart.width - 84)
  const tooltipAbovePoint = activeCoordinates !== null && activeCoordinates.y > chart.height / 2
  const tooltipTop = activeCoordinates === null
    ? chart.top
    : activeCoordinates.y + (tooltipAbovePoint ? -8 : 8)
  const finalDay = performance.dailySalesTrend.at(-1)?.day ?? 0
  const middleDay = finalDay > 1 ? Math.ceil(finalDay / 2) : 1
  const axisDays = Array.from(new Set([1, middleDay, finalDay])).filter((day) => day > 0)

  function activateNearestPoint(clientX: number, element: SVGSVGElement) {
    const bounds = element.getBoundingClientRect()
    const viewBoxX = ((clientX - bounds.left) / bounds.width) * chart.width
    const plotWidth = chart.width - chart.left - chart.right
    const ratio = (viewBoxX - chart.left) / plotWidth
    const nearestIndex = Math.round(ratio * Math.max(performance.dailySalesTrend.length - 1, 0))
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
    <GlowCard glowColor="blue" className="p-3 lg:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px] dark:text-blue-300">Daily Sales Trend</span>
          <strong className="mt-1 block text-base font-black text-foreground">Selected month vs preceding month</strong>
        </div>
        <div className="flex flex-wrap gap-3 text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-400" />Selected</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Preceding</span>
        </div>
      </div>

      {values.length > 0 ? (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground">
            <span>{money(maxValue)}</span>
            <span>Daily value</span>
          </div>
          <div
            className="relative mt-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            role="group"
            tabIndex={0}
            aria-label={`Interactive daily sales trend for ${performance.monthLabel}. Use the left and right arrow keys to inspect each day.`}
            onFocus={() => setActiveIndex((current) => current ?? 0)}
            onBlur={() => setActiveIndex(null)}
            onKeyDown={handleChartKeyDown}
          >
            {activePoint && activeX !== null ? (
              <div
                className="pointer-events-none absolute z-10 min-w-32 rounded-lg border border-border/80 bg-popover/95 px-2.5 py-2 text-[10px] font-bold text-popover-foreground shadow-lg backdrop-blur-sm"
                style={{
                  left: `${(tooltipLeft / chart.width) * 100}%`,
                  top: `${(tooltipTop / chart.height) * 100}%`,
                  transform: tooltipAbovePoint ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                }}
                aria-live="polite"
              >
                <span className="block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Day {activePoint.day}</span>
                <span className="mt-1 flex items-center justify-between gap-3"><span className="text-cyan-600 dark:text-cyan-300">Selected</span>{tooltipValue(activePoint.selected)}</span>
                <span className="mt-0.5 flex items-center justify-between gap-3"><span className="text-slate-500 dark:text-slate-300">Preceding</span>{tooltipValue(activePoint.previous)}</span>
              </div>
            ) : null}
            <svg
              className="h-[150px] w-full overflow-visible"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Daily sales trend for ${performance.monthLabel} compared with the preceding month`}
              onPointerMove={(event) => activateNearestPoint(event.clientX, event.currentTarget)}
              onPointerDown={(event) => {
                activateNearestPoint(event.clientX, event.currentTarget)
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
              <TrendLine points={previousPoints} color="#64748b" />
              <TrendLine points={selectedPoints} color="#22d3ee" />
              {activePoint && activeX !== null ? (
                <>
                  <line
                    x1={activeX}
                    x2={activeX}
                    y1={chart.top}
                    y2={chart.height - chart.bottom}
                    stroke="rgba(34,211,238,0.55)"
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  {previousPoints[activeIndex ?? 0] ? <circle cx={previousPoints[activeIndex ?? 0]!.x} cy={previousPoints[activeIndex ?? 0]!.y} r="4" fill="#64748b" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
                  {selectedPoints[activeIndex ?? 0] ? <circle cx={selectedPoints[activeIndex ?? 0]!.x} cy={selectedPoints[activeIndex ?? 0]!.y} r="4" fill="#22d3ee" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
                </>
              ) : null}
            </svg>
          </div>
          <div className={`-mt-4 flex px-1 text-[9px] font-bold text-muted-foreground ${axisDays.length === 1 ? 'justify-center' : 'justify-between'}`}>
            {axisDays.map((day) => <span key={day}>Day {day}</span>)}
          </div>
          <p className="mt-1.5 text-[9px] font-semibold text-muted-foreground">Select a day to inspect · Gaps are unrecorded</p>
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-dashed border-border/80 bg-background/30 px-3 py-5 text-center text-xs font-semibold text-muted-foreground">
          No recorded sales are available for this comparison.
        </div>
      )}
    </GlowCard>
  )
}
