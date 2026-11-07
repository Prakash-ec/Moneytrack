import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CreditCard,
  Layers,
  PieChart,
  Plus,
  Receipt,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorState, PageSkeleton } from '@/components/ui/States'
import { ExpenseDonut } from '@/components/charts/ExpenseDonut'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { Expense } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatRangeLabel, type PeriodPreset } from '@/utils/periods'
import { cn } from '@/utils/cn'

type BreakdownTab = 'categories' | 'payments' | 'merchants'

const PAYMENT_METHOD_META: Record<
  string,
  { label: string; icon: typeof Smartphone; color: string }
> = {
  upi: { label: 'UPI / QR', icon: Smartphone, color: '#2563eb' },
  card: { label: 'Credit / Debit Card', icon: CreditCard, color: '#3b82f6' },
  cash: { label: 'Cash Outflow', icon: Banknote, color: '#10b981' },
  netbanking: { label: 'Net Banking / IMPS', icon: Building2, color: '#8b5cf6' },
  other: { label: 'Other / Direct', icon: Wallet, color: '#64748b' },
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

  // Sorted category items
  const sortedCategories = useMemo(() => {
    const list = [...rawItems]
    if (categorySort === 'amount') {
      return list.sort((a, b) => b.total_paise - a.total_paise)
    }
    if (categorySort === 'count') {
      return list.sort((a, b) => b.transaction_count - a.transaction_count)
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [rawItems, categorySort])

  const topType = sortedCategories[0]

  // Payment methods breakdown
  const paymentMethodStats = useMemo(() => {
    if (!expenses.length) return []
    const methodTotals: Record<string, { total: number; count: number }> = {}
    let grandTotal = 0

    for (const exp of expenses) {
      const method = (exp.payment_method || 'other').toLowerCase()
      if (!methodTotals[method]) {
        methodTotals[method] = { total: 0, count: 0 }
      }
      methodTotals[method].total += exp.amount_paise
      methodTotals[method].count += 1
      grandTotal += exp.amount_paise
    }

    return Object.entries(methodTotals)
      .map(([method, data]) => ({
        method,
        label: PAYMENT_METHOD_META[method]?.label || method.toUpperCase(),
        icon: PAYMENT_METHOD_META[method]?.icon || Wallet,
        color: PAYMENT_METHOD_META[method]?.color || '#2563eb',
        total: data.total,
        count: data.count,
        share: grandTotal > 0 ? (data.total * 100) / grandTotal : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  // Merchant breakdown
  const merchantStats = useMemo(() => {
    if (!expenses.length) return []
    const merchantTotals: Record<string, { total: number; count: number }> = {}
    let grandTotal = 0

    for (const exp of expenses) {
      const merchant = (exp.merchant && exp.merchant.trim()) || 'Direct / Miscellaneous'
      if (!merchantTotals[merchant]) {
        merchantTotals[merchant] = { total: 0, count: 0 }
      }
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

  const quickPresets: Array<{ label: string; preset: PeriodPreset }> = [
    { label: 'This Month', preset: 'month' },
    { label: 'Last 30 Days', preset: 'last_30' },
    { label: 'This Year', preset: 'year' },
  ]

  if (loading) {
    return <PageSkeleton />
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load spending breakdown"
          description={
            typeof error === 'string'
              ? error
              : error instanceof Error
                ? error.message
                : 'Unable to calculate expenditure categorization.'
          }
          onRetry={() => {
            summaryQuery.refetch()
            byTypeQuery.refetch()
            expensesQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'page pb-20'}>
      {!embedded && (
        <PageHeader
          eyebrow="Allocation & shares"
          title="Spending breakdown"
          description="Comprehensive category distributions, payment channels, and merchant outflow."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <PeriodPicker
                preset={period.preset}
                range={period.range}
                onPresetChange={period.setPreset}
                onCustomChange={period.setCustomRange}
              />
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add expense</span>
              </Button>
            </div>
          }
        />
      )}

      {/* Quick Period Horizon Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
        <span className="text-[11px] font-bold text-muted uppercase tracking-wider whitespace-nowrap mr-1">
          Quick Range:
        </span>
        {quickPresets.map((qp) => (
          <button
            key={qp.preset}
            type="button"
            onClick={() => period.setPreset(qp.preset)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
              period.preset === qp.preset
                ? 'bg-primary text-white border-primary shadow-sm shadow-primary/30'
                : 'bg-surface hover:bg-surface-raised text-muted hover:text-text border-border',
            )}
          >
            {qp.label}
          </button>
        ))}
      </div>

      {hasExpenses ? (
        <>
          {/* Top Metric Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
            <div className="stat-card">
              <div className="stat-label">
                <span>Total Outflow</span>
                <span className="stat-icon">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value">{formatINR(summary?.total_paise ?? 0)}</strong>
              <div className="stat-detail">
                <span>{summary?.transaction_count ?? expenses.length} transactions</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Average Ticket</span>
                <span className="stat-icon">
                  <Receipt className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value">{formatINR(summary?.average_paise ?? 0)}</strong>
              <div className="stat-detail">
                <span>Per transaction</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Top Category</span>
                <span className="stat-icon">
                  <PieChart className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value truncate text-lg sm:text-xl">
                {topType ? topType.name : 'None'}
              </strong>
              <div className="stat-detail">
                <span>{topType ? `${formatPercent(topType.share_percent)}% share` : 'No spend'}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Active Types</span>
                <span className="stat-icon">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value font-display">{rawItems.length} Categories</strong>
              <div className="stat-detail">
                <span>In this period</span>
              </div>
            </div>
          </section>

          {/* Visual Donut Chart + Allocation Insight */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <article className="card p-4 sm:p-6 lg:col-span-7 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                <div>
                  <h2 className="text-base font-bold text-text font-display flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                    Capital Allocation Donut
                  </h2>
                  <p className="text-xs text-muted mt-0.5">{formatRangeLabel(period.range)}</p>
                </div>
              </div>
              <div className="py-2">
                <ExpenseDonut
                  items={sortedCategories}
                  totalPaise={summary?.total_paise ?? 0}
                  onSelect={(typeId) => navigate(`/expense-types/${typeId}`)}
                />
              </div>
            </article>

            <article className="card p-4 sm:p-6 lg:col-span-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                  <h2 className="text-base font-bold text-text font-display">Strategic Insight</h2>
                  <Badge tone={topType && topType.share_percent > 40 ? 'warning' : 'primary'}>
                    {topType && topType.share_percent > 40 ? 'High Concentration' : 'Healthy Spread'}
                  </Badge>
                </div>

                {topType ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-surface-raised border border-border">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                        Primary Expense Destination
                      </span>
                      <strong className="text-lg font-bold text-text block mt-1">
                        {topType.name}
                      </strong>
                      <p className="text-xs text-muted mt-1 leading-relaxed">
                        Accounts for{' '}
                        <span className="font-bold text-primary">
                          {formatPercent(topType.share_percent)}%
                        </span>{' '}
                        of your total period outflow ({formatINR(topType.total_paise)}) across{' '}
                        {topType.transaction_count} transaction
                        {topType.transaction_count === 1 ? '' : 's'}.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-surface-raised border border-border">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                        Average Outflow Per Ticket
                      </span>
                      <strong className="text-base font-bold text-text block mt-1">
                        {formatINR(topType.average_paise)} / transaction
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Your expenditures are well distributed across active categories.
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
                <span>Tap any category row below for historical breakdown</span>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </article>
          </section>

          {/* Perspective View Switcher: Categories vs Payment Channels vs Merchants */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="segmented">
              <button
                type="button"
                onClick={() => setActiveTab('categories')}
                className={cn(activeTab === 'categories' && 'active')}
              >
                Categories ({sortedCategories.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={cn(activeTab === 'payments' && 'active')}
              >
                Payment Modes ({paymentMethodStats.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('merchants')}
                className={cn(activeTab === 'merchants' && 'active')}
              >
                Top Merchants ({merchantStats.length})
              </button>
            </div>

            {activeTab === 'categories' && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="text-[11px] font-semibold uppercase">Sort:</span>
                <button
                  type="button"
                  onClick={() => setCategorySort('amount')}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    categorySort === 'amount' ? 'bg-primary-soft text-primary font-bold' : 'hover:text-text',
                  )}
                >
                  Amount
                </button>
                <button
                  type="button"
                  onClick={() => setCategorySort('count')}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    categorySort === 'count' ? 'bg-primary-soft text-primary font-bold' : 'hover:text-text',
                  )}
                >
                  Count
                </button>
                <button
                  type="button"
                  onClick={() => setCategorySort('name')}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    categorySort === 'name' ? 'bg-primary-soft text-primary font-bold' : 'hover:text-text',
                  )}
                >
                  Name
                </button>
              </div>
            )}
          </div>

          {/* Tab 1: Category Distribution List */}
          {activeTab === 'categories' && (
            <section className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h2>Category Distribution</h2>
                  <p>Detailed expenditure allocation with percentage shares and transaction volumes</p>
                </div>
                <span className="text-xs font-semibold text-muted">
                  {sortedCategories.length} {sortedCategories.length === 1 ? 'type' : 'types'}
                </span>
              </div>

              <div className="divide-y divide-border">
                {sortedCategories.map((item) => (
                  <div
                    key={item.expense_type_id}
                    className="p-3.5 sm:p-4 hover:bg-primary-soft/20 transition-all cursor-pointer group flex flex-col gap-2"
                    onClick={() => navigate(`/expense-types/${item.expense_type_id}`)}
                  >
                    {/* Top Row: Color indicator, Category Name, and Total INR */}
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: item.color || '#2563eb' }}
                        />
                        <span className="font-semibold text-sm text-text truncate group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        {item.is_archived && (
                          <span className="text-[10px] text-muted px-1.5 py-0.5 rounded bg-surface-raised border border-border">
                            Archived
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <strong className="text-sm font-bold text-text tabular font-display">
                          {formatINR(item.total_paise)}
                        </strong>
                        <ArrowRight className="h-4 w-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-border/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(2, item.share_percent))}%`,
                          backgroundColor: item.color || '#2563eb',
                        }}
                      />
                    </div>

                    {/* Meta Row: Share %, Transaction count, and Average per tx */}
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span className="font-bold text-text text-[11px] tabular">
                        {formatPercent(item.share_percent)}% of spend
                      </span>
                      <div className="flex items-center gap-3 text-[11px] tabular">
                        <span>
                          {item.transaction_count} tx
                          {item.transaction_count === 1 ? '' : 's'}
                        </span>
                        <span>•</span>
                        <span>Avg {formatINR(item.average_paise)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tab 2: Payment Method Channels */}
          {activeTab === 'payments' && (
            <section className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h2>Payment Channel Breakdown</h2>
                  <p>Distribution across UPI, Credit/Debit Cards, Cash, and Net Banking</p>
                </div>
              </div>

              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {paymentMethodStats.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.method}
                      className="p-4 rounded-xl bg-surface-raised border border-border flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
                            style={{ backgroundColor: item.color }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <strong className="text-sm font-bold text-text block">{item.label}</strong>
                            <span className="text-xs text-muted">
                              {item.count} transaction{item.count === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                        <strong className="text-base font-bold text-text tabular font-display">
                          {formatINR(item.total)}
                        </strong>
                      </div>

                      <div>
                        <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(3, item.share)}%`, backgroundColor: item.color }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-xs text-muted font-medium">
                          <span>{item.share.toFixed(1)}% of total volume</span>
                          <span>Avg {formatINR(Math.round(item.total / item.count))}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Tab 3: Top Merchants & Payees */}
          {activeTab === 'merchants' && (
            <section className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h2>Merchant & Payee Leaderboard</h2>
                  <p>Where your money flows most frequently in this reporting timeframe</p>
                </div>
              </div>

              <div className="divide-y divide-border">
                {merchantStats.map((item, index) => (
                  <div
                    key={item.merchant}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-primary-soft/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-7 w-7 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-bold text-muted flex-shrink-0">
                        #{index + 1}
                      </span>
                      <div className="min-w-0">
                        <strong className="text-sm font-bold text-text truncate block">
                          {item.merchant}
                        </strong>
                        <span className="text-xs text-muted">
                          {item.count} transaction{item.count === 1 ? '' : 's'} •{' '}
                          {item.share.toFixed(1)}% share
                        </span>
                      </div>
                    </div>

                    <strong className="text-sm sm:text-base font-bold text-text tabular font-display flex-shrink-0">
                      {formatINR(item.total)}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* Empty State */
        <Card className="p-8 sm:p-12 text-center mt-5">
          <div className="max-w-md mx-auto">
            <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shadow-lg shadow-primary/20">
              <PieChart className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-text font-display">No breakdown data in this range</h2>
            <p className="text-sm text-muted mt-2 mb-6">
              There is no expenditure recorded for{' '}
              <span className="font-semibold text-text">{formatRangeLabel(period.range)}</span>. Try choosing a different range or add an expense.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => period.setPreset('last_30')}
                className="button button-secondary w-full sm:w-auto"
              >
                <span>View Last 30 Days</span>
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </button>
              <button
                type="button"
                onClick={() => period.setPreset('year')}
                className="button button-secondary w-full sm:w-auto"
              >
                <span>View This Year</span>
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </button>
              <button
                type="button"
                onClick={() => openCreate()}
                className="button button-primary w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span>Add expense</span>
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
