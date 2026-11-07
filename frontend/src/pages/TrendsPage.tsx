import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  Clock,
  Layers,
  LineChart,
  PieChart,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { ErrorState, PageSkeleton } from '@/components/ui/States'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { Granularity } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel, suggestedGranularity, type PeriodPreset } from '@/utils/periods'
import { cn } from '@/utils/cn'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function TrendsPage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle('Spending Trends')
  const period = usePeriod()
  const { openCreate } = useExpenseDialog()
  const { start, end } = period.range

  const [granularity, setGranularity] = useState<Granularity>(() =>
    suggestedGranularity(period.range),
  )
  const [chartVariant, setChartVariant] = useState<'area' | 'bar'>('area')

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
  const loading = trendsQuery.loading && !trends
  const error = trendsQuery.error

  const series = trends?.series ?? []
  const totalPeriodSpend = useMemo(
    () => series.reduce((sum, p) => sum + (p.total_paise || 0), 0),
    [series],
  )
  const totalTxCount = useMemo(
    () => series.reduce((sum, p) => sum + (p.transaction_count || 0), 0),
    [series],
  )
  const activeDaysCount = useMemo(
    () => series.filter((p) => (p.total_paise || 0) > 0).length,
    [series],
  )

  // Resilient check: True if ANY series point has spend OR comparison count > 0 OR largest_days has entries
  const hasExpenses =
    totalPeriodSpend > 0 ||
    totalTxCount > 0 ||
    (comparison?.current_transaction_count ?? 0) > 0 ||
    (trends?.largest_days && trends.largest_days.length > 0)

  const largestDay = trends?.largest_days?.[0]
  const topType = trends?.rankings?.[0]

  const averagePerActiveDay =
    activeDaysCount > 0 ? Math.round(totalPeriodSpend / activeDaysCount) : 0
  const dailyAverageAllDays =
    series.length > 0 ? Math.round(totalPeriodSpend / series.length) : 0

  // Day of week analysis (Mon - Sun)
  const dayOfWeekStats = useMemo(() => {
    if (!series.length) return []
    const totals = [0, 0, 0, 0, 0, 0, 0] // 0=Sun, 1=Mon, ..., 6=Sat
    const counts = [0, 0, 0, 0, 0, 0, 0]

    for (const p of series) {
      if (!p.total_paise) continue
      const d = new Date(p.date)
      const day = d.getDay()
      totals[day] += p.total_paise
      counts[day] += p.transaction_count
    }

    const maxSpend = Math.max(...totals, 1)

    // Reorder from Monday (1) to Sunday (0)
    const order = [1, 2, 3, 4, 5, 6, 0]
    return order.map((dayIdx) => ({
      name: DAY_NAMES[dayIdx],
      total: totals[dayIdx],
      count: counts[dayIdx],
      pctOfMax: (totals[dayIdx] / maxSpend) * 100,
    }))
  }, [series])

  // Weekday vs Weekend dynamics
  const dynamics = useMemo(() => {
    if (!series.length || totalPeriodSpend === 0) return null
    let weekdayPaise = 0
    let weekendPaise = 0

    for (const point of series) {
      const d = new Date(point.date)
      const day = d.getDay()
      if (day === 0 || day === 6) {
        weekendPaise += point.total_paise || 0
      } else {
        weekdayPaise += point.total_paise || 0
      }
    }

    const total = weekdayPaise + weekendPaise
    return {
      weekdayPaise,
      weekendPaise,
      weekdayPct: total > 0 ? (weekdayPaise * 100) / total : 0,
      weekendPct: total > 0 ? (weekendPaise * 100) / total : 0,
    }
  }, [series, totalPeriodSpend])

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
          title="Could not load spending trends"
          description={
            typeof error === 'string'
              ? error
              : error instanceof Error
                ? error.message
                : 'Unable to communicate with the analytics engine.'
          }
          onRetry={() => {
            trendsQuery.refetch()
            comparisonQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'page pb-20'}>
      {!embedded && (
        <PageHeader
          eyebrow="Trends & velocity"
          title="Spending trends"
          description="Monitor temporal trajectories, spending velocity, and habit cycles."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <PeriodPicker
                preset={period.preset}
                range={period.range}
                onPresetChange={period.setPreset}
                onCustomChange={period.setCustomRange}
              />
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
          {/* Key Trend KPI Metric Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
            <div className="stat-card">
              <div className="stat-label">
                <span>Period Outflow</span>
                <span className="stat-icon">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value">{formatINR(totalPeriodSpend)}</strong>
              <div className="stat-detail">
                {comparison?.change_percent != null ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 font-semibold text-xs',
                      comparison.direction === 'down' ? 'text-positive' : 'text-danger',
                    )}
                  >
                    {comparison.direction === 'down' ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(comparison.change_percent).toFixed(1)}% vs prev
                  </span>
                ) : (
                  <span>{totalTxCount} transactions</span>
                )}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Active Day Avg</span>
                <span className="stat-icon">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value">{formatINR(averagePerActiveDay)}</strong>
              <div className="stat-detail">
                <span>Across {activeDaysCount} active days</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Peak Single Day</span>
                <span className="stat-icon">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value">
                {largestDay ? formatINR(largestDay.total_paise) : '₹0.00'}
              </strong>
              <div className="stat-detail truncate">
                <span>{largestDay ? formatDate(largestDay.date) : 'No spikes detected'}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <span>Timeline Span</span>
                <span className="stat-icon">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <strong className="stat-value font-display">{series.length} Days</strong>
              <div className="stat-detail">
                <span>Avg {formatINR(dailyAverageAllDays)} / day</span>
              </div>
            </div>
          </section>

          {/* Main Interactive Chart Section */}
          <section className="card p-4 sm:p-6 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-text font-display flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  Spending Trajectory
                </h2>
                <p className="text-xs text-muted mt-0.5">{formatRangeLabel(period.range)}</p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* Chart Type Toggle: Area vs Bar */}
                <div className="segmented">
                  <button
                    type="button"
                    onClick={() => setChartVariant('area')}
                    className={cn(chartVariant === 'area' && 'active')}
                    title="Area Curve"
                    aria-label="Area Curve"
                  >
                    <LineChart className="h-3.5 w-3.5 inline mr-1" />
                    Area
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartVariant('bar')}
                    className={cn(chartVariant === 'bar' && 'active')}
                    title="Bar Histogram"
                    aria-label="Bar Histogram"
                  >
                    <BarChart3 className="h-3.5 w-3.5 inline mr-1" />
                    Bars
                  </button>
                </div>

                {/* Granularity Toggle: Daily / Weekly / Monthly */}
                <div className="segmented">
                  <button
                    type="button"
                    onClick={() => setGranularity('daily')}
                    className={cn(granularity === 'daily' && 'active')}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setGranularity('weekly')}
                    className={cn(granularity === 'weekly' && 'active')}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setGranularity('monthly')}
                    className={cn(granularity === 'monthly' && 'active')}
                  >
                    Monthly
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full">
              <TrendChart
                series={series}
                granularity={granularity}
                variant={chartVariant}
                height={290}
              />
            </div>
          </section>

          {/* Day-of-Week Distribution & Habit Cycle */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-text font-display flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                    Day of Week Spending Heatmap
                  </h3>
                  <p className="text-xs text-muted mt-0.5">Which days of the week see the heaviest outflow</p>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-2">
                {dayOfWeekStats.map((item) => (
                  <div key={item.name} className="flex flex-col items-center gap-1.5 text-center">
                    <div className="h-28 w-full bg-surface-raised rounded-lg flex flex-col justify-end p-1 border border-border">
                      <div
                        className={cn(
                          'w-full rounded-md transition-all',
                          item.pctOfMax > 70
                            ? 'bg-primary'
                            : item.pctOfMax > 30
                              ? 'bg-primary/70'
                              : 'bg-primary/40',
                        )}
                        style={{ height: `${Math.max(6, item.pctOfMax)}%` }}
                        title={`${item.name}: ${formatINR(item.total)} (${item.count} tx)`}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-text">{item.name}</span>
                    <span className="text-[10px] text-muted font-medium tabular">
                      {item.total > 0 ? `₹${Math.round(item.total / 100)}` : '₹0'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekday vs Weekend Dynamics */}
            {dynamics && (
              <div className="card p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-text font-display flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
                      Weekday vs Weekend Dynamics
                    </h3>
                    <Badge tone={dynamics.weekdayPct >= dynamics.weekendPct ? 'primary' : 'warning'}>
                      {dynamics.weekdayPct >= dynamics.weekendPct
                        ? 'Weekday Dominant'
                        : 'Weekend Dominant'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    Compare lifestyle spending on workdays versus leisure weekends.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="p-3.5 rounded-xl bg-surface-raised border border-border">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Weekdays (Mon–Fri)
                    </span>
                    <div className="text-lg font-bold text-text font-display mt-1">
                      {formatINR(dynamics.weekdayPaise)}
                    </div>
                    <span className="text-xs text-muted mt-0.5 block">
                      {dynamics.weekdayPct.toFixed(0)}% of total spend
                    </span>
                    <div className="h-2 w-full bg-border rounded-full mt-2.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${dynamics.weekdayPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-raised border border-border">
                    <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Weekends (Sat–Sun)
                    </span>
                    <div className="text-lg font-bold text-text font-display mt-1">
                      {formatINR(dynamics.weekendPaise)}
                    </div>
                    <span className="text-xs text-muted mt-0.5 block">
                      {dynamics.weekendPct.toFixed(0)}% of total spend
                    </span>
                    <div className="h-2 w-full bg-border rounded-full mt-2.5 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${dynamics.weekendPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-muted italic">
                  Tip: Shift planned major retail expenditures to weekdays for disciplined budgeting.
                </div>
              </div>
            )}
          </section>

          {/* Strategic Insights & Spike Events */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            <article className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="stat-icon">
                  {comparison?.direction === 'down' ? (
                    <TrendingDown className="h-4 w-4 text-positive" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-primary" />
                  )}
                </span>
                <span className="text-xs font-bold text-text uppercase tracking-wider">
                  Period Comparison
                </span>
              </div>
              <strong className="text-sm font-bold text-text block mb-1">
                {comparison?.change_percent != null
                  ? `Spending is ${comparison.direction === 'down' ? 'down' : 'up'} by ${formatPercent(Math.abs(comparison.change_percent))}%`
                  : comparison?.direction === 'new'
                    ? 'Baseline Period'
                    : 'Spending is stable'}
              </strong>
              <p className="text-xs text-muted">
                {comparison?.change_paise != null
                  ? `${formatINR(Math.abs(comparison.change_paise))} ${comparison.direction === 'down' ? 'saved' : 'increase'} compared to preceding range.`
                  : 'Track ongoing expenditures to generate automatic baseline comparisons.'}
              </p>
            </article>

            <article className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="stat-icon">
                  <Calendar className="h-4 w-4 text-primary" />
                </span>
                <span className="text-xs font-bold text-text uppercase tracking-wider">
                  Peak Velocity Day
                </span>
              </div>
              <strong className="text-sm font-bold text-text block mb-1">
                {largestDay ? `${formatDate(largestDay.date)}` : 'Even Distribution'}
              </strong>
              <p className="text-xs text-muted">
                {largestDay
                  ? `${formatINR(largestDay.total_paise)} recorded across ${largestDay.transaction_count} transaction${largestDay.transaction_count === 1 ? '' : 's'}.`
                  : 'No single outlier spike detected in this time interval.'}
              </p>
            </article>

            <article className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="stat-icon">
                  <PieChart className="h-4 w-4 text-primary" />
                </span>
                <span className="text-xs font-bold text-text uppercase tracking-wider">
                  Dominant Category
                </span>
              </div>
              <strong className="text-sm font-bold text-text block mb-1">
                {topType ? topType.name : 'Balanced Portfolio'}
              </strong>
              <p className="text-xs text-muted">
                {topType
                  ? `Represents ${formatPercent(topType.share_percent)}% of your expenses (${formatINR(topType.total_paise)}).`
                  : 'Expenditures are well distributed across active categories.'}
              </p>
            </article>
          </section>
        </>
      ) : (
        /* Intelligent Empty State with 1-Tap Period Quick Switchers */
        <Card className="p-8 sm:p-12 text-center mt-5">
          <div className="max-w-md mx-auto">
            <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shadow-lg shadow-primary/20">
              <TrendingUp className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-text font-display">No trend data in this range</h2>
            <p className="text-sm text-muted mt-2 mb-6">
              There are no recorded transactions between{' '}
              <span className="font-semibold text-text">{formatRangeLabel(period.range)}</span>. Switch to a wider range or record a transaction.
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
