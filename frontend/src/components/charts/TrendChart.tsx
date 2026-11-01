import { useId } from 'react'
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
} from 'recharts'

import type { Granularity, TrendPoint } from '@/types/api'
import { formatINR, formatINRCompact } from '@/utils/currency'
import { formatDateShort, formatMonth } from '@/utils/dates'

const AXIS_COLOR = '#94a3b8'
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const PRIMARY_BLUE = '#2563eb'
const DARK_BLUE_STROKE = '#1d4ed8'

interface ChartDatum {
  date: string
  label: string
  total: number
  count: number
}

function TrendTooltip({
  active,
  payload,
  granularity,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
  granularity: Granularity
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null
  const item = payload[0].payload
  const label =
    granularity === 'monthly'
      ? formatMonth(item.date)
      : granularity === 'weekly'
        ? `Week of ${formatDateShort(item.date)}`
        : formatDateShort(item.date)

  return (
    <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="tabular mt-1 text-base font-bold text-text font-display">{formatINR(item.total)}</p>
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span>
          {item.count} {item.count === 1 ? 'transaction' : 'transactions'}
        </span>
      </div>
    </div>
  )
}

export interface TrendChartProps {
  series: TrendPoint[]
  granularity: Granularity
  height?: number
  variant?: 'area' | 'bar'
}

export function TrendChart({
  series = [],
  granularity,
  height = 280,
  variant = 'area',
}: TrendChartProps) {
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const data: ChartDatum[] = (series || []).map((point) => ({
    date: point.date,
    label:
      granularity === 'monthly' ? formatMonth(point.date) : formatDateShort(point.date),
    total: point.total_paise || 0,
    count: point.transaction_count || 0,
  }))

  const maxTotal = Math.max(...data.map((d) => d.total), 0)
  const yDomain: [number, number | string] = maxTotal === 0 ? [0, 50000] : [0, 'auto']

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-6 text-center bg-[var(--surface-muted)]/20"
      >
        <p className="text-sm font-semibold text-text">No timeline data recorded</p>
        <p className="text-xs text-muted mt-1">Transactions in this period will automatically plot a spending curve.</p>
      </div>
    )
  }

  const commonAxis = (
    <>
      <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeDasharray="3 5" />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={{ stroke: GRID_COLOR }}
        minTickGap={32}
        interval="preserveStartEnd"
        tick={{ fill: AXIS_COLOR, fontSize: 11, fontWeight: 500 }}
        dy={8}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        domain={yDomain}
        width={56}
        tick={{ fill: AXIS_COLOR, fontSize: 11, fontWeight: 500 }}
        tickFormatter={(value: number) => (value === 0 ? '₹0' : formatINRCompact(value))}
      />
      <Tooltip
        cursor={{ stroke: PRIMARY_BLUE, strokeWidth: 1.5, strokeDasharray: '3 3', fill: 'rgba(37, 99, 235, 0.08)' }}
        content={<TrendTooltip granularity={granularity} />}
      />
    </>
  )

  return (
    <div
      style={{ height, minHeight: height }}
      className="w-full min-w-0 select-none relative"
      role="img"
      aria-label="Spending trend chart"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={height}>
        {variant === 'bar' ? (
          <BarChart data={data} margin={{ top: 14, right: 12, left: -4, bottom: 4 }}>
            {commonAxis}
            <Bar
              dataKey="total"
              name="Outflow"
              fill={PRIMARY_BLUE}
              radius={[6, 6, 0, 0]}
              maxBarSize={38}
              animationDuration={500}
            />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 14, right: 12, left: -4, bottom: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY_BLUE} stopOpacity={0.35} />
                <stop offset="65%" stopColor={DARK_BLUE_STROKE} stopOpacity={0.08} />
                <stop offset="100%" stopColor={DARK_BLUE_STROKE} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            {commonAxis}
            <Area
              type="monotone"
              dataKey="total"
              name="Outflow"
              stroke={DARK_BLUE_STROKE}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff', fill: PRIMARY_BLUE }}
              animationDuration={500}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
