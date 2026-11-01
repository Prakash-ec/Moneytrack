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

const AXIS_COLOR = '#7A8B80'
const GRID_COLOR = '#7A8B80'

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
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const label =
    granularity === 'monthly'
      ? formatMonth(item.date)
      : granularity === 'weekly'
        ? `Week of ${formatDateShort(item.date)}`
        : formatDateShort(item.date)

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-sm font-semibold text-ink">{formatINR(item.total)}</p>
      <p className="text-xs text-subtle">
        {item.count} {item.count === 1 ? 'transaction' : 'transactions'}
      </p>
    </div>
  )
}

export function TrendChart({
  series,
  granularity,
  height = 260,
}: {
  series: TrendPoint[]
  granularity: Granularity
  height?: number
}) {
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const data: ChartDatum[] = series.map((point) => ({
    date: point.date,
    label:
      granularity === 'monthly' ? formatMonth(point.date) : formatDateShort(point.date),
    total: point.total_paise,
    count: point.transaction_count,
  }))

  const commonAxis = (
    <>
      <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeOpacity={0.16} strokeDasharray="3 6" />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        minTickGap={28}
        interval="preserveStartEnd"
        tick={{ fill: AXIS_COLOR, fontSize: 11 }}
        dy={8}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={58}
        tick={{ fill: AXIS_COLOR, fontSize: 11 }}
        tickFormatter={(value: number) => formatINRCompact(value)}
      />
      <Tooltip
        cursor={{ fill: GRID_COLOR, fillOpacity: 0.06 }}
        content={<TrendTooltip granularity={granularity} />}
      />
    </>
  )

  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Spending over time">
      <ResponsiveContainer width="100%" height="100%">
        {granularity === 'daily' ? (
          <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B5C45" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1B5C45" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            {commonAxis}
            <Area
              type="monotone"
              dataKey="total"
              name="Spending"
              stroke="#1B5C45"
              strokeWidth={2.25}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 4, strokeWidth: 0, fill: '#1B5C45' }}
              animationDuration={650}
            />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            {commonAxis}
            <Bar
              dataKey="total"
              name="Spending"
              fill="#1B5C45"
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              animationDuration={650}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
