import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Minus,
  PieChart,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { api, ApiError } from '@/services/api'
import type { WeeklyReportData } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'

export function WeeklyReportPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [report, setReport] = useState<WeeklyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState<number>(0)

  const getDatesForOffset = (offset: number) => {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    const day = now.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day

    const currentMonday = new Date(now)
    currentMonday.setDate(now.getDate() + diffToMonday)

    const targetMonday = new Date(currentMonday)
    targetMonday.setDate(currentMonday.getDate() - 7 * (offset + 1))

    const targetSunday = new Date(targetMonday)
    targetSunday.setDate(targetMonday.getDate() + 6)

    const formatYmd = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return {
      start: formatYmd(targetMonday),
      end: formatYmd(targetSunday),
    }
  }

  const loadReport = async () => {
    setLoading(true)
    setError(null)
    const { start, end } = getDatesForOffset(weekOffset)
    try {
      const data = await api.getWeeklyReport(start, end)
      setReport(data)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to generate weekly report. Check the backend server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!embedded) {
      document.title = 'Weekly spending report · MoneyTrack'
    }
  }, [embedded])

  useEffect(() => {
    loadReport()
  }, [weekOffset])

  const netCashflow = report?.net_cashflow_paise ?? 0
  const topCategories = report?.top_categories ?? []
  const largestExpenses = report?.largest_expenses ?? []
  const accountBreakdown = report?.account_breakdown ?? report?.account_spending ?? []

  const content = (
    <>
      {!embedded ? (
        <PageHeader
          eyebrow="Weekly digest"
          title="Weekly spending report"
          description="Monday-to-Sunday cashflow, savings rate and category movement."
        />
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-2 py-2 sm:px-3">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[40px] min-w-[40px]"
          onClick={() => setWeekOffset((prev) => prev + 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Older</span>
        </Button>

        <div className="min-w-0 text-center">
          <p className="flex items-center justify-center gap-1.5 truncate text-[12px] font-medium text-text">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{report?.period_label || 'Previous week'}</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
            {report ? `${formatDate(report.start_date)} – ${formatDate(report.end_date)}` : 'Loading…'}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="min-h-[40px] min-w-[40px]"
          disabled={weekOffset === 0}
          onClick={() => setWeekOffset((prev) => Math.max(0, prev - 1))}
        >
          <span className="hidden sm:inline">Newer</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadReport} />
      ) : !report ? (
        <Panel>
          <EmptyState
            icon={CalendarDays}
            title="No report data"
            description="A report could not be generated for this week. Try an earlier week."
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Panel className="p-4">
              <p className="text-[11px] font-medium text-muted">Total spent</p>
              <p className="mt-1.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em] text-text">
                {formatINR(report.total_expense_paise ?? 0)}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-[11px]">
                {report.comparison?.direction === 'down' ? (
                  <span className="flex items-center gap-1 font-medium text-positive">
                    <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                    {report.comparison.expense_change_percent != null
                      ? `${report.comparison.expense_change_percent}% vs prior`
                      : 'Lower than prior week'}
                  </span>
                ) : report.comparison?.direction === 'up' ? (
                  <span className="flex items-center gap-1 font-medium text-danger">
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    {report.comparison.expense_change_percent != null
                      ? `+${report.comparison.expense_change_percent}% vs prior`
                      : 'Higher than prior week'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted">
                    <Minus className="h-3 w-3" aria-hidden="true" /> Stable
                  </span>
                )}
              </p>
            </Panel>

            <Panel className="p-4">
              <p className="text-[11px] font-medium text-muted">Total income</p>
              <p className="mt-1.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em] text-positive">
                {formatINR(report.total_income_paise ?? 0)}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">Deposits and earnings</p>
            </Panel>

            <Panel className="p-4">
              <p className="text-[11px] font-medium text-muted">Net cashflow</p>
              <p
                className={cn(
                  'mt-1.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em]',
                  netCashflow < 0 ? 'text-danger' : 'text-positive',
                )}
              >
                {netCashflow >= 0 ? '+' : '−'}
                {formatINR(Math.abs(netCashflow))}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {netCashflow >= 0 ? 'Surplus retained' : 'Deficit spent'}
              </p>
            </Panel>

            <Panel className="p-4">
              <p className="text-[11px] font-medium text-muted">Savings rate</p>
              <p className="mt-1.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.02em] text-text">
                {(report.savings_rate_percent ?? 0).toFixed(1)}%
              </p>
              <p className="mt-1.5 text-[11px] text-muted">Of total earned</p>
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Top spending categories"
              description={`${topCategories.length} categor${topCategories.length === 1 ? 'y' : 'ies'} in this week`}
              action={<PieChart className="h-4 w-4 text-muted" aria-hidden="true" />}
            />
            {topCategories.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12px] text-muted">
                No category spending was recorded for this week.
              </p>
            ) : (
              <div className="space-y-3.5 p-4 sm:p-5">
                {topCategories.map((cat) => (
                  <div key={cat.category_id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate font-medium text-text">{cat.category_name}</span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {cat.transaction_count} txn{cat.transaction_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                        <span className="text-[10px] text-muted">{cat.share_percent ?? 0}%</span>
                        <span className="font-medium text-text">{formatINR(cat.total_paise ?? 0)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, cat.share_percent ?? 0))}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Largest expenses this week"
              description="Highest individual outflow"
            />
            {largestExpenses.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12px] text-muted">
                No individual expenses were logged.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {largestExpenses.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-text">
                        {item.merchant || item.category_name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        <span>{formatDate(item.expense_date)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{item.category_name}</span>
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-[12px] font-medium tabular-nums text-text">
                      {formatINR(item.amount_paise)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {accountBreakdown.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Account-wise expenditure"
                description="Where the week's outflow was charged"
                action={<CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />}
              />
              <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5">
                {accountBreakdown.map((acc) => (
                  <div
                    key={acc.account_id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-text">
                        {acc.bank_name || acc.account_name}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        {acc.account_name}
                        {acc.account_number_mask ? ` · ••${acc.account_number_mask}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[12px] font-medium tabular-nums text-text">
                        {formatINR(acc.total_spent_paise)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {acc.transaction_count} txn{acc.transaction_count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </>
  )

  if (embedded) return <div>{content}</div>
  return <AppPage>{content}</AppPage>
}

export default WeeklyReportPage
