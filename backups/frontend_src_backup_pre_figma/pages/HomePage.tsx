import {
  ArrowUpRight,
  Camera,
  Columns3,
  History,
  Plus,
  ReceiptText,
  Scale,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { ComparisonBadge } from '@/components/ComparisonBadge'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { StatCard } from '@/components/StatCard'
import { TransactionList } from '@/components/TransactionList'
import { TypeBreakdownTable } from '@/components/TypeBreakdownTable'
import { TypeIcon } from '@/components/TypeIcon'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, buttonClasses } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { ExpenseDonut } from '@/components/charts/ExpenseDonut'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatRangeLabel, suggestedGranularity } from '@/utils/periods'
import { formatDate } from '@/utils/dates'

export function HomePage() {
  useDocumentTitle('Overview')
  const period = usePeriod()
  const navigate = useNavigate()
  const { openCreate, openEdit, openScanReceipt } = useExpenseDialog()
  const { start, end } = period.range
  const granularity = suggestedGranularity(period.range)

  const summaryQuery = useApiQuery(['summary', start, end], () =>
    api.analyticsSummary({ start_date: start, end_date: end }),
  )
  const byTypeQuery = useApiQuery(['by-type', start, end], () =>
    api.analyticsByType({ start_date: start, end_date: end }),
  )
  const trendsQuery = useApiQuery(['trends', start, end, granularity], () =>
    api.analyticsTrends({ start_date: start, end_date: end, granularity }),
  )
  const recentQuery = useApiQuery(['recent-expenses', start, end], () =>
    api.listExpenses({
      start_date: start,
      end_date: end,
      sort: 'date_desc',
      page: 1,
      page_size: 4,
    }),
  )
  const typesQuery = useApiQuery(['types-count'], () =>
    api.listExpenseTypes({ archived: 'exclude', page_size: 1 }),
  )

  const summary = summaryQuery.data
  const loading = summaryQuery.loading && !summary
  const error = summaryQuery.error ?? byTypeQuery.error ?? trendsQuery.error ?? recentQuery.error
  const hasExpenses = Boolean(summary && summary.transaction_count > 0)
  const hasTypes = (typesQuery.data?.total ?? 0) > 0

  const retryAll = () => {
    summaryQuery.refetch()
    byTypeQuery.refetch()
    trendsQuery.refetch()
    recentQuery.refetch()
    typesQuery.refetch()
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Where your money went"
        description={`${formatRangeLabel(period.range)} · Asia/Kolkata`}
        actions={
          <>
            <Link
              to="/expense-types"
              className={buttonClasses('secondary', 'md', 'hidden sm:inline-flex')}
            >
              <Tags className="h-4 w-4" aria-hidden />
              Expense types
            </Link>
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

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <ErrorState
          description={error.message}
          onRetry={retryAll}
          title="Could not load your overview"
        />
      ) : !summary ? null : !hasExpenses ? (
        <Card className="overflow-hidden">
          <div className="p-6 sm:p-8">
            <EmptyState
              icon={WalletCards}
              title="No expenses in this period yet"
              description={
                hasTypes
                  ? 'Add your first expense and MoneyTrack will build the totals, breakdown, and trends from your own records.'
                  : 'Start by creating an expense type such as Food, Jio Recharge, or Bus Travel, then record your first expense.'
              }
              action={
                <div className="flex flex-col items-center gap-2 sm:flex-row">
                  <Button onClick={() => openCreate()}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {hasTypes ? 'Add your first expense' : 'Create your first expense'}
                  </Button>
                  <Button variant="secondary" onClick={() => openScanReceipt()}>
                    <Camera className="h-4 w-4" aria-hidden />
                    Scan receipt
                  </Button>
                  <Link to="/expense-types" className={buttonClasses('secondary', 'md')}>
                    Manage expense types
                  </Link>
                </div>
              }
            />
            <div className="mt-6 grid gap-3 border-t border-line bg-elevated/60 px-6 sm:grid-cols-3">
              {[
                { icon: Tags, text: 'Create reusable expense types' },
                { icon: ReceiptText, text: 'Record exact amounts in paise' },
                { icon: TrendingUp, text: 'See where spending changes' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 text-xs text-muted">
                  <item.icon className="h-4 w-4 text-primary" aria-hidden />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <>
          <section
            className="relative overflow-hidden rounded-[1.75rem] border border-primary/20 bg-navy p-6 text-primary-contrast shadow-lift sm:p-8"
            aria-label="Period summary"
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-contrast/55">
                    Total expenditure
                  </p>
                  <ComparisonBadge
                    direction={summary.comparison.direction}
                    changePercent={summary.comparison.change_percent}
                    changePaise={summary.comparison.change_paise}
                    onDark
                    withContext
                  />
                </div>
                <p className="mt-3 font-display text-[2.55rem] font-semibold leading-none tracking-tight sm:text-5xl">
                  {formatINR(summary.total_paise)}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-primary-contrast/70">
                  <span>
                    <strong className="font-semibold text-primary-contrast">{summary.transaction_count}</strong>{' '}
                    {summary.transaction_count === 1 ? 'transaction' : 'transactions'}
                  </span>
                  <span>
                    Average{' '}
                    <strong className="tabular font-semibold text-primary-contrast">
                      {formatINR(summary.average_paise)}
                    </strong>
                  </span>
                  <span>
                    Previous{' '}
                    <strong className="tabular font-semibold text-primary-contrast">
                      {formatINR(summary.comparison.previous_total_paise)}
                    </strong>
                  </span>
                </div>
              </div>

              {summary.most_expensive_type ? (
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-contrast/50">
                      Largest expense type
                    </p>
                    <ArrowUpRight className="h-3.5 w-3.5 text-primary-contrast/40" aria-hidden />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <TypeIcon
                      icon={summary.most_expensive_type.icon}
                      color={summary.most_expensive_type.color}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {summary.most_expensive_type.name}
                      </p>
                      <p className="text-xs text-primary-contrast/60">
                        {summary.most_expensive_type.transaction_count}{' '}
                        {summary.most_expensive_type.transaction_count === 1
                          ? 'transaction'
                          : 'transactions'} · {formatPercent(summary.most_expensive_type.share_percent)}% of spend
                      </p>
                    </div>
                    <p className="tabular shrink-0 text-sm font-semibold">
                      {formatINR(summary.most_expensive_type.total_paise)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Transactions"
              value={summary.transaction_count.toLocaleString('en-IN')}
              hint={formatRangeLabel(period.range)}
              icon={ReceiptText}
            />
            <StatCard
              label="Average expense"
              value={formatINR(summary.average_paise)}
              hint="Per transaction in this period"
              icon={Scale}
            />
            <StatCard
              label="Highest expense"
              value={summary.highest_expense ? formatINR(summary.highest_expense.amount_paise) : '—'}
              hint={
                summary.highest_expense
                  ? `${summary.highest_expense.expense_type.name} · ${formatDate(summary.highest_expense.expense_date)}`
                  : 'No expenses'
              }
              icon={Sparkles}
              tone="warning"
            />
            <StatCard
              label="Previous period"
              value={formatINR(summary.comparison.previous_total_paise)}
              hint={
                <ComparisonBadge
                  direction={summary.comparison.direction}
                  changePercent={summary.comparison.change_percent}
                  changePaise={summary.comparison.change_paise}
                />
              }
              icon={History}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-6 py-5 sm:px-6 sm:pt-5">
              <CardHeader
                title="Spending by expense type"
                description="Every rupee is attributed to the type you recorded."
                action={
                  <Link
                    to={`/breakdown?${period.periodSearch}`}
                    className={buttonClasses('ghost', 'sm')}
                  >
                    <Columns3 className="h-4 w-4" aria-hidden />
                    Full breakdown
                  </Link>
                }
              />
            </div>
            <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
              <div className="flex items-center border-b border-line px-6 py-3 sm:px-6 lg:border-b-0 lg:border-r">
                <ExpenseDonut
                  items={byTypeQuery.data?.items ?? []}
                  totalPaise={summary.total_paise}
                  onSelect={(typeId) => navigate(`/expense-types/${typeId}?${period.periodSearch}`)}
                />
              </div>
              <div>
                <TypeBreakdownTable
                  items={(byTypeQuery.data?.items ?? []).slice(0, 6)}
                  periodSearch={period.periodSearch}
                />
                {(byTypeQuery.data?.items.length ?? 0) > 6 ? (
                  <div className="border-t border-line px-6 py-4 text-right">
                    <Link
                      to={`/breakdown?${period.periodSearch}`}
                      className="text-xs font-semibold text-primary hover:text-primary/80"
                    >
                      View all {byTypeQuery.data?.items.length} types
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Card className="overflow-hidden">
              <div className="px-6 pt-5 sm:px-6 sm:pt-6">
                <CardHeader
                  title="Spending over time"
                  description={
                    granularity === 'daily'
                      ? 'Daily expenditure in the selected period.'
                      : granularity === 'weekly'
                        ? 'Weekly expenditure in the selected period.'
                        : 'Monthly expenditure in the selected period.'
                  }
                  action={
                    <Link to={`/trends?${period.periodSearch}`} className={buttonClasses('ghost', 'sm')}>
                      <TrendingUp className="h-4 w-4" aria-hidden />
                      Trends
                    </Link>
                  }
                />
              </div>
              <div className="px-2 pb-4 pt-2 sm:px-3">
                <TrendChart
                  series={trendsQuery.data?.series ?? []}
                  granularity={granularity}
                  height={250}
                />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-6 py-5 sm:px-6 sm:pt-5">
                <CardHeader
                  title="Recent expenses"
                  description="Tap an entry to edit it."
                  action={
                    <Link to={`/expenses?${period.periodSearch}`} className={buttonClasses('ghost', 'sm')}>
                      View all
                    </Link>
                  }
                />
              </div>
              {(recentQuery.data?.items.length ?? 0) > 0 ? (
                <TransactionList
                  expenses={recentQuery.data?.items ?? []}
                  onEdit={openEdit}
                />
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Nothing recorded here"
                  description="Add an expense to see it in this list."
                  action={
                    <Button size="sm" onClick={() => openCreate()}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add expense
                    </Button>
                  }
                />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
