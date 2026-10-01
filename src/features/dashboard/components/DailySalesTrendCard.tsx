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

export function DailySalesTrendCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  const values = performance.dailySalesTrend.flatMap((point) => [point.selected, point.previous]).filter((value): value is number => value !== null)
  const maxValue = Math.max(...values, 1)
  const selectedPoints = pointCoordinates(performance.dailySalesTrend, 'selected', maxValue)
  const previousPoints = pointCoordinates(performance.dailySalesTrend, 'previous', maxValue)
  const finalDay = performance.dailySalesTrend.at(-1)?.day ?? 0
  const middleDay = finalDay > 1 ? Math.ceil(finalDay / 2) : 1
  const axisDays = Array.from(new Set([1, middleDay, finalDay])).filter((day) => day > 0)

  return (
    <GlowCard glowColor="blue" className="p-3 lg:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-[11px]">Daily Sales Trend</span>
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
          <svg
            className="mt-1 h-[150px] w-full overflow-visible"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily sales trend for ${performance.monthLabel} compared with the preceding month`}
          >
            {[0, 0.5, 1].map((position) => {
              const y = chart.top + position * (chart.height - chart.top - chart.bottom)
              return <line key={position} x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
            })}
            <TrendLine points={previousPoints} color="#64748b" />
            <TrendLine points={selectedPoints} color="#22d3ee" />
          </svg>
          <div className={`-mt-4 flex px-1 text-[9px] font-bold text-muted-foreground ${axisDays.length === 1 ? 'justify-center' : 'justify-between'}`}>
            {axisDays.map((day) => <span key={day}>Day {day}</span>)}
          </div>
          <p className="mt-2 text-[9px] font-semibold text-muted-foreground">Gaps indicate days with no recorded sales; no values are inferred.</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border/80 bg-background/30 px-3 py-8 text-center text-xs font-semibold text-muted-foreground">
          No recorded sales are available for this comparison.
        </div>
      )}
    </GlowCard>
  )
}
