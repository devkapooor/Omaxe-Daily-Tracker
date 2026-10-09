import { useState } from 'react'
import { money } from '@/app/uiHelpers'
import type { MonthlyPerformanceMetrics } from '@/features/dashboard/domain/deriveMonthlyPerformance'
import { GlowCard } from '@/shared/ui/spotlight-card'

const mixMeta = [
  { key: 'cash', label: 'Cash', color: '#22d3ee', dot: 'bg-cyan-400' },
  { key: 'upi', label: 'UPI', color: '#3b82f6', dot: 'bg-blue-500' },
  { key: 'card', label: 'Card', color: '#8b5cf6', dot: 'bg-violet-500' },
  { key: 'credit', label: 'Credit', color: '#818cf8', dot: 'bg-indigo-400' },
] as const

type MixKey = (typeof mixMeta)[number]['key']

function pointAt(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  return { x: 110 + radius * Math.cos(radians), y: 110 + radius * Math.sin(radians) }
}

function donutSegmentPath(startAngle: number, endAngle: number) {
  const outerRadius = 78
  const innerRadius = 52
  const outerStart = pointAt(outerRadius, startAngle)
  const innerStart = pointAt(innerRadius, startAngle)
  const span = endAngle - startAngle

  if (span >= 359.99) {
    const outerOpposite = pointAt(outerRadius, startAngle + 180)
    const innerOpposite = pointAt(innerRadius, startAngle + 180)
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerOpposite.x} ${outerOpposite.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerOpposite.x} ${innerOpposite.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y} Z`,
    ].join(' ')
  }

  const outerEnd = pointAt(outerRadius, endAngle)
  const innerEnd = pointAt(innerRadius, endAngle)
  const largeArc = span > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`,
  ].join(' ')
}

export function SalesMixDonutCard({ performance }: { performance: MonthlyPerformanceMetrics }) {
  const [selectedKey, setSelectedKey] = useState<MixKey | null>(null)
  const [hoveredKey, setHoveredKey] = useState<MixKey | null>(null)
  const mix = mixMeta.map((item) => ({ ...item, amount: Math.max(performance.salesMix[item.key], 0) }))
  const total = mix.reduce((sum, item) => sum + item.amount, 0)
  const activeKey = hoveredKey ?? selectedKey
  const activeItem = mix.find((item) => item.key === activeKey)
  const { segments } = mix.reduce<{ angle: number; segments: Array<(typeof mix)[number] & { startAngle: number; endAngle: number; percentage: number }> }>((result, item) => {
    const endAngle = result.angle + (total > 0 ? (item.amount / total) * 360 : 0)
    return {
      angle: endAngle,
      segments: [...result.segments, {
        ...item,
        startAngle: result.angle,
        endAngle,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
      }],
    }
  }, { angle: -90, segments: [] })

  function toggleSelection(key: MixKey) {
    setSelectedKey((current) => current === key ? null : key)
  }

  return (
    <GlowCard glowColor="blue" className="h-full p-4">
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Sales Mix</span>
      <div className="mt-2 grid items-center gap-2 sm:grid-cols-[minmax(8rem,0.85fr)_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(8rem,0.85fr)_minmax(0,1fr)]">
        <svg className="mx-auto w-full max-w-52" viewBox="0 0 220 220" role="img" aria-label={`Interactive sales mix for ${performance.monthLabel}`}>
          {segments.map((item) => item.amount > 0 ? (
            <path
              key={item.key}
              d={donutSegmentPath(item.startAngle, item.endAngle)}
              fill={item.color}
              opacity={!activeKey || activeKey === item.key ? 1 : 0.35}
              role="button"
              tabIndex={0}
              aria-label={`${item.label}: ${money(item.amount)}, ${item.percentage.toFixed(1)} percent`}
              onPointerEnter={() => setHoveredKey(item.key)}
              onPointerLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(item.key)}
              onBlur={() => setHoveredKey(null)}
              onClick={() => toggleSelection(item.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleSelection(item.key)
                }
              }}
              className="cursor-pointer outline-none focus-visible:opacity-75"
            />
          ) : null)}
          <text x="110" y="103" textAnchor="middle" className="fill-muted-foreground" fontSize="10">
            {activeItem ? activeItem.label : 'Sales by mode'}
          </text>
          <text x="110" y="123" textAnchor="middle" className="fill-foreground" fontSize="13" fontWeight="700">
            {money(activeItem ? activeItem.amount : total)}
          </text>
        </svg>

        <div className="grid grid-cols-2 gap-1.5">
          {segments.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`min-w-0 rounded border px-2 py-1.5 text-left transition-colors ${activeKey === item.key ? 'border-primary bg-primary/10' : 'border-border bg-muted hover:bg-accent'}`}
              aria-pressed={selectedKey === item.key}
              onPointerEnter={() => setHoveredKey(item.key)}
              onPointerLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(item.key)}
              onBlur={() => setHoveredKey(null)}
              onClick={() => toggleSelection(item.key)}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto tabular-nums">{item.percentage.toFixed(0)}%</span>
              </span>
              <strong className="mt-0.5 block truncate font-mono text-xs font-semibold tabular-nums text-foreground">{money(item.amount)}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 rounded border border-border bg-muted px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">Returns (separate)</span>
        <strong className="font-mono font-semibold tabular-nums text-foreground">{money(performance.salesMix.returns)}</strong>
      </div>
      {total <= 0 ? <p className="mt-2 text-center text-xs text-muted-foreground">No recorded sales by payment mode.</p> : null}
    </GlowCard>
  )
}
