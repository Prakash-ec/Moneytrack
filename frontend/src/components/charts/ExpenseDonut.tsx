import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { TypeBreakdown } from '@/types/api'
import { formatINR, formatINRCompact, formatPercent } from '@/utils/currency'

interface DonutDatum {
  name: string
  value: number
  color: string
  share: number
  typeId?: number
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DonutDatum }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-dropdown">
      <p className="flex items-center gap-2 text-xs font-semibold text-text">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </p>
      <p className="tabular mt-1 text-sm font-semibold text-text">{formatINR(item.value)}</p>
      <p className="text-[10px] text-muted">{formatPercent(item.share)}% of period spend</p>
    </div>
  )
}

export interface ExpenseDonutProps {
  items: TypeBreakdown[]
  totalPaise: number
  onSelect?: (typeId: number) => void
  showLegend?: boolean
}

export function ExpenseDonut({
  items,
  totalPaise,
  onSelect,
  showLegend = true,
}: ExpenseDonutProps) {
  const visible = items.slice(0, 5)
  const remaining = items.slice(5)
  const data: DonutDatum[] = visible.map((item) => ({
    name: item.name,
    value: item.total_paise,
    color: item.color || '#1d4ed8',
    share: item.share_percent,
    typeId: item.expense_type_id,
  }))

  if (remaining.length) {
    const remainingTotal = remaining.reduce((sum, item) => sum + item.total_paise, 0)
    data.push({
      name: `Other (${remaining.length})`,
      value: remainingTotal,
      color: '#94a3b8',
      share: totalPaise > 0 ? (remainingTotal * 100) / totalPaise : 0,
    })
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
      <div
        className="relative h-[160px] w-[160px] flex-shrink-0"
        role="img"
        aria-label="Donut chart of spending by expense type"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="64%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              animationDuration={600}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  className={entry.typeId && onSelect ? 'cursor-pointer outline-none' : undefined}
                  onClick={() => entry.typeId && onSelect?.(entry.typeId)}
                />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-sm font-bold text-text tabular">
            {formatINRCompact(totalPaise)}
          </strong>
          <span className="text-[10px] text-muted">Total</span>
        </div>
      </div>

      {showLegend && data.length > 0 && (
        <div className="grid gap-2.5 w-full max-w-[200px]">
          {data.map((entry) => (
            <div
              key={entry.name}
              className="grid grid-cols-[8px_1fr_auto] items-center gap-2 text-xs cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => entry.typeId && onSelect?.(entry.typeId)}
            >
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate text-text font-medium text-[11px]">{entry.name}</span>
              <strong className="text-text font-semibold text-[11px] tabular">
                {formatINRCompact(entry.value)}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
