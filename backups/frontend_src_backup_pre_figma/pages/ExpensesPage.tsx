import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Plus,
  ReceiptText,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { PageHeader } from '@/components/PageHeader'
import { PageHeader } from '@/components/PageHeader'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { TransactionList } from '@/components/TransactionList'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { Expense, SortOrder } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { CATEGORY_OPTIONS, PAYMENT_METHOD_OPTIONS } from '@/utils/typeOptions'

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Highest amount' },
  { value: 'amount_asc', label: 'Lowest amount' },
  { value: 'created_desc', label: 'Recently added' },
]

const VALID_SORTS = new Set(SORT_OPTIONS.map((option) => option.value))

export function ExpensesPage() {
  useDocumentTitle('Expenses')
  const period = usePeriod()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openCreate, openEdit, openScanReceipt } = useExpenseDialog()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)

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
        expense_type_id: typeId,
        category: category || undefined,
        payment_method: payment || undefined,
        min_amount: minPaise ?? undefined,
        max_amount: maxPaise ?? undefined,
        q: q || undefined,
        sort,
        page,
        page_size: 20,
      }),
  )

  const data = expensesQuery.data
  const hasFilters = Boolean(
    q || category || payment || typeId || minPaise !== null || maxPaise !== null ||
      sort !== 'date_desc' || period.preset !== 'month',
  )

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const removeParam = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete(key)
    next.delete('page')
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
      showToast({ title: 'Expense deleted', description: 'Your totals have been refreshed.' })
      invalidate()
      setDeleteTarget(null)
      if (page > 1 && data?.items.length === 1) goToPage(page - 1)
    } catch (error) {
      showToast({
        title: 'Could not delete expense',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  const activeFilterCount = [
    q,
    category,
    payment,
    typeId,
    minPaise !== null,
    maxPaise !== null,
    sort !== 'date_desc',
    period.preset !== 'month',
  ].filter(Boolean).length

  const presetLabel =
    (period.preset !== 'month' &&
      [
        { value: 'today', label: 'Today' },
        { value: 'week', label: 'This week' },
        { value: 'month', label: 'This month' },
        { value: 'last_month', label: 'Last month' },
        { value: 'last_30', label: 'Last 30 days' },
        { value: 'year', label: 'This year' },
        { value: 'custom', label: 'Custom range' },
      ].find((option) => option.value === period.preset)?.label) ||
    null

  const activeFilters: Array<{ label: string; onRemove: () => void }> = []
  if (q) {
    activeFilters.push({
      label: `Search: "${q}"`,
      onRemove: () => {
        setSearchInput('')
        removeParam('q')
      },
    })
  }
  if (category) {
    activeFilters.push({
      label: `Category: ${category}`,
      onRemove: () => {
        setCategory('')
        removeParam('category')
      },
    })
  }
  if (payment) {
    activeFilters.push({
      label: `Payment: ${payment}`,
      onRemove: () => updateParam('method', null),
    })
  }
  if (typeId) {
    const typeName = typesQuery.data?.items.find((type) => type.id === typeId)?.name
    activeFilters.push({
      label: `Type: ${typeName ?? typeId}`,
      onRemove: () => updateParam('type', null),
    })
  }
  if (minPaise !== null) {
    activeFilters.push({
      label: `Min ${formatINR(minPaise)}`,
      onRemove: () => {
        setMinAmount('')
        removeParam('min_amount')
      },
    })
  }
  if (maxPaise !== null) {
    activeFilters.push({
      label: `Max ${formatINR(maxPaise)}`,
      onRemove: () => {
        setMaxAmount('')
        removeParam('max_amount')
      },
    })
  }
  if (presetLabel) {
    activeFilters.push({
      label: `Date: ${presetLabel}`,
      onRemove: () => {
        const next = new URLSearchParams(searchParams)
        ;['period', 'start', 'end', 'page'].forEach((key) => next.delete(key))
        setSearchParams(next, { replace: true })
      },
    })
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Ledger"
        title="Expenses"
        description={
          data
            ? `${data.total.toLocaleString('en-IN')} ${
                data.total === 1 ? 'expense' : 'expenses'
              } in this period`
            : 'Search, filter, edit, and delete every recorded expense.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => openScanReceipt()}>
              <Camera className="h-4 w-4" aria-hidden />
              Scan receipt
            </Button>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" aria-hidden />
              Add expense
            </Button>
          </>
        }
      />

      <PeriodPicker
        preset={period.preset}
        range={period.range}
        onPresetChange={period.setPreset}
        onCustomChange={period.setCustomRange}
      />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
            <ListFilter className="h-3.5 w-3.5 text-primary" aria-hidden />
            Filters
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary">
                {activeFilterCount}
              </span>
            ) : null}
          </div>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {activeFilters.map((filter, index) => (
              <button
                key={index}
                type="button"
                onClick={filter.onRemove}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-elevated"
              >
                {filter.label}
                <X className="h-3 w-3" onClick={(event) => {
                  event.stopPropagation()
                  filter.onRemove()
                }} aria-hidden />
              </button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search notes, merchants, types…"
              className="pl-10"
              aria-label="Search expenses"
              enterKeyHint="search"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  removeParam('q')
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((categoryOption) => (
              <option key={categoryOption} value={categoryOption}>
                {categoryOption}
              </option>
            ))}
          </Select>
          <Select
            value={typeId ? String(typeId) : ''}
            onChange={(event) => updateParam('type', event.target.value || null)}
            aria-label="Filter by expense type"
          >
            <option value="">All expense types</option>
            {typesQuery.data?.items.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.is_archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
          <Select
            value={payment}
            onChange={(event) => updateParam('method', event.target.value || null)}
            aria-label="Filter by payment method"
          >
            <option value="">All payment methods</option>
            {PAYMENT_METHOD_OPTIONS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
          <Field
            label="Min amount"
            htmlFor="min-amount"
            error={amountError && minRaw ? amountError : undefined}
            optional
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-subtle">
                ₹
              </span>
              <Input
                id="min-amount"
                type="text"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
                placeholder="0.00"
                className="pl-8"
                aria-label="Minimum amount"
              />
            </div>
          </Field>
          <Field
            label="Max amount"
            htmlFor="max-amount"
            error={amountError && maxRaw ? amountError : undefined}
            optional
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-subtle">
                ₹
              </span>
              <Input
                id="max-amount"
                type="text"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
                placeholder="0.00"
                className="pl-8"
                aria-label="Maximum amount"
              />
            </div>
          </Field>
          <Select
            value={sort}
            onChange={(event) => updateParam('sort', event.target.value)}
            aria-label="Sort expenses"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-5 sm:px-6 sm:pt-5">
          <CardHeader
            title="Transaction history"
            description={`${formatDate(period.range.start)} – ${formatDate(period.range.end)}`}
          />
        </div>

        {expensesQuery.loading ? (
          <div className="divide-y divide-line" aria-busy="true" aria-label="Loading expenses">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-6 py-4">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : expensesQuery.error ? (
          <ErrorState
            description={expensesQuery.error.message}
            onRetry={expensesQuery.refetch}
            className="m-4"
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={hasFilters ? 'No expenses match these filters' : 'No expenses in this period'}
            description={
              hasFilters
                ? 'Try widening the date range or removing a filter.'
                : 'Add an expense to start building your transaction history.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-2 sm:flex-row">
                  <Button onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Add expense
                  </Button>
                  <Button variant="secondary" onClick={() => openScanReceipt()}>
                    <Camera className="h-4 w-4" aria-hidden />
                    Scan receipt
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <TransactionList
            expenses={data.items}
            onEdit={openEdit}
            onDelete={(expense) => setDeleteTarget(expense)}
          />
        )}

        {data && data.pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-elevated/40 px-6 py-4">
            <p className="text-xs text-muted">
              Page {data.page} of {data.pages} · {data.total.toLocaleString('en-IN')} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page >= data.pages}
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        loading={deleting}
        title="Delete this expense?"
        confirmLabel="Delete expense"
        description={
          deleteTarget ? (
            <>
              <strong className="font-semibold text-ink">{formatINR(deleteTarget.amount_paise)}</strong>{' '}
              for {deleteTarget.expense_type.name} on {formatDate(deleteTarget.expense_date)} will be
              permanently removed. Your totals and charts will update immediately. This cannot be
              undone.
            </>
          ) : null
        }
      />
    </div>
  )
}
