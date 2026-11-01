import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { TypeIcon } from '@/components/TypeIcon'
import type { TypeBreakdown } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { cn } from '@/utils/cn'

export function TypeBreakdownTable({
  items,
  periodSearch,
  className,
}: {
  items: TypeBreakdown[]
  periodSearch: string
  className?: string
}) {
  return (
    <div className={cn('divide-y divide-line', className)}>
      <div className="hidden grid-cols-[minmax(0,1.5fr)_5.5rem_6.5rem_7.5rem_8rem] items-center gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle md:grid">
        <span>Expense type</span>
        <span className="text-right">Transactions</span>
        <span className="text-right">Average</span>
        <span className="text-right">Total</span>
        <span>Share</span>
      </div>

      {items.map((item) => (
        <Link
          key={item.expense_type_id}
          to={`/expense-types/${item.expense_type_id}?${periodSearch}`}
          className="group block px-4 py-3.5 transition hover:bg-elevated/70 md:grid md:grid-cols-[minmax(0,1.5fr)_5.5rem_6.5rem_7.5rem_8rem] md:items-center md:gap-4"
          aria-label={`View ${item.name} details`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <TypeIcon icon={item.icon} color={item.color} size="sm" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                {item.is_archived ? <Badge tone="archive">Archived</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted md:hidden">
                {item.transaction_count} {item.transaction_count === 1 ? 'transaction' : 'transactions'}{' '}
                · avg {formatINR(item.average_paise)} · {formatPercent(item.share_percent)}%
              </p>
            </div>
          </div>

          <p className="tabular hidden text-right text-sm text-muted md:block">
            {item.transaction_count}
          </p>
          <p className="tabular hidden text-right text-sm text-muted md:block">
            {formatINR(item.average_paise)}
          </p>
          <p className="tabular mt-2 text-sm font-semibold text-ink md:mt-0 md:text-right">
            {formatINR(item.total_paise)}
          </p>

          <div className="mt-2 flex items-center gap-3 md:mt-0">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated md:w-full">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(item.share_percent, 1.5)}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
            <span className="tabular w-12 text-right text-xs font-medium text-muted md:hidden">
              {formatPercent(item.share_percent)}%
            </span>
            <span className="tabular hidden w-10 text-right text-xs font-medium text-muted md:block">
              {formatPercent(item.share_percent)}%
            </span>
            <ChevronRight
              className="hidden h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary md:block"
              aria-hidden
            />
          </div>
        </Link>
      ))}
    </div>
  )
}
