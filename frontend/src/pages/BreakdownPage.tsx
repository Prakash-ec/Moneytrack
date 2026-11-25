import {
  ArrowRight,
  Banknote,
  Building2,
  CreditCard,
  Layers,
  PieChart,
  Plus,
  Receipt,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { ExpenseDonut } from '@/components/charts/ExpenseDonut'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { Expense } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatRangeLabel, type PeriodPreset } from '@/utils/periods'

type BreakdownTab = 'categories' | 'payments' | 'merchants'

const PAYMENT_METHOD_META: Record<
  string,
  { label: string; icon: typeof Smartphone; color: string }
> = {
  upi: { label: 'UPI / QR', icon: Smartphone, color: 'var(--chart-1)' },
  card: { label: 'Card', icon: CreditCard, color: 'var(--chart-2)' },
  cash: { label: 'Cash', icon: Banknote, color: 'var(--chart-3)' },
  netbanking: { label: 'Net banking / IMPS', icon: Building2, color: 'var(--chart-5)' },
  other: { label: 'Other', icon: Wallet, color: 'var(--muted-2)' },
}

const QUICK_PRESETS: Array<{ label: string; preset: PeriodPreset }> = [
  { label: 'This month', preset: 'month' },
  { label: 'Last 30 days', preset: 'last_30' },
  { label: 'This year', preset: 'year' },
]

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Wallet
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <p className="mt-1.5 truncate font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em] text-text">
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-muted">{hint}</p>
    </Panel>
  )
}

