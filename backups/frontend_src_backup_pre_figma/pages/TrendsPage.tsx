import {
  CalendarRange,
  Lightbulb,
  Plus,
  Repeat,
  Sparkles,
  Tags,
  TrendingUp,
  Trophy,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ComparisonBadge } from '@/components/ComparisonBadge'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { StatCard } from '@/components/StatCard'
import { TypeIcon } from '@/components/TypeIcon'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { Granularity, TypeComparison } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatDate, formatDateLong } from '@/utils/dates'
import { formatRangeLabel, suggestedGranularity } from '@/utils/periods'
import { cn } from '@/utils/cn'

const GRANULARITY_OPTIONS: Array<{ value: Granularity; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function compareTypes(a: TypeComparison, b: TypeComparison): number {
  return (
    Math.max(b.current_total_paise, b.previous_total_paise) -
      Math.max(a.current_total_paise, a.previous_total_paise) ||
    a.name.localeCompare(b.name)
  )
}

export function TrendsPage() {
  useDocumentTitle('Trends')
  const period = usePeriod()
  const { openCreate } = useExpenseDialog()
  const { start, end } = period.range
  const [granularity, setGranularity] = useState<Granularity>(() =>
    suggestedGranularity(period.range),
  )

  useEffect(() => {
    setGranularity(suggestedGranularity(period.range))
  }, [period.range.start, period.range.end])

  const trendsQuery = useApiQuery(['trends', start, end, granularity], () =>
    api.analyticsTrends({ start_date: start, end_date: end, granularity }),
  )
  const comparisonQuery = useApiQuery(['comparison', start, end], () =>
    api.analyticsComparison({ start_date: start, end_date: end }),
  )

  const trends = trendsQuery.data
  const comparison = comparisonQuery.data
  const loading =
    (trendsQuery.loading && !trends) || (comparisonQuery.loading && !comparison)
  const error = trendsQuery.error ?? comparisonQuery.error
  const hasExpenses = (comparison?.current_transaction_count ?? 0) > 0
  const largestDay = trends?.largest_days[0]
  const maxDayAmount = largestDay?.total_paise ?? 0
  const topType = trends?.rankings[0]

  const comparisonRows = useMemo(
    () => [...(comparison?.by_type ?? [])].sort(compareTypes),
    [comparison],
  )

  const granularityLabel =
    granularity === 'daily' ? 'Daily' : granularity === 'weekly' ? 'Weekly' : 'Monthly'

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Patterns
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
            Spending trends
          </h1>
          <p className="mt-1 text-sm text-muted">
            Movement over time, largest days, and the habits visible in your own records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/breakdown?${period.periodSearch}`}
            className={buttonClasses('secondary', 'md')}
          >
            <Tags className="h-4 w-4" aria-hidden />
            Breakdown
          </Link>
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

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
          title="Could not load your trends"
          description={error.message}
          onRetry={() => {
            trendsQuery.refetch()
            comparisonQuery.refetch()
          }}
        />
      ) : !comparison || !trends ? null : !hasExpenses ? (
        <Card>
          <EmptyState
            icon={TrendingUp}
            title="Trends need a little history"
            description="Record expenses in this period and MoneyTrack will chart their movement, largest days, and recurring patterns. Nothing is inferred from sample data."
            action={
              <Button onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden />
                Add an expense
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Total spent"
              value={formatINR(comparison.current_total_paise)}
              hint={
                <ComparisonBadge
                  direction={comparison.direction}
                  changePercent={comparison.change_percent}
                  changePaise={comparison.change_paise}
                />
              }
              icon={WalletCards}
              tone="primary"
            />
            <StatCard
              label="Largest day"
              value={largestDay ? formatINR(largestDay.total_paise) : '—'}
              hint={
                largestDay
                  ? `${formatDateLong(largestDay.date)} · ${largestDay.transaction_count} ${
                      largestDay.transaction_count === 1 ? 'expense' : 'expenses'
                    }`
                  : 'No spending days'
              }
              icon={Trophy}
              tone="warning"
            />
            <StatCard
              label="Recurring patterns"
              value={(trends.recurring.length ?? 0).toString()}
              hint={
                trends.recurring.length
                  ? `${trends.recurring.filter((item) => item.pattern === 'regular').length} regular intervals detected`
                  : 'Not enough repeated activity yet'
              }
              icon={Repeat}
            />
            <StatCard
              label="Types used"
              value={trends.rankings.length.toString()}
              hint={
                topType
                  ? `${topType.name} leads at ${formatPercent(topType.share_percent)}%`
                  : 'No types in this period'
              }
              icon={Tags}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <CardHeader
                title={`${granularityLabel} spending`}
                description={`${formatRangeLabel(period.range)} · hover or tap the chart for exact amounts.`}
              />
              <div
                className="inline-flex shrink-0 rounded-xl border border-line bg-elevated p-1"
                role="group"
                aria-label="Trend granularity"
              >
                {GRANULARITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGranularity(option.value)}
                    aria-pressed={granularity === option.value}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                      granularity === option.value
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-2 pb-3 pt-3 sm:px-4">
              <TrendChart
                series={trends.series}
                granularity={trends.granularity}
                height={310}
              />
            </div>
          </Card>

          {trends.insights.length > 0 ? (
            <div className="rounded-2xl border border-primary/15 bg-primary-soft/60 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-primary shadow-sm">
                  <Lightbulb className="h-4 w-4" aria-hidden />
                </span>
                <h2 className="text-sm font-semibold text-ink">What the data shows</h2>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {trends.insights.map((insight) => (
                  <li key={insight} className="flex gap-2 text-sm leading-6 text-muted">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <CardHeader
                title="Current vs previous period"
                description={`Compared with ${formatDate(comparison.previous_start_date)} – ${formatDate(
                  comparison.previous_end_date,
                )}. Types with spending in either period are included.`}
              />
            </div>
            {comparisonRows.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No type comparison available"
                description="There is no recorded spending for these two periods."
              />
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,1.5fr)_7rem_7rem_10rem] items-center gap-3 border-b border-line bg-elevated/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-subtle md:grid">
                  <span>Expense type</span>
                  <span className="text-right">This period</span>
                  <span className="text-right">Previous</span>
                  <span className="text-right">Change</span>
                </div>
                <div className="divide-y divide-line">
                  {comparisonRows.map((item) => (
                    <div
                      key={item.expense_type_id}
                      className="px-4 py-3.5 md:grid md:grid-cols-[minmax(0,1.5fr)_7rem_7rem_10rem] md:items-center md:gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <TypeIcon icon={item.icon} color={item.color} size="sm" />
                        <div className="min-w-0">
                          <Link
                            to={`/expense-types/${item.expense_type_id}?${period.periodSearch}`}
                            className="truncate text-sm font-semibold text-ink hover:text-primary"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted md:hidden">
                            {item.current_transaction_count} now ·{' '}
                            {item.previous_transaction_count} before
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-3 md:mt-0 md:block md:text-right">
                        <span className="text-xs text-subtle md:hidden">This period</span>
                        <span className="tabular text-sm font-semibold text-ink">
                          {formatINR(item.current_total_paise)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 md:mt-0 md:block md:text-right">
                        <span className="text-xs text-subtle md:hidden">Previous</span>
                        <span className="tabular text-sm text-muted">
                          {formatINR(item.previous_total_paise)}
                        </span>
                      </div>
                      <div className="mt-2 flex justify-start md:mt-0 md:justify-end">
                        <ComparisonBadge
                          direction={item.direction}
                          changePercent={item.change_percent}
                          changePaise={item.change_paise}
                          showAmount
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-4 sm:px-5">
                <CardHeader
                  title="Largest spending days"
                  description="Ranked by total spend, not by a single transaction."
                  action={<Trophy className="h-4 w-4 text-warning" aria-hidden />}
                />
              </div>
              {trends.largest_days.length === 0 ? (
                <EmptyState
                  icon={CalendarRange}
                  title="No spending days"
                  description="No expenses were recorded in this period."
                />
              ) : (
                <ol className="divide-y divide-line">
                  {trends.largest_days.map((day, index) => (
                    <li key={day.date} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-elevated text-xs font-semibold text-muted">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-sm font-medium text-ink">{formatDateLong(day.date)}</p>
                          <p className="tabular text-sm font-semibold text-ink">
                            {formatINR(day.total_paise)}
                          </p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.max(
                                  maxDayAmount ? (day.total_paise / maxDayAmount) * 100 : 0,
                                  2,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] text-subtle">
                            {day.transaction_count}{' '}
                            {day.transaction_count === 1 ? 'expense' : 'expenses'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-4 sm:px-5">
                <CardHeader
                  title="Recurring activity"
                  description="Detected from repeated expense dates within this period."
                  action={<Repeat className="h-4 w-4 text-primary" aria-hidden />}
                />
              </div>
              {trends.recurring.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-subtle">
                    <Repeat className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-ink">
                    Not enough data for a reliable pattern
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted">
                    A pattern needs at least three expenses of the same type in the selected
                    period. Record more activity to reveal a regular rhythm.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {trends.recurring.map((item) => (
                    <li key={item.expense_type_id} className="flex items-start gap-3 px-4 py-4 sm:px-5">
                      <TypeIcon icon={item.icon} color={item.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{item.name}</p>
                          <Badge tone={item.pattern === 'regular' ? 'positive' : 'primary'}>
                            {item.pattern === 'regular' ? 'Regular' : 'Frequent'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted">{item.message}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-subtle">
                          <span className="tabular">{formatINR(item.total_paise)} total</span>
                          <span>
                            {item.transaction_count}{' '}
                            {item.transaction_count === 1 ? 'expense' : 'expenses'}
                          </span>
                          {item.average_gap_days !== null ? (
                            <span>approx. every {Math.round(item.average_gap_days)} days</span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
