import { Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { TypeIcon } from '@/components/TypeIcon'
import type { Expense } from '@/types/api'
import { formatINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'

export interface TransactionRowProps {
  expense: Expense
  onEdit?: (expense: Expense) => void
  onDelete?: (expense: Expense) => void
  hideDate?: boolean
}

export function TransactionRow({
  expense,
  onEdit,
  onDelete,
  hideDate = false,
}: TransactionRowProps) {
  const typeName = expense.expense_type?.name || 'Expense'
  const merchant = expense.merchant?.trim()
  const note = expense.note?.trim()

  return (
    <div className="transaction-row group">
      <div className="shrink-0">
        <TypeIcon
          icon={expense.expense_type?.icon ?? 'receipt'}
          color={expense.expense_type?.color ?? 'var(--primary)'}
          size="sm"
        />
      </div>

      <div className="transaction-main flex-1 min-w-0">
        {/* Primary line: ALWAYS the Expense Type name, never overridden by note */}
        <div className="flex items-center gap-2">
          <strong className="text-sm font-semibold text-[var(--text)] truncate">
            {typeName}
          </strong>
          {expense.expense_type?.is_archived && (
            <Badge tone="archive" className="text-[10px] px-1.5 py-0">
              Archived
            </Badge>
          )}
          {merchant && (
            <span className="hidden sm:inline-block text-xs font-medium text-[var(--muted)] truncate">
              · {merchant}
            </span>
          )}
        </div>

        {/* Secondary metadata: Date, Payment method, and Merchant on mobile */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] mt-0.5 truncate">
          {merchant && (
            <span className="sm:hidden font-medium text-[var(--text)]/80 truncate">
              {merchant} •
            </span>
          )}
          {!hideDate && <span>{formatDate(expense.expense_date)}</span>}
          {expense.payment_method && (
            <>
              {!hideDate && <span>•</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-raised text-muted border border-border font-medium">
                {expense.payment_method}
              </span>
            </>
          )}
        </div>

        {/* Explicit Note section: Clearly differentiated so note is never confused with Expense Type */}
        {note && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] mt-1 truncate">
            <span className="shrink-0 text-[10px] font-medium text-muted bg-surface-raised px-1.5 py-0.5 rounded-md border border-border">
              Note
            </span>
            <span className="truncate text-text/80 font-normal">
              {note}
            </span>
          </div>
        )}
      </div>

      {/* Right side: Tabular currency amount and action buttons */}
      <div className="shrink-0 text-right flex items-center gap-2 sm:gap-3">
        <span className="transaction-amount font-mono tabular-nums text-sm font-semibold text-text">
          {formatINR(expense.amount_paise)}
        </span>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-0.5">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(expense)}
                className="button button-ghost button-icon h-7 w-7 text-muted hover:text-text"
                title={`Edit ${typeName} expense`}
                aria-label={`Edit ${typeName} expense`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(expense)}
                className="button button-ghost button-icon h-7 w-7 text-muted hover:text-danger"
                title={`Delete ${typeName} expense`}
                aria-label={`Delete ${typeName} expense`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
