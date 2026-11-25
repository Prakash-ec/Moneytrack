import {
  BarChart3,
  CalendarDays,
  Clock,
  Layers,
  LineChart,
  PieChart,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { Granularity } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel, suggestedGranularity, type PeriodPreset } from '@/utils/periods'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  icon: typeof Wallet
  tone?: 'default' | 'positive' | 'danger'
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <p
        className={cn(
          'mt-1.5 truncate font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em]',
          tone === 'positive' ? 'text-positive' : tone === 'danger' ? 'text-danger' : 'text-text',
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-muted">{hint}</p>
    </Panel>
  )
}

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
    () => series.reduce((sum, point) => sum + (point.total_paise || 0), 0),
    [series],
  )
  const totalTxCount = useMemo(
    () => series.reduce((sum, point) => sum + (point.transaction_count || 0), 0),
    [series],
  )
  const activePeriodCount = useMemo(
    () => series.filter((point) => (point.total_paise || 0) > 0).length,
    [series],
  )

  const hasExpenses =
    totalPeriodSpend > 0 ||
    totalTxCount > 0 ||
    (comparison?.current_transaction_count ?? 0) > 0 ||
    (trends?.largest_days && trends.largest_days.length > 0)

  const largestDay = trends?.largest_days?.[0]
  const topType = trends?.rankings?.[0]

  const averagePerActivePeriod =
    activePeriodCount > 0 ? Math.round(totalPeriodSpend / activePeriodCount) : 0
  const averagePerBucket = series.length > 0 ? Math.round(totalPeriodSpend / series.length) : 0

  const dayOfWeekStats = useMemo(() => {
    if (!series.length) return []
    const totals = [0, 0, 0, 0, 0, 0, 0]
    const counts = [0, 0, 0, 0, 0, 0, 0]

    for (const point of series) {
      if (!point.total_paise) continue
      const day = new Date(point.date).getDay()
      totals[day] += point.total_paise
      counts[day] += point.transaction_count
    }

    const maxSpend = Math.max(...totals, 1)
    const order = [1, 2, 3, 4, 5, 6, 0]
    return order.map((dayIndex) => ({
      name: DAY_NAMES[dayIndex],
      total: totals[dayIndex],
      count: counts[dayIndex],
      pctOfMax: (totals[dayIndex] / maxSpend) * 100,
    }))
  }, [series])

  const dynamics = useMemo(() => {
    if (!series.length || totalPeriodSpend === 0) return null
    let weekdayPaise = 0
    let weekendPaise = 0

    for (const point of series) {
      const day = new Date(point.date).getDay()
      if (day === 0 || day === 6) weekendPaise += point.total_paise || 0
      else weekdayPaise += point.total_paise || 0
    }

    const total = weekdayPaise + weekendPaise
    return {
      weekdayPaise,
      weekendPaise,
      weekdayPct: total > 0 ? (weekdayPaise * 100) / total : 0,
      weekendPct: total > 0 ? (weekendPaise * 100) / total : 0,
    }
  }, [series, totalPeriodSpend])

  const content = (() => {
    if (loading) return <PageSkeleton />

    if (error) {
      return (
        <ErrorState
          title="Could not load trends"
          description={error instanceof Error ? error.message : 'The trends request failed.'}
          onRetry={() => {
            trendsQuery.refetch()
            comparisonQuery.refetch()
          }}
        />
      )
    }

    return (
      <>
        {!embedded ? (
          <PageHeader
            eyebrow="Analytics"
            title="Spending trends"
            description={`${formatRangeLabel(period.range)} · How outflow moves over time`}
            actions={
              <PeriodPicker
                preset={period.preset}
                range={period.range}
                onPresetChange={period.setPreset}
                onCustomChange={period.setCustomRange}
              />
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
                label="Period outflow"
                value={formatINR(totalPeriodSpend)}
                hint={
                  comparison?.change_percent != null
                    ? `${comparison.direction === 'down' ? '−' : '+'}${formatPercent(
                        Math.abs(comparison.change_percent),
                      )}% vs previous period`
                    : `${totalTxCount} transactions`
                }
                icon={Wallet}
                tone={
                  comparison?.change_percent != null
                    ? comparison.direction === 'down'
                      ? 'positive'
                      : 'danger'
                    : 'default'
                }
              />
              <Metric
                label="Average per active period"
                value={formatINR(averagePerActivePeriod)}
                hint={`${activePeriodCount} ${granularity} bucket${activePeriodCount === 1 ? '' : 's'} with spend`}
                icon={Clock}
              />
              <Metric
                label="Peak day"
                value={largestDay ? formatINR(largestDay.total_paise) : '—'}
                hint={largestDay ? formatDate(largestDay.date) : 'No single-day spike'}
                icon={CalendarDays}
              />
              <Metric
                label="Data points"
                value={String(series.length)}
                hint={`${granularity} buckets · avg ${formatINR(averagePerBucket)}`}
                icon={Layers}
              />
            </div>

            <Panel className="mt-3">
              <PanelHeader
                title="Outflow over time"
                description={formatRangeLabel(period.range)}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <div
                      className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
                      role="group"
                      aria-label="Chart style"
                    >
                      {(
                        [
                          ['area', 'Area', LineChart],
                          ['bar', 'Bars', BarChart3],
                        ] as const
                      ).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setChartVariant(value)}
                          aria-pressed={chartVariant === value}
                          className={cn(
                            'inline-flex h-7 items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors',
                            chartVariant === value
                              ? 'bg-surface-raised text-text'
                              : 'text-muted hover:text-text',
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <div
                      className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5"
                      role="group"
                      aria-label="Bucket size"
                    >
                      {(['daily', 'weekly', 'monthly'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setGranularity(value)}
                          aria-pressed={granularity === value}
                          className={cn(
                            'inline-flex h-7 items-center rounded px-2 text-[10px] font-medium capitalize transition-colors',
                            granularity === value
                              ? 'bg-surface-raised text-text'
                              : 'text-muted hover:text-text',
                          )}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              />
              <div className="px-2 py-4 sm:px-4">
                <TrendChart
                  series={series}
                  granularity={granularity}
                  variant={chartVariant}
                  height={290}
                />
              </div>
            </Panel>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  title="Day of week"
                  description="Outflow grouped by weekday across the range"
                />
                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {dayOfWeekStats.map((item) => (
                      <div key={item.name} className="flex flex-col items-center gap-1.5 text-center">
                        <div className="flex h-28 w-full flex-col justify-end rounded-md border border-border bg-surface-raised p-1">
                          <div
                            className="w-full rounded-sm bg-primary transition-all"
                            style={{
                              height: `${Math.max(4, item.pctOfMax)}%`,
                              opacity: 0.35 + (item.pctOfMax / 100) * 0.65,
                            }}
                            title={`${item.name}: ${formatINR(item.total)} (${item.count} transactions)`}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-text">{item.name}</span>
                        <span className="font-mono text-[9px] tabular-nums text-muted">
                          {item.total > 0 ? `₹${Math.round(item.total / 100)}` : '₹0'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              {dynamics ? (
                <Panel>
                  <PanelHeader
                    title="Weekday vs weekend"
                    description="How much of the outflow lands on workdays"
                    action={
                      <Badge
                        tone={dynamics.weekdayPct >= dynamics.weekendPct ? 'primary' : 'warning'}
                      >
                        {dynamics.weekdayPct >= dynamics.weekendPct ? 'Mostly weekdays' : 'Mostly weekends'}
                      </Badge>
                    }
                  />
                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                    <div className="rounded-lg border border-border bg-surface-raised p-3.5">
                      <p className="text-[11px] font-medium text-muted">Weekdays (Mon–Fri)</p>
                      <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-text">
                        {formatINR(dynamics.weekdayPaise)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {dynamics.weekdayPct.toFixed(0)}% of period spend
                      </p>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${dynamics.weekdayPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-raised p-3.5">
                      <p className="text-[11px] font-medium text-muted">Weekends (Sat–Sun)</p>
                      <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-text">
                        {formatINR(dynamics.weekendPaise)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {dynamics.weekendPct.toFixed(0)}% of period spend
                      </p>
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-warning"
                          style={{ width: `${dynamics.weekendPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Panel>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Panel className="p-4">
                <div className="flex items-center gap-2">
                  {comparison?.direction === 'down' ? (
                    <TrendingDown className="h-3.5 w-3.5 text-positive" aria-hidden="true" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  )}
                  <p className="text-[11px] font-medium text-muted">Compared with previous period</p>
                </div>
                <p className="mt-2 text-[13px] font-medium text-text">
                  {comparison?.change_percent != null
                    ? `Spending ${comparison.direction === 'down' ? 'fell' : 'rose'} ${formatPercent(
                        Math.abs(comparison.change_percent),
                      )}%`
                    : comparison?.direction === 'new'
                      ? 'No earlier period to compare'
                      : 'Spending is broadly unchanged'}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {comparison?.change_paise != null
                    ? `${formatINR(Math.abs(comparison.change_paise))} ${
                        comparison.direction === 'down' ? 'less' : 'more'
                      } than the preceding range.`
                    : 'A comparison appears once an earlier range has recorded spend.'}
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <p className="text-[11px] font-medium text-muted">Highest single day</p>
                </div>
                <p className="mt-2 text-[13px] font-medium text-text">
                  {largestDay ? formatDate(largestDay.date) : 'Evenly distributed'}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {largestDay
                    ? `${formatINR(largestDay.total_paise)} across ${largestDay.transaction_count} transaction${
                        largestDay.transaction_count === 1 ? '' : 's'
                      }.`
                    : 'No single day stands out in this range.'}
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center gap-2">
                  <PieChart className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  <p className="text-[11px] font-medium text-muted">Largest category</p>
                </div>
                <p className="mt-2 text-[13px] font-medium text-text">
                  {topType ? topType.name : 'No dominant category'}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {topType
                    ? `${formatPercent(topType.share_percent)}% of spend (${formatINR(topType.total_paise)}).`
                    : 'Spending is spread across the recorded categories.'}
                </p>
              </Panel>
            </div>
          </>
        ) : (
          <Panel className="mt-4">
            <EmptyState
              icon={TrendingUp}
              title="No trend data in this range"
              description={`Nothing was recorded for ${formatRangeLabel(period.range)}. Try a wider range or add an expense.`}
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
