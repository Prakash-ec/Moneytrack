import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { TypeBreakdown } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'

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
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="flex items-center gap-2 text-xs font-semibold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </p>
      <p className="tabular mt-1 text-sm font-semibold text-ink">{formatINR(item.value)}</p>
      <p className="text-xs text-muted">{formatPercent(item.share)}% of period spend</p>
    </div>
  )
}

export function ExpenseDonut({
  items,
  totalPaise,
  onSelect,
}: {
  items: TypeBreakdown[]
  totalPaise: number
  onSelect?: (typeId: number) => void
}) {
  const visible = items.slice(0, 6)
  const remaining = items.slice(6)
  const data: DonutDatum[] = visible.map((item) => ({
    name: item.name,
    value: item.total_paise,
    color: item.color,
    share: item.share_percent,
    typeId: item.expense_type_id,
  }))

  if (remaining.length) {
    const remainingTotal = remaining.reduce((sum, item) => sum + item.total_paise, 0)
    data.push({
      name: `Other types (${remaining.length})`,
      value: remainingTotal,
      color: '#94A3B8',
      share: totalPaise > 0 ? (remainingTotal * 100) / totalPaise : 0,
    })
  }

  return (
    <div
      className="relative h-[250px] w-full sm:h-[280px]"
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
            innerRadius="63%"
            outerRadius="88%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
            animationDuration={650}
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
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
          Total spent
        </span>
        <span className="tabular mt-1 max-w-[55%] text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {formatINR(totalPaise)}
        </span>
        <span className="mt-0.5 text-[11px] text-muted">
          {items.length} {items.length === 1 ? 'type' : 'types'}
        </span>
      </div>
    </div>
  )
}
