import {
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Receipt,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { TransactionRow } from '@/components/TransactionRow'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api, downloadExport } from '@/services/api'
import type { Expense, SortOrder } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { PAYMENT_METHOD_OPTIONS } from '@/utils/typeOptions'

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
  { value: 'created_desc', label: 'Recently added' },
]

const VALID_SORTS = new Set(SORT_OPTIONS.map((option) => option.value))

export function ExpensesPage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle('Expenses')
  const period = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openCreate, openEdit, openScanReceipt } = useExpenseDialog()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      await downloadExport('csv')
      showToast({
        title: 'Export successful',
        description: 'Your expenses CSV file was downloaded.',
      })
    } catch (err) {
      showToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not export expenses.',
        variant: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  const q = searchParams.get('q') ?? ''
  const typeParam = searchParams.get('type')
  const typeId = typeParam && /^\d+$/.test(typeParam) ? Number(typeParam) : undefined
  const payment = searchParams.get('method') ?? ''
  const sortParam = searchParams.get('sort')
  const sort: SortOrder =
    sortParam && VALID_SORTS.has(sortParam as SortOrder) ? (sortParam as SortOrder) : 'date_desc'
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  const [minAmount, setMinAmount] = useState(searchParams.get('min_amount') ?? '')
  const [maxAmount, setMaxAmount] = useState(searchParams.get('max_amount') ?? '')
  const [category, setCategory] = useState(searchParams.get('category') ?? '')

  const debouncedMin = useDebouncedValue(minAmount, 300)
  const debouncedMax = useDebouncedValue(maxAmount, 300)

  const minRaw = debouncedMin.trim()
  const maxRaw = debouncedMax.trim()
  let minPaise: number | null = null
  let maxPaise: number | null = null
  let amountError: string | null = null
  if (minRaw) {
    const v = parseRupeesToPaise(minRaw)
    if (v === null) amountError = 'Enter a valid minimum amount.'
    else minPaise = v
  }
  if (maxRaw) {
    const v = parseRupeesToPaise(maxRaw)
    if (v === null) amountError = 'Enter a valid maximum amount.'
    else maxPaise = v
  }
  if (!amountError && minPaise !== null && maxPaise !== null && minPaise > maxPaise) {
    amountError = 'Minimum amount cannot be greater than maximum amount.'
  }

  useEffect(() => {
    setSearchInput(q)
  }, [q])
  useEffect(() => {
    setMinAmount(searchParams.get('min_amount') ?? '')
  }, [searchParams.get('min_amount')])
  useEffect(() => {
    setMaxAmount(searchParams.get('max_amount') ?? '')
  }, [searchParams.get('max_amount')])
  useEffect(() => {
    setCategory(searchParams.get('category') ?? '')
  }, [searchParams.get('category')])

  useEffect(() => {
    const trimmed = debouncedSearch.trim()
    if (trimmed === q) return
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set('q', trimmed)
    else next.delete('q')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [debouncedSearch, q, searchParams, setSearchParams])

  useEffect(() => {
    if (amountError) return
    const next = new URLSearchParams(searchParams)
    if (minPaise !== null) next.set('min_amount', String(minPaise))
    else next.delete('min_amount')
    if (maxPaise !== null) next.set('max_amount', String(maxPaise))
    else next.delete('max_amount')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [debouncedMin, debouncedMax, amountError, minPaise, maxPaise, searchParams, setSearchParams])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (category) next.set('category', category)
    else next.delete('category')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [category, searchParams, setSearchParams])

  const typesQuery = useApiQuery(['expense-types', 'filter'], () =>
    api.listExpenseTypes({ archived: 'include', page_size: 200 }),
  )

  const expensesQuery = useApiQuery(
    [
      'expenses',
      period.range.start,
      period.range.end,
      q,
      typeId,
      category,
      payment,
      minPaise,
      maxPaise,
      sort,
      page,
    ],
    () =>
      api.listExpenses({
        start_date: period.range.start,
        end_date: period.range.end,
        q: q || undefined,
        expense_type_id: typeId,
        category: category || undefined,
        payment_method: payment || undefined,
        min_amount: minPaise ?? undefined,
        max_amount: maxPaise ?? undefined,
        sort,
        page,
        page_size: 15,
      }),
  )

  const summaryQuery = useApiQuery(
    ['expenses-summary', period.range.start, period.range.end],
    () => api.analyticsSummary({ start_date: period.range.start, end_date: period.range.end }),
  )

  const data = expensesQuery.data
  const hasFilters = Boolean(
    q || category || payment || typeId || minPaise !== null || maxPaise !== null ||
      sort !== 'date_desc' || period.preset !== 'month',
  )

  const groupedExpenses = useMemo(() => {
    if (!data?.items?.length) return []
    const groupsMap = new Map<string, { subtotal: number; items: Expense[] }>()
    for (const exp of data.items) {
      const existing = groupsMap.get(exp.expense_date)
      if (existing) {
        existing.subtotal += exp.amount_paise
        existing.items.push(exp)
      } else {
        groupsMap.set(exp.expense_date, {
          subtotal: exp.amount_paise,
          items: [exp],
        })
      }
    }

    return Array.from(groupsMap.entries()).map(([date, val]) => ({
      date,
      label: formatDate(date),
      subtotalPaise: val.subtotal,
      items: val.items,
    }))
  }, [data?.items])

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams)
    ;[
      'q',
      'type',
      'method',
      'category',
      'min_amount',
      'max_amount',
      'sort',
      'page',
      'period',
      'start',
      'end',
    ].forEach((key) => next.delete(key))
    setSearchParams(next, { replace: true })
    setSearchInput('')
    setMinAmount('')
    setMaxAmount('')
    setCategory('')
  }

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteExpense(deleteTarget.id)
      showToast({
        title: 'Expense deleted',
        description: `${formatINR(deleteTarget.amount_paise)} was removed.`,
      })
      setDeleteTarget(null)
      invalidate()
    } catch (err) {
      showToast({
        title: 'Could not delete expense',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={embedded ? '' : 'page'}>
      {!embedded && (
        <PageHeader
          eyebrow="Transactions"
          title="Expenses"
          description="Search, review, and manage your transactions."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleExportCsv}
                disabled={exporting}
                className="hidden sm:inline-flex"
                title="Download expenses as CSV spreadsheet"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
              </Button>
              <Button variant="secondary" onClick={() => openScanReceipt()}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span>Scan receipt</span>
              </Button>
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add expense</span>
              </Button>
            </div>
          }
        />
      )}

      <div className="filter-bar">
        <label className="search-field">
          <Search className="h-4 w-4 text-muted flex-shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search transactions…"
            aria-label="Search transactions"
          />
        </label>

        <PeriodPicker
          preset={period.preset}
          range={period.range}
          onPresetChange={period.setPreset}
          onCustomChange={period.setCustomRange}
        />

        <select
          value={typeId ? String(typeId) : ''}
          onChange={(e) => updateParam('type', e.target.value || null)}
          className="period-picker text-base sm:text-xs bg-surface cursor-pointer"
          aria-label="Filter by expense type"
        >
          <option value="">All expense types</option>
          {typesQuery.data?.items?.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name} {t.is_archived ? '(Archived)' : ''}
            </option>
          ))}
        </select>

        <select
          value={payment}
          onChange={(e) => updateParam('method', e.target.value || null)}
          className="period-picker text-base sm:text-xs bg-surface cursor-pointer"
          aria-label="Filter by payment method"
        >
          <option value="">All payment methods</option>
          {PAYMENT_METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="period-picker text-base sm:text-xs bg-surface cursor-pointer"
          aria-label="Sort order"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="button button-ghost button-sm text-muted hover:text-text flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      <section className="card expense-table mt-4">
        <div className="table-summary">
          <span>
            {expensesQuery.loading && !data ? (
              'Loading transactions…'
            ) : (
              `${data?.total ?? 0} ${data?.total === 1 ? 'transaction' : 'transactions'}`
            )}
          </span>
          <strong>Total: {formatINR(summaryQuery.data?.total_paise ?? 0)}</strong>
        </div>

        {expensesQuery.loading && !data ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : expensesQuery.error ? (
          <div className="p-6">
            <ErrorState
              title="Could not load expenses"
              description={typeof expensesQuery.error === 'string' ? expensesQuery.error : expensesQuery.error instanceof Error ? expensesQuery.error.message : 'Unknown error'}
              onRetry={() => expensesQuery.refetch()}
            />
          </div>
        ) : groupedExpenses.length > 0 ? (
          <div>
            {groupedExpenses.map((group) => (
              <div key={group.date} className="border-b border-border last:border-b-0">
                <div className="bg-surface-muted/70 px-4 sm:px-5 py-2.5 flex items-center justify-between border-b border-border/60">
                  <span className="flex items-center gap-2 text-xs font-semibold text-text">
                    <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>{group.label}</span>
                    <span className="text-[11px] font-normal text-muted">
                      ({group.items.length} {group.items.length === 1 ? 'item' : 'items'})
                    </span>
                  </span>
                  <span className="text-xs font-bold text-text font-mono">
                    {formatINR(group.subtotalPaise)}
                  </span>
                </div>

                <div>
                  {group.items.map((expense) => (
                    <TransactionRow
                      key={expense.id}
                      expense={expense}
                      onEdit={openEdit}
                      onDelete={(item) => setDeleteTarget(item)}
                      hideDate={false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <EmptyState
              icon={Receipt}
              title={hasFilters ? 'No matching expenses' : 'No expenses recorded'}
              description={
                hasFilters
                  ? 'No transactions matched your search or filters. Try adjusting your query or date range.'
                  : "You don't have any expenses recorded for this period."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>Add expense</span>
                  </Button>
                )
              }
            />
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="pagination">
            <span>
              Page {data.page} of {data.pages}
            </span>
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => goToPage(data.page - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Previous</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={data.page >= data.pages}
                onClick={() => goToPage(data.page + 1)}
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete expense"
        description={`Are you sure you want to delete ${deleteTarget ? formatINR(deleteTarget.amount_paise) : 'this expense'}? This action cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
