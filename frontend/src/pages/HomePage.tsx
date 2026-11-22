import {
  ArrowRight,
  Building2,
  Plus,
  Receipt,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { CashflowHeroCard } from '@/components/CashflowHeroCard'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { QuickChipsModal } from '@/components/QuickChipsModal'
import { TransactionRow } from '@/components/TransactionRow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { ExpenseDonut } from '@/components/charts/ExpenseDonut'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import { formatINR } from '@/utils/currency'
import { formatRangeLabel, suggestedGranularity } from '@/utils/periods'
import { getStoredQuickChips, type QuickExpenseChip } from '@/utils/quickChips'

export function HomePage() {
  useDocumentTitle('Overview')
  const period = usePeriod()
  const navigate = useNavigate()
  const { openCreate, openEdit, openScanReceipt } = useExpenseDialog()
  const { start, end } = period.range
  const granularity = suggestedGranularity(period.range)

  const [quickChips, setQuickChips] = useState<QuickExpenseChip[]>(() => getStoredQuickChips())
  const [isEditChipsOpen, setIsEditChipsOpen] = useState(false)

  useEffect(() => {
    const handleChipsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<QuickExpenseChip[]>
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setQuickChips(customEvent.detail)
      } else {
        setQuickChips(getStoredQuickChips())
      }
    }
    window.addEventListener('moneytrack:quick-chips-changed', handleChipsUpdate)
    return () => window.removeEventListener('moneytrack:quick-chips-changed', handleChipsUpdate)
  }, [])

  const summaryQuery = useApiQuery(['summary', start, end], () =>
    api.analyticsSummary({ start_date: start, end_date: end }),
  )
  const cashflowQuery = useApiQuery(['cashflow', start, end], () =>
    api.getCashFlowSummary({ start_date: start, end_date: end }),
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
      page_size: 5,
    }),
  )

  const summary = summaryQuery.data
  const cashflow = cashflowQuery.data
  const loading = summaryQuery.loading && !summary
  const error = summaryQuery.error ?? byTypeQuery.error ?? trendsQuery.error ?? recentQuery.error
  const hasExpenses = Boolean(summary && summary.transaction_count > 0)

  const retryAll = () => {
    summaryQuery.refetch()
    cashflowQuery.refetch()
    byTypeQuery.refetch()
    trendsQuery.refetch()
    recentQuery.refetch()
  }

  // Auto-refresh financial overview on background or SMS ingestion events
  useEffect(() => {
    const handleSmsChanged = () => {
      retryAll()
    }
    window.addEventListener('moneytrack:sms-changed', handleSmsChanged)
    return () => window.removeEventListener('moneytrack:sms-changed', handleSmsChanged)
  }, [summaryQuery, cashflowQuery, recentQuery, byTypeQuery, trendsQuery])

  if (loading) {
    return <PageSkeleton />
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load your overview"
          description={typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error'}
          onRetry={retryAll}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Overview"
        title="Financial overview"
        description={`${formatRangeLabel(period.range)} · Asia/Kolkata`}
        actions={
          <div className="flex items-center gap-2">
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

      {/* Financial Overview & Quick Actions */}
      {(() => {
        const accountsList = cashflow?.bank_accounts ?? (cashflow as any)?.accounts ?? []
        const totalBalance =
          (cashflow?.consolidated_balance_paise || (cashflow as any)?.total_bank_balance_paise) ||
          cashflow?.total_reported_balance_paise ||
          0
        const reportedBalance = cashflow?.total_reported_balance_paise
        const accountsCount = accountsList.length || (cashflow as any)?.account_count || 0
        const discrepancyPaise =
          cashflow?.reconciliation_difference_paise ??
          (reportedBalance != null && totalBalance != null ? Math.abs(reportedBalance - totalBalance) : 0)
        const isReconciled = discrepancyPaise === 0

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <CashflowHeroCard
                totalPaise={summary?.total_paise ?? 0}
                transactionCount={summary?.transaction_count ?? 0}
                periodLabel={formatRangeLabel(period.range)}
                totalBankBalancePaise={totalBalance}
                reportedBankBalancePaise={reportedBalance}
                linkedAccountsCount={accountsCount}
                reconciled={isReconciled}
                discrepancyPaise={discrepancyPaise}
                incomeTotalPaise={cashflow?.total_income_paise ?? 0}
                onAddExpense={() => openCreate()}
                onAddIncome={() => navigate('/transactions?tab=income')}
                onTransfer={() => navigate('/transactions?tab=transfers')}
                onScanReceipt={() => openScanReceipt()}
                onManageAccounts={() => navigate('/bank-accounts')}
              />
            </div>

            <div className="lg:col-span-6 flex flex-col justify-between">
              {/* Bank Accounts Mini Strip */}
              {accountsList.length > 0 ? (
                <div className="card p-5 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted" aria-hidden="true" />
                        <span className="text-xs font-semibold text-text">
                          Linked accounts ({accountsCount})
                        </span>
                      </div>
                      <Link
                        to="/bank-accounts"
                        className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        <span>Manage</span>
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {accountsList.slice(0, 4).map((acc: any) => (
                        <div
                          key={acc.id}
                          onClick={() => navigate('/bank-accounts')}
                          className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border hover:border-border-strong transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-medium text-xs text-text truncate">
                              {acc.name || acc.account_name}
                            </div>
                            <div className="text-[10px] text-muted flex items-center gap-1">
                              <span>{acc.bank_name}</span>
                              {acc.account_number_mask && (
                                <span className="font-mono tabular-nums">· ••{acc.account_number_mask}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono tabular-nums text-xs font-semibold text-text">
                              {formatINR(acc.current_balance_paise || acc.last_reported_balance_paise || 0)}
                            </div>
                            {acc.last_reported_balance_paise != null ? (
                              <div className="text-[10px] text-sky-400 font-mono tabular-nums">
                                SMS: {formatINR(acc.last_reported_balance_paise)}
                              </div>
                            ) : (
                              <div className="text-[10px] text-muted capitalize">
                                {acc.account_type?.replace('_', ' ') || 'account'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

              {/* Quick Record Chips Mini-Bar */}
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted mr-1">Quick:</span>
                  {quickChips.slice(0, 3).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() =>
                        openCreate({
                          amount: chip.amount,
                          merchant: chip.merchant,
                          note: chip.note,
                          payment_method: chip.payment_method ? (chip.payment_method as any) : 'UPI',
                        })
                      }
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-surface-raised hover:bg-surface border border-border text-text transition-colors shrink-0"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditChipsOpen(true)}
                  className="text-[11px] text-muted hover:text-text font-medium ml-2 shrink-0"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            /* Spending Velocity & Burn Meter */
            <div className="card p-5 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-text">
                    Average daily spend
                  </span>
                  <Badge tone="neutral">Pace</Badge>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <div>
                    <span className="text-2xl font-semibold text-text font-mono tabular-nums">
                      {formatINR(summary?.average_paise ?? 0)}
                    </span>
                    <span className="text-xs text-muted ml-1.5">/ active day</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-muted block">Period average</span>
                    <span className="text-xs font-medium text-text font-mono tabular-nums">
                      {summary && summary.transaction_count > 0
                        ? formatINR(Math.round(summary.total_paise / summary.transaction_count))
                        : '₹0'}
                      <span className="text-[10px] text-muted ml-1">/ transaction</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => navigate('/bank-accounts')}>
                  <span>+ Link bank account</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  })()}

      {hasExpenses ? (
        <>
          <section className="dashboard-grid">
            <article className="card chart-card wide">
              <div className="card-header">
                <div>
                  <h2>Spending over time</h2>
                  <p>Daily expenses for {formatRangeLabel(period.range)}</p>
                </div>
                <div className="chart-total">
                  <span>This period</span>
                  <strong>{formatINR(summary?.total_paise ?? 0)}</strong>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <TrendChart
                  series={trendsQuery.data?.series ?? []}
                  granularity={granularity}
                  variant="bar"
                  height={250}
                />
              </div>
            </article>

            <article className="card breakdown-card">
              <div className="card-header">
                <div>
                  <h2>By expense type</h2>
                  <p>Categorized outflow</p>
                </div>
                <Link
                  to={`/analytics?view=breakdown&${period.periodSearch}`}
                  className="button button-ghost button-sm text-primary flex items-center gap-1"
                >
                  <span>View breakdown</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="p-4 sm:p-5">
                <ExpenseDonut
                  items={byTypeQuery.data?.items ?? []}
                  totalPaise={summary?.total_paise ?? 0}
                  onSelect={(typeId) => navigate(`/expense-types/${typeId}`)}
                />

                {byTypeQuery.data?.items && byTypeQuery.data.items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="text-[11px] font-medium text-muted mb-2.5">
                      Top expense shares
                    </div>
                    <div className="space-y-2.5">
                      {byTypeQuery.data.items.slice(0, 3).map((item) => (
                        <div key={item.expense_type_id}>
                          <div className="flex justify-between items-center text-xs mb-1 gap-2 min-w-0">
                            <span className="font-medium text-text flex items-center gap-1.5 min-w-0 flex-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color || 'var(--primary)' }}
                              />
                              <span className="truncate flex-1">{item.name}</span>
                            </span>
                            <span className="text-muted font-mono tabular-nums text-[11px] shrink-0">
                              {formatINR(item.total_paise)} ({item.share_percent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-border/60 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(5, item.share_percent))}%`,
                                backgroundColor: item.color || 'var(--primary)',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="card transaction-card mt-5">
            <div className="card-header">
              <div>
                <h2>Recent transactions</h2>
                <p>Latest recorded activity</p>
              </div>
              <Link
                to={`/transactions?${period.periodSearch}`}
                className="button button-ghost button-sm text-primary flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div>
              {recentQuery.data?.items?.map((expense) => (
                <TransactionRow
                  key={expense.id}
                  expense={expense}
                  onEdit={openEdit}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <Card className="p-8 text-center mt-5">
          <EmptyState
            icon={Receipt}
            title="No expenses for this period"
            description="You don't have any expenditure recorded for this time range. Add your first expense or adjust the reporting period above."
            action={
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add first expense</span>
              </Button>
            }
          />
        </Card>
      )}

      {/* Quick Log Customization Modal */}
      <QuickChipsModal
        open={isEditChipsOpen}
        onClose={() => setIsEditChipsOpen(false)}
        onChipsChanged={(updated) => setQuickChips(updated)}
      />
    </div>
  )
}
