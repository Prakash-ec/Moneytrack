import {
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
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
import { cn } from '@/utils/cn'
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

function selectClass() {
  return 'h-9 max-w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20'
}

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
  const [showFilters, setShowFilters] = useState(false)

  const q = searchParams.get('q') ?? ''
  const typeParam = searchParams.get('type')
  const typeId = typeParam && /^\d+$/.test(typeParam) ? Number(typeParam) : undefined
  const payment = searchParams.get('method') ?? ''
  const category = searchParams.get('category') ?? ''
  const sortParam = searchParams.get('sort')
  const sort: SortOrder =
    sortParam && VALID_SORTS.has(sortParam as SortOrder) ? (sortParam as SortOrder) : 'date_desc'
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const [minAmount, setMinAmount] = useState(searchParams.get('min_amount') ?? '')
  const [maxAmount, setMaxAmount] = useState(searchParams.get('max_amount') ?? '')
  const debouncedMin = useDebouncedValue(minAmount, 350)
  const debouncedMax = useDebouncedValue(maxAmount, 350)

  const minPaise = debouncedMin.trim() ? parseRupeesToPaise(debouncedMin) : null
  const maxPaise = debouncedMax.trim() ? parseRupeesToPaise(debouncedMax) : null
  const amountError =
    debouncedMin.trim() && minPaise === null
      ? 'Enter a valid minimum amount.'
      : debouncedMax.trim() && maxPaise === null
        ? 'Enter a valid maximum amount.'
        : minPaise !== null && maxPaise !== null && minPaise > maxPaise
          ? 'Minimum cannot be greater than maximum.'
          : null

  useEffect(() => {
    setSearchInput(q)
  }, [q])

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
    const nextMin = debouncedMin.trim()
    const nextMax = debouncedMax.trim()
    if (nextMin === (searchParams.get('min_amount') ?? '') && nextMax === (searchParams.get('max_amount') ?? '')) {
      return
    }
    const next = new URLSearchParams(searchParams)
    if (nextMin) next.set('min_amount', nextMin)
    else next.delete('min_amount')
    if (nextMax) next.set('max_amount', nextMax)
    else next.delete('max_amount')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }, [debouncedMin, debouncedMax, amountError, searchParams, setSearchParams])

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams)
    ;['q', 'type', 'method', 'category', 'min_amount', 'max_amount', 'sort', 'page', 'period', 'start', 'end'].forEach(
      (key) => next.delete(key),
    )
    setSearchParams(next, { replace: true })
    setSearchInput('')
    setMinAmount('')
    setMaxAmount('')
  }

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

  const summaryQuery = useApiQuery(['expenses-summary', period.range.start, period.range.end], () =>
    api.analyticsSummary({ start_date: period.range.start, end_date: period.range.end }),
  )

  const data = expensesQuery.data
  const hasFilters = Boolean(
    q ||
      category ||
      payment ||
      typeId ||
      minPaise !== null ||
      maxPaise !== null ||
      sort !== 'date_desc' ||
      period.preset !== 'month',
  )

  const groupedExpenses = useMemo(() => {
    if (!data?.items?.length) return []
    const groups = new Map<string, { subtotal: number; items: Expense[] }>()
    for (const expense of data.items) {
      const existing = groups.get(expense.expense_date)
      if (existing) {
        existing.subtotal += expense.amount_paise
        existing.items.push(expense)
      } else {
        groups.set(expense.expense_date, { subtotal: expense.amount_paise, items: [expense] })
      }
    }
    return Array.from(groups.entries()).map(([date, value]) => ({
      date,
      label: formatDate(date),
      subtotalPaise: value.subtotal,
      items: value.items,
    }))
  }, [data?.items])

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
        description: `${formatINR(deleteTarget.amount_paise)} was removed from your ledger.`,
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

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      await downloadExport('csv')
      showToast({ title: 'Export ready', description: 'Your expenses CSV was downloaded.' })
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

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8'}>
      {!embedded ? (
        <PageHeader
          eyebrow="Transactions"
          title="Expenses"
          description="Every outflow, exact to the paise."
          actions={
            <>
              <Button variant="secondary" onClick={handleExportCsv} disabled={exporting} className="hidden sm:inline-flex">
                <Download className="h-4 w-4" aria-hidden="true" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
              <Button variant="secondary" onClick={() => openScanReceipt()}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Scan</span>
              </Button>
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add expense
              </Button>
            </>
          }
        />
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search merchant, note or amount"
              aria-label="Search expenses"
              className="h-full w-full min-w-0 bg-transparent text-xs text-text outline-none placeholder:text-muted"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
                className="text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </label>

          {!embedded ? (
            <PeriodPicker
              preset={period.preset}
              range={period.range}
              onPresetChange={period.setPreset}
              onCustomChange={period.setCustomRange}
            />
          ) : null}

          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
              showFilters || hasFilters
                ? 'border-primary-border bg-primary-soft text-primary'
                : 'border-border bg-surface text-muted hover:text-text',
            )}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Filters
            {hasFilters ? (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            ) : null}
          </button>

          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="block text-[10px] font-medium text-muted">Expense type</span>
              <select
                value={typeId ? String(typeId) : ''}
                onChange={(event) => updateParam('type', event.target.value || null)}
                className={cn(selectClass(), 'w-full')}
              >
                <option value="">All types</option>
                {typesQuery.data?.items?.map((type) => (
                  <option key={type.id} value={String(type.id)}>
                    {type.name}
                    {type.is_archived ? ' (Archived)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-medium text-muted">Payment method</span>
              <select
                value={payment}
                onChange={(event) => updateParam('method', event.target.value || null)}
                className={cn(selectClass(), 'w-full')}
              >
                <option value="">All methods</option>
                {PAYMENT_METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-medium text-muted">Minimum ₹</span>
              <input
                type="text"
                inputMode="decimal"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
                placeholder="0"
                className={cn(selectClass(), 'w-full')}
                aria-invalid={Boolean(amountError) || undefined}
              />
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-medium text-muted">Maximum ₹</span>
              <input
                type="text"
                inputMode="decimal"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
                placeholder="No limit"
                className={cn(selectClass(), 'w-full')}
                aria-invalid={Boolean(amountError) || undefined}
              />
            </label>

            <label className="space-y-1 sm:col-span-2 lg:col-span-1">
              <span className="block text-[10px] font-medium text-muted">Sort</span>
              <select
                value={sort}
                onChange={(event) => updateParam('sort', event.target.value)}
                className={cn(selectClass(), 'w-full')}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {amountError ? <p className="mt-2 text-[11px] font-medium text-danger">{amountError}</p> : null}
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="text-[11px] font-medium text-muted">
            {expensesQuery.loading && !data
              ? 'Loading transactions…'
              : `${data?.total ?? 0} ${data?.total === 1 ? 'transaction' : 'transactions'}${
                  hasFilters ? ' matching filters' : ''
                }`}
          </span>
          {hasFilters ? (
            <span className="text-[11px] text-muted">Filtered view</span>
          ) : (
            <strong className="font-mono text-[11px] font-semibold tabular-nums text-text">
              Total {formatINR(summaryQuery.data?.total_paise ?? 0)}
            </strong>
          )}
        </div>

        {expensesQuery.loading && !data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : expensesQuery.error ? (
          <div className="p-5">
            <ErrorState
              title="Could not load expenses"
              description={expensesQuery.error.message}
              onRetry={() => expensesQuery.refetch()}
            />
          </div>
        ) : groupedExpenses.length > 0 ? (
          <div>
            {groupedExpenses.map((group) => (
              <div key={group.date} className="border-b border-border last:border-b-0">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2 sm:px-5">
                  <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-text">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="truncate">{group.label}</span>
                    <span className="font-normal text-muted">{group.items.length}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-text">
                    {formatINR(group.subtotalPaise)}
                  </span>
                </div>
                {group.items.map((expense) => (
                  <TransactionRow
                    key={expense.id}
                    expense={expense}
                    onEdit={openEdit}
                    onDelete={(item) => setDeleteTarget(item)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={Receipt}
              title={hasFilters ? 'No matching expenses' : 'No expenses recorded'}
              description={
                hasFilters
                  ? 'No transactions matched this search and date range. Clear the filters to see everything.'
                  : 'Nothing has been recorded for this period. Add an expense or change the date range.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add expense
                  </Button>
                )
              }
            />
          </div>
        )}

        {data && data.pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-muted">
            <span>
              Page {data.page} of {data.pages}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={data.page >= data.pages} onClick={() => goToPage(data.page + 1)}>
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete expense"
        description={`Delete ${deleteTarget ? formatINR(deleteTarget.amount_paise) : 'this expense'}? The ledger balance will be recalculated. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
