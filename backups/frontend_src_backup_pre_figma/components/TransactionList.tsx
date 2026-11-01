import { Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { TypeIcon } from '@/components/TypeIcon'
import type { Expense } from '@/types/api'
import { formatINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'

interface TransactionListProps {
  expenses: Expense[]
  onEdit?: (expense: Expense) => void
  onDelete?: (expense: Expense) => void
}

export function TransactionList({ expenses, onEdit, onDelete }: TransactionListProps) {
  return (
    <div className="divide-y divide-line">
      {expenses.map((expense) => {
        const meta = [formatDate(expense.expense_date), expense.payment_method, expense.merchant]
          .filter(Boolean)
          .join(' · ')

        return (
          <div
            key={expense.id}
            className="flex items-start gap-2 px-3 py-3.5 transition hover:bg-elevated/50 sm:gap-3 sm:px-5"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left focus-visible:outline-offset-4"
              onClick={() => onEdit?.(expense)}
              disabled={!onEdit}
              aria-label={onEdit ? `Edit ${expense.expense_type.name} expense` : undefined}
            >
              <TypeIcon icon={expense.expense_type.icon} color={expense.expense_type.color} size="sm" />
              <span className="min-w-0 flex-1 py-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-semibold text-ink">
                    {expense.expense_type.name}
                  </span>
                  {expense.expense_type.is_archived ? (
                    <Badge tone="archive">Archived</Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span>
                {expense.note ? (
                  <span className="mt-0.5 block truncate text-xs italic text-subtle">
                    {expense.note}
                  </span>
                ) : null}
              </span>
              <span className="tabular shrink-0 pt-0.5 text-sm font-semibold text-ink sm:hidden">
                {formatINR(expense.amount_paise)}
              </span>
            </button>

            <div className="tabular hidden w-28 shrink-0 pt-1 text-right sm:block">
              <p className="text-sm font-semibold text-ink">{formatINR(expense.amount_paise)}</p>
              <p className="mt-0.5 text-xs text-subtle">{formatDate(expense.expense_date)}</p>
            </div>

            {onEdit || onDelete ? (
              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(expense)}
                    className="rounded-lg p-2 text-subtle transition hover:bg-surface hover:text-primary"
                    aria-label={`Edit ${expense.expense_type.name} expense`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(expense)}
                    className="rounded-lg p-2 text-subtle transition hover:bg-danger/10 hover:text-danger"
                    aria-label={`Delete ${expense.expense_type.name} expense`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
