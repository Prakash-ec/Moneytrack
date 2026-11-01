import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TypeBreakdown } from '@/types/api'
import { formatINR, formatINRCompact, formatPercent } from '@/utils/currency'

interface BarDatum {
  id: number
  name: string
  shortName: string
  total: number
  share: number
  color: string
}

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: BarDatum }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="flex items-center gap-2 text-xs font-semibold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </p>
      <p className="tabular mt-1 text-sm font-semibold text-ink">{formatINR(item.total)}</p>
      <p className="text-xs text-muted">{formatPercent(item.share)}% of period spend</p>
    </div>
  )
}

export function TypeBarChart({
  items,
  onSelect,
}: {
  items: TypeBreakdown[]
  onSelect?: (typeId: number) => void
}) {
  const data: BarDatum[] = items.slice(0, 8).map((item) => ({
    id: item.expense_type_id,
    name: item.name,
    shortName: item.name.length > 16 ? `${item.name.slice(0, 15)}…` : item.name,
    total: item.total_paise,
    share: item.share_percent,
    color: item.color,
  }))
  const height = Math.max(230, data.length * 46 + 50)

  return (
    <div
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Bar chart comparing spending by expense type"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
          barCategoryGap={10}
        >
          <CartesianGrid horizontal={false} stroke="#8CA39B" strokeOpacity={0.16} strokeDasharray="3 6" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#8CA39B', fontSize: 11 }}
            tickFormatter={(value: number) => formatINRCompact(value)}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#8CA39B', fontSize: 11 }}
          />
          <Tooltip cursor={{ fill: '#8CA39B', fillOpacity: 0.06 }} content={<BarTooltip />} />
          <Bar
            dataKey="total"
            radius={[0, 6, 6, 0]}
            maxBarSize={26}
            animationDuration={650}
            onClick={(entry) => {
              const datum = entry as unknown as BarDatum
              if (datum?.id) onSelect?.(datum.id)
            }}
          >
            {data.map((entry) => (
              <Cell
                key={entry.id}
                fill={entry.color}
                className={onSelect ? 'cursor-pointer' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
