import { useEffect, useState } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  PieChart,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { api, ApiError } from '@/services/api'
import type { WeeklyReportData } from '@/types/api'
import { cn } from '@/utils/cn'

export function WeeklyReportPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [report, setReport] = useState<WeeklyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState<number>(0) // 0 = previous complete week, 1 = 2 weeks ago, etc.

  // Calculate Monday to Sunday dates based on weekOffset
  const getDatesForOffset = (offset: number) => {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    // Current day of week (0 is Sunday, 1 is Monday... 6 is Saturday)
    const day = now.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day

    const currentMonday = new Date(now)
    currentMonday.setDate(now.getDate() + diffToMonday)

    // Previous complete week Monday is currentMonday - 7 days
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
    loadReport()
  }, [weekOffset])

  const formatInr = (paise: number) => {
    const rupees = Math.abs(paise) / 100
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 pb-20'}>
      {!embedded && (
        <PageHeader
          title="Weekly Spending Report"
          description="Comprehensive Monday-to-Sunday financial digest with cashflow, savings rate, and category breakdowns."
        />
      )}

      {/* Week Selector Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-line/60 bg-surface-card p-3 shadow-soft">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => setWeekOffset((prev) => prev + 1)}
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Older</span>
        </Button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary">
            <Calendar className="h-3.5 w-3.5" />
            <span>{report?.period_label || 'Previous Week'}</span>
          </div>
          <div className="text-[11px] text-muted">
            {report ? `${report.start_date} to ${report.end_date}` : 'Calculating...'}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          disabled={weekOffset === 0}
          onClick={() => setWeekOffset((prev) => Math.max(0, prev - 1))}
        >
          <span className="hidden sm:inline">Newer</span>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadReport} />
      ) : !report ? (
        <EmptyState
          icon={Calendar}
          title="No report data"
          description="Could not generate report for the selected weekly period."
        />
      ) : (
        <div className="space-y-6">
          {/* Key KPI Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Spent */}
            <div className="rounded-2xl border border-line/60 bg-surface-card p-4 shadow-soft">
              <div className="text-xs font-medium text-muted">Total Spent</div>
              <div className="mt-1 font-display text-xl sm:text-2xl font-bold text-ink">
                {formatInr(report.total_expense_paise ?? 0)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                {report.comparison?.direction === 'down' ? (
                  <span className="flex items-center text-emerald-400 font-medium">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    {report.comparison.expense_change_percent != null
                      ? `${report.comparison.expense_change_percent}% vs prior`
                      : 'Decreased vs prior'}
                  </span>
                ) : report.comparison?.direction === 'up' ? (
                  <span className="flex items-center text-rose-400 font-medium">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {report.comparison.expense_change_percent != null
                      ? `+${report.comparison.expense_change_percent}% vs prior`
                      : 'Increased vs prior'}
                  </span>
                ) : (
                  <span className="text-muted flex items-center">
                    <Minus className="h-3.5 w-3.5" /> Stable
                  </span>
                )}
              </div>
            </div>

            {/* Total Income */}
            <div className="rounded-2xl border border-line/60 bg-surface-card p-4 shadow-soft">
              <div className="text-xs font-medium text-muted">Total Income</div>
              <div className="mt-1 font-display text-xl sm:text-2xl font-bold text-emerald-400">
                {formatInr(report.total_income_paise ?? 0)}
              </div>
              <div className="mt-2 text-[11px] text-muted">Deposits & earnings</div>
            </div>

            {/* Net Cashflow */}
            <div className="rounded-2xl border border-line/60 bg-surface-card p-4 shadow-soft">
              <div className="text-xs font-medium text-muted">Net Cashflow</div>
              <div
                className={cn(
                  'mt-1 font-display text-xl sm:text-2xl font-bold',
                  (report.net_cashflow_paise ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {(report.net_cashflow_paise ?? 0) >= 0 ? '+' : ''}
                {formatInr(report.net_cashflow_paise ?? 0)}
              </div>
              <div className="mt-2 text-[11px] text-muted">
                {(report.net_cashflow_paise ?? 0) >= 0 ? 'Surplus retained' : 'Deficit spent'}
              </div>
            </div>

            {/* Savings Rate */}
            <div className="rounded-2xl border border-line/60 bg-surface-card p-4 shadow-soft">
              <div className="text-xs font-medium text-muted">Savings Rate</div>
              <div className="mt-1 font-display text-xl sm:text-2xl font-bold text-sky-400">
                {(report.savings_rate_percent ?? 0).toFixed(1)}%
              </div>
              <div className="mt-2 text-[11px] text-muted">Of total earned</div>
            </div>
          </div>

          {/* Category Breakdown Progress Bars */}
          {(() => {
            const topCategories = report.top_categories ?? []
            return (
              <div className="rounded-[1.5rem] border border-line/60 bg-surface-card p-5 shadow-soft space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                    <PieChart className="h-4 w-4 text-primary" />
                    <span>Top Spending Categories</span>
                  </div>
                  <span className="text-xs text-muted">{topCategories.length} categories</span>
                </div>

                {topCategories.length === 0 ? (
                  <p className="text-xs text-muted py-4 text-center">No category spending recorded for this week.</p>
                ) : (
                  <div className="space-y-3.5">
                    {topCategories.map((cat) => (
                      <div key={cat.category_id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-medium text-ink">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span>{cat.category_name}</span>
                            <span className="text-[11px] text-muted">({cat.transaction_count} txns)</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-muted text-[11px]">{cat.share_percent ?? 0}%</span>
                            <span className="font-bold text-ink">{formatInr(cat.total_paise ?? 0)}</span>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-line/60">
                          <div
                            className="h-full rounded-full transition-all duration-500"
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
              </div>
            )
          })()}

          {/* Largest Individual Expenses */}
          {(() => {
            const largestExpenses = report.largest_expenses ?? []
            return (
              <div className="rounded-[1.5rem] border border-line/60 bg-surface-card p-5 shadow-soft space-y-3">
                <h3 className="font-display text-sm font-bold text-ink">Largest Expenses This Week</h3>
                {largestExpenses.length === 0 ? (
                  <p className="text-xs text-muted py-2 text-center">No individual expenses logged.</p>
                ) : (
                  <div className="divide-y divide-line/40">
                    {largestExpenses.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-3">
                        <div className="space-y-0.5">
                          <div className="font-medium text-ink text-xs">
                            {item.merchant || item.category_name}
                          </div>
                          <div className="text-[10px] text-muted flex items-center gap-2">
                            <span>{item.expense_date}</span>
                            <span>•</span>
                            <span style={{ color: item.color }}>{item.category_name}</span>
                          </div>
                        </div>
                        <div className="font-display font-bold text-xs text-ink">
                          {formatInr(item.amount_paise)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Account Breakdown */}
          {(() => {
            const accountBreakdown = report.account_breakdown ?? report.account_spending ?? []
            if (accountBreakdown.length === 0) return null
            return (
              <div className="rounded-[1.5rem] border border-line/60 bg-surface-card p-5 shadow-soft space-y-3">
                <div className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span>Account-Wise Expenditure</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {accountBreakdown.map((acc) => (
                    <div
                      key={acc.account_id}
                      className="rounded-xl border border-line/50 bg-surface/50 p-3.5 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-ink text-xs">{acc.bank_name || acc.account_name}</div>
                        <div className="text-[11px] text-muted">
                          {acc.account_name} {acc.account_number_mask ? `(..${acc.account_number_mask})` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display font-bold text-xs text-ink">
                          {formatInr(acc.total_spent_paise)}
                        </div>
                        <div className="text-[10px] text-muted">{acc.transaction_count} txns</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export default WeeklyReportPage
