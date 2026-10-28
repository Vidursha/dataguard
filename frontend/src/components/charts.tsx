/**
 * Charts with one data series. The colours come from the theme (CSS variables),
 * so the same checked blue works in light and dark mode. Every chart has a text
 * summary for screen readers, and its page also shows the numbers in a table.
 */
import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatGBP, formatGBPCompact, formatMonth, formatNumber } from '../format'

const SERIES = 'rgb(var(--chart-series))'
const GRID = 'rgb(var(--chart-grid))'
const AXIS = 'rgb(var(--chart-axis))'
const TICK = { fill: AXIS, fontSize: 12 }

/** Watches a media query, so charts can use narrower labels on phones. */
function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function ChartTooltip({ active, payload, label, title }: TooltipContentProps & { title?: (label: string) => string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { revenue: number; orders?: number }
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm shadow-raised">
      <p className="font-semibold text-ink">{title ? title(String(label)) : String(label)}</p>
      <p className="num text-ink-muted">
        Revenue <span className="font-semibold text-ink">{formatGBP(row.revenue)}</span>
      </p>
      {row.orders !== undefined && (
        <p className="num text-ink-muted">
          Orders <span className="font-semibold text-ink">{formatNumber(row.orders)}</span>
        </p>
      )}
    </div>
  )
}

function MonthTooltip(props: TooltipContentProps) {
  return <ChartTooltip {...props} title={formatMonth} />
}

export interface MonthlyDatum {
  month: string
  revenue: number
  orders: number
}

export function MonthlyRevenueChart({ data, height = 300 }: { data: MonthlyDatum[]; height?: number }) {
  const peak = data.reduce((best, d) => (d.revenue > best.revenue ? d : best), data[0])
  const summary = peak
    ? `Monthly revenue from ${formatMonth(data[0].month)} to ${formatMonth(data[data.length - 1].month)}. ` +
      `Highest month: ${formatMonth(peak.month)} with ${formatGBP(peak.revenue)}.`
    : 'No monthly data.'
  return (
    <figure className="m-0" data-testid="monthly-chart">
      <figcaption className="sr-only">{summary} The same figures are available as a table below the chart.</figcaption>
      <div aria-hidden="true" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height }}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={24}
            />
            <YAxis tickFormatter={formatGBPCompact} tick={TICK} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              cursor={{ stroke: AXIS, strokeWidth: 1 }}
              content={MonthTooltip}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.1}
              activeDot={{ r: 5, stroke: 'rgb(var(--surface))', strokeWidth: 2, fill: SERIES }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export interface BarDatum {
  label: string
  revenue: number
  orders?: number
}

/** Horizontal bars for rankings (top products, countries). */
export function RankingBarChart({ data, caption }: { data: BarDatum[]; caption: string }) {
  const narrow = useMediaQuery('(max-width: 640px)')
  const labelWidth = narrow ? 110 : 200
  const maxChars = narrow ? 14 : 28
  const height = Math.max(160, data.length * 34 + 32)
  const truncate = (text: string) => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text)
  return (
    <figure className="m-0" data-testid="ranking-chart">
      <figcaption className="sr-only">{caption} The same figures are listed in the table below.</figcaption>
      <div aria-hidden="true" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height }}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tickFormatter={formatGBPCompact} tick={TICK} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={labelWidth}
              tickFormatter={truncate}
              tick={{ ...TICK, fill: 'rgb(var(--ink-muted))' }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval={0}
            />
            <Tooltip cursor={{ fill: 'rgb(var(--surface-muted))' }} content={ChartTooltip} />
            <Bar dataKey="revenue" name="Revenue" fill={SERIES} maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