export function BreakdownPage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle('Spending Breakdown')
  const period = usePeriod()
  const navigate = useNavigate()
  const { openCreate } = useExpenseDialog()
  const { start, end } = period.range
  const [activeTab, setActiveTab] = useState<BreakdownTab>('categories')
  const [categorySort, setCategorySort] = useState<'amount' | 'count' | 'name'>('amount')

  const summaryQuery = useApiQuery(['summary', start, end], () =>
    api.analyticsSummary({ start_date: start, end_date: end }),
  )
  const byTypeQuery = useApiQuery(['by-type', start, end], () =>
    api.analyticsByType({ start_date: start, end_date: end }),
  )
  const expensesQuery = useApiQuery(['expenses-breakdown', start, end], () =>
    api.listExpenses({ start_date: start, end_date: end, page_size: 100 }),
  )

  const summary = summaryQuery.data
  const rawItems = byTypeQuery.data?.items ?? []
  const expenses: Expense[] = expensesQuery.data?.items ?? []

  const loading =
    (summaryQuery.loading && !summary) || (byTypeQuery.loading && !byTypeQuery.data)
  const error = summaryQuery.error ?? byTypeQuery.error
  const hasExpenses = Boolean(
    (summary && summary.transaction_count > 0) || rawItems.length > 0 || expenses.length > 0,
  )

  const sortedCategories = useMemo(() => {
    const list = [...rawItems]
    if (categorySort === 'amount') return list.sort((a, b) => b.total_paise - a.total_paise)
    if (categorySort === 'count') {
      return list.sort((a, b) => b.transaction_count - a.transaction_count)
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [rawItems, categorySort])

  const topType = sortedCategories[0]

  const paymentMethodStats = useMemo(() => {
    if (!expenses.length) return []
    const methodTotals: Record<string, { total: number; count: number }> = {}
    let grandTotal = 0

    for (const exp of expenses) {
      const method = (exp.payment_method || 'other').toLowerCase()
      if (!methodTotals[method]) methodTotals[method] = { total: 0, count: 0 }
      methodTotals[method].total += exp.amount_paise
      methodTotals[method].count += 1
      grandTotal += exp.amount_paise
    }

    return Object.entries(methodTotals)
      .map(([method, data]) => ({
        method,
        label: PAYMENT_METHOD_META[method]?.label || method,
        icon: PAYMENT_METHOD_META[method]?.icon || Wallet,
        color: PAYMENT_METHOD_META[method]?.color || 'var(--muted-2)',
        total: data.total,
        count: data.count,
        share: grandTotal > 0 ? (data.total * 100) / grandTotal : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  const merchantStats = useMemo(() => {
    if (!expenses.length) return []
    const merchantTotals: Record<string, { total: number; count: number }> = {}
    let grandTotal = 0

    for (const exp of expenses) {
      const merchant = (exp.merchant && exp.merchant.trim()) || 'No merchant recorded'
      if (!merchantTotals[merchant]) merchantTotals[merchant] = { total: 0, count: 0 }
      merchantTotals[merchant].total += exp.amount_paise
      merchantTotals[merchant].count += 1
      grandTotal += exp.amount_paise
    }

    return Object.entries(merchantTotals)
      .map(([merchant, data]) => ({
        merchant,
        total: data.total,
        count: data.count,
        share: grandTotal > 0 ? (data.total * 100) / grandTotal : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [expenses])

  const content = (() => {
    if (loading) return <PageSkeleton />

    if (error) {
      return (
        <ErrorState
          title="Could not load the breakdown"
          description={
            error instanceof Error ? error.message : 'The analytics request failed.'
          }
          onRetry={() => {
            summaryQuery.refetch()
            byTypeQuery.refetch()
            expensesQuery.refetch()
          }}
        />
      )
    }

    return (
      <>
        {!embedded ? (
          <PageHeader
            eyebrow="Analytics"
            title="Spending breakdown"
            description={`${formatRangeLabel(period.range)} · Categories, payment modes and merchants`}
            actions={
              <>
                <PeriodPicker
                  preset={period.preset}
                  range={period.range}
                  onPresetChange={period.setPreset}
                  onCustomChange={period.setCustomRange}
                />
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add expense
                </Button>
              </>
            }
          />
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted">Range</span>
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.preset}
              type="button"
              onClick={() => period.setPreset(preset.preset)}
              aria-pressed={period.preset === preset.preset}
              className={cn(
                'h-8 rounded-full border px-3 text-[11px] font-medium transition-colors',
                period.preset === preset.preset
                  ? 'border-primary-border bg-primary-soft text-primary'
                  : 'border-border bg-surface text-muted hover:text-text',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {hasExpenses ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Spent"
                value={formatINR(summary?.total_paise ?? 0)}
                hint={`${summary?.transaction_count ?? expenses.length} transactions`}
                icon={Wallet}
              />
              <Metric
                label="Average ticket"
                value={formatINR(summary?.average_paise ?? 0)}
                hint="Per transaction"
                icon={Receipt}
              />
              <Metric
                label="Largest category"
                value={topType ? topType.name : 'None'}
                hint={topType ? `${formatPercent(topType.share_percent)}% of spend` : 'No spend'}
                icon={PieChart}
              />
              <Metric
                label="Active categories"
                value={String(rawItems.length)}
                hint="In this period"
                icon={Layers}
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-12">
              <Panel className="lg:col-span-7">
                <PanelHeader
                  title="Category share"
                  description={formatRangeLabel(period.range)}
                />
                <div className="px-3 py-4 sm:px-5">
                  <ExpenseDonut
                    items={sortedCategories}
                    totalPaise={summary?.total_paise ?? 0}
                    onSelect={(typeId) => navigate(`/expense-types/${typeId}`)}
                  />
                </div>
              </Panel>

              <Panel className="lg:col-span-5">
                <PanelHeader title="Largest category" description="Where most of the outflow sits" />
                <div className="p-5">
                  {topType ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-text">
                            {topType.name}
                          </p>
                          <p className="mt-1 text-[12px] text-muted">
                            {formatINR(topType.total_paise)} across {topType.transaction_count}{' '}
                            transaction{topType.transaction_count === 1 ? '' : 's'}
                          </p>
                        </div>
                        <Badge tone={topType.share_percent > 40 ? 'warning' : 'neutral'}>
                          {formatPercent(topType.share_percent)}%
                        </Badge>
                      </div>

                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(2, Math.min(100, topType.share_percent))}%` }}
                        />
                      </div>

                      <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-[12px]">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted">Average per transaction</dt>
                          <dd className="font-mono tabular-nums text-text">
                            {formatINR(topType.average_paise)}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted">Share of all spending</dt>
                          <dd className="font-mono tabular-nums text-text">
                            {formatPercent(topType.share_percent)}%
                          </dd>
                        </div>
                      </dl>

                      <button
                        type="button"
                        onClick={() => navigate(`/expense-types/${topType.expense_type_id}`)}
                        className="mt-5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                      >
                        Open category history
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <p className="text-[12px] leading-5 text-muted">
                      No category has recorded spending in this range.
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="grid w-full grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1 sm:w-auto"
                role="tablist"
                aria-label="Breakdown view"
              >
                {(
                  [
                    ['categories', 'Categories', sortedCategories.length],
                    ['payments', 'Payment modes', paymentMethodStats.length],
                    ['merchants', 'Merchants', merchantStats.length],
                  ] as Array<[BreakdownTab, string, number]>
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                      activeTab === id
                        ? 'bg-surface-raised text-text shadow-sm'
                        : 'text-muted hover:text-text',
                    )}
                  >
                    {label}
                    <span className="font-mono text-[10px] text-muted">{count}</span>
                  </button>
                ))}
              </div>

              {activeTab === 'categories' ? (
                <div className="flex items-center gap-1 text-[11px] text-muted">
                  <span>Sort</span>
                  {(['amount', 'count', 'name'] as const).map((sort) => (
                    <button
                      key={sort}
                      type="button"
                      onClick={() => setCategorySort(sort)}
                      aria-pressed={categorySort === sort}
                      className={cn(
                        'rounded-md px-2 py-1 font-medium capitalize transition-colors',
                        categorySort === sort
                          ? 'bg-primary-soft text-primary'
                          : 'hover:text-text',
                      )}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {activeTab === 'categories' ? (
              <Panel className="mt-3 overflow-hidden">
                <PanelHeader
                  title="Categories"
                  description="Tap a category to open its transaction history"
                />
                <ul className="divide-y divide-border">
                  {sortedCategories.map((item) => (
                    <li key={item.expense_type_id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/expense-types/${item.expense_type_id}`)}
                        className="group w-full px-4 py-3.5 text-left transition-colors hover:bg-surface-raised sm:px-5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: item.color || 'var(--chart-1)' }}
                              aria-hidden="true"
                            />
                            <span className="truncate text-[13px] font-medium text-text">
                              {item.name}
                            </span>
                            {item.is_archived ? <Badge tone="neutral">Archived</Badge> : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-[12px] font-medium tabular-nums text-text">
                              {formatINR(item.total_paise)}
                            </span>
                            <ArrowRight
                              className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(2, item.share_percent))}%`,
                                backgroundColor: item.color || 'var(--chart-1)',
                              }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                            {formatPercent(item.share_percent)}%
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                          <span>
                            {item.transaction_count} transaction
                            {item.transaction_count === 1 ? '' : 's'}
                          </span>
                          <span>Avg {formatINR(item.average_paise)}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {activeTab === 'payments' ? (
              <Panel className="mt-3 overflow-hidden">
                <PanelHeader
                  title="Payment modes"
                  description="Distribution across the methods recorded on each expense"
                />
                {paymentMethodStats.length ? (
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    {paymentMethodStats.map((item) => (
                      <div
                        key={item.method}
                        className="rounded-lg border border-border bg-surface-raised p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
                              <item.icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-text">
                                {item.label}
                              </p>
                              <p className="text-[11px] text-muted">
                                {item.count} transaction{item.count === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                          <p className="shrink-0 font-mono text-[12px] font-medium tabular-nums text-text">
                            {formatINR(item.total)}
                          </p>
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(3, item.share)}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                          <span>{item.share.toFixed(1)}% of spend</span>
                          <span>Avg {formatINR(Math.round(item.total / item.count))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-10 text-center text-[12px] text-muted">
                    No payment method was recorded on these expenses.
                  </p>
                )}
              </Panel>
            ) : null}

            {activeTab === 'merchants' ? (
              <Panel className="mt-3 overflow-hidden">
                <PanelHeader
                  title="Top merchants"
                  description="Highest outflow by merchant in this range"
                />
                {merchantStats.length ? (
                  <ul className="divide-y divide-border">
                    {merchantStats.map((item, index) => (
                      <li
                        key={item.merchant}
                        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised font-mono text-[10px] text-muted">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-text">
                              {item.merchant}
                            </p>
                            <p className="text-[11px] text-muted">
                              {item.count} transaction{item.count === 1 ? '' : 's'} ·{' '}
                              {item.share.toFixed(1)}% share
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 font-mono text-[12px] font-medium tabular-nums text-text">
                          {formatINR(item.total)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-10 text-center text-[12px] text-muted">
                    No merchant names were recorded in this range.
                  </p>
                )}
              </Panel>
            ) : null}
          </>
        ) : (
          <Panel className="mt-4">
            <EmptyState
              icon={PieChart}
              title="Nothing to break down yet"
              description={`No expense was recorded for ${formatRangeLabel(period.range)}. Choose another range or add an expense.`}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => period.setPreset('last_30')}>
                    Last 30 days
                  </Button>
                  <Button variant="secondary" onClick={() => period.setPreset('year')}>
                    This year
                  </Button>
                  <Button variant="primary" onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add expense
                  </Button>
                </div>
              }
            />
          </Panel>
        )}
      </>
    )
  })()

  if (embedded) return <div>{content}</div>
  return <AppPage>{content}</AppPage>
}
