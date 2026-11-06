import {
  ArrowDownLeft,
  ArrowRight,
  Building2,
  Calendar,
  Percent,
  Plus,
  Receipt,
  ReceiptText,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  WalletCards,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ComparisonBadge } from '@/components/ComparisonBadge'
import { FintechCard3D } from '@/components/FintechCard3D'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { QuickChipsModal } from '@/components/QuickChipsModal'
import { StatCard } from '@/components/StatCard'
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
import { formatDate } from '@/utils/dates'
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
        eyebrow="OVERVIEW"
        title="Where your money went"
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

      {/* 3D Holographic Fintech Card & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-center">
          <FintechCard3D
            totalPaise={summary?.total_paise ?? 0}
            transactionCount={summary?.transaction_count ?? 0}
            periodLabel={formatRangeLabel(period.range)}
            totalBankBalancePaise={cashflow?.consolidated_balance_paise}
            reportedBankBalancePaise={cashflow?.total_reported_balance_paise}
            linkedAccountsCount={cashflow?.bank_accounts?.length ?? 0}
            reconciled={cashflow ? cashflow.reconciliation_difference_paise === 0 : true}
            discrepancyPaise={cashflow?.reconciliation_difference_paise ?? 0}
            incomeTotalPaise={cashflow?.total_income_paise ?? 0}
            onAddExpense={() => openCreate()}
            onAddIncome={() => navigate('/income')}
            onTransfer={() => navigate('/transfers')}
            onScanReceipt={() => openScanReceipt()}
            onManageAccounts={() => navigate('/bank-accounts')}
            onOpenSearch={() =>
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }
          />
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between">
          {/* Quick Expense Logging Chips */}
          <div className="card p-4 sm:p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-primary-soft text-primary">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-text uppercase tracking-wider">
                  1-Tap Quick Log
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted hidden sm:inline">Tap to record immediately</span>
                <button
                  type="button"
                  onClick={() => setIsEditChipsOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-primary-soft text-[11px] font-semibold text-text hover:text-primary border border-border hover:border-primary/40 transition-colors"
                  title="Customize shortcuts and prices"
                >
                  <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {quickChips.map((chip) => (
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-raised hover:bg-primary-soft border border-border hover:border-primary/40 text-text hover:text-primary transition-all shrink-0 active:scale-95 shadow-2xs"
                >
                  <span>{chip.label}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIsEditChipsOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-surface-raised/40 hover:bg-surface-raised border border-dashed border-border hover:border-primary/40 text-muted hover:text-text transition-all shrink-0 active:scale-95"
                title="Add or edit quick shortcuts"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Customize</span>
              </button>
            </div>
          </div>

          {/* Bank Accounts Mini Strip */}
          {cashflow?.bank_accounts && cashflow.bank_accounts.length > 0 ? (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-sky-500/10 text-sky-500">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold text-text uppercase tracking-wider">
                    Linked Bank Accounts ({cashflow.bank_accounts.length})
                  </span>
                </div>
                <Link
                  to="/bank-accounts"
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <span>Manage</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {cashflow.bank_accounts.slice(0, 4).map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => navigate('/bank-accounts')}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface-raised border border-border hover:border-primary/30 transition-all cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-xs text-text truncate">{acc.name}</div>
                      <div className="text-[10px] text-muted flex items-center gap-1">
                        <span>{acc.bank_name}</span>
                        {acc.account_number_mask && <span>· ••{acc.account_number_mask}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs font-bold text-text">
                        {formatINR(acc.current_balance_paise)}
                      </div>
                      <div className="text-[9px] text-muted uppercase">
                        {acc.account_type.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Spending Velocity & Burn Meter */
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Daily Velocity & Pace
                </span>
                <Badge tone="positive">Steady Outflow</Badge>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <span className="text-2xl font-bold text-text font-display">
                    {formatINR(summary?.average_paise ?? 0)}
                  </span>
                  <span className="text-xs text-muted ml-1.5">/ active day</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted block">Period Average</span>
                  <span className="text-xs font-semibold text-text">
                    {summary && summary.transaction_count > 0
                      ? formatINR(Math.round(summary.total_paise / summary.transaction_count))
                      : '₹0'}
                    <span className="text-[10px] text-muted ml-1">/ tx</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cashflow & Financial Intelligence Grid */}
      <section className="stat-grid mb-5" aria-label="Cashflow and savings metrics">
        <StatCard
          label="Period Income"
          value={formatINR(cashflow?.total_income_paise ?? 0)}
          icon={ArrowDownLeft}
          detail="Total credited inflows"
        />
        <StatCard
          label="Period Outflow"
          value={formatINR(summary?.total_paise ?? 0)}
          icon={WalletCards}
          detail={
            summary?.comparison ? (
              <span className="flex items-center gap-1.5">
                <ComparisonBadge
                  direction={summary.comparison.direction}
                  changePercent={summary.comparison.change_percent}
                  changePaise={summary.comparison.change_paise}
                />
                <span>from last period</span>
              </span>
            ) : (
              'All recorded expenses'
            )
          }
        />
        <StatCard
          label="Net Cash Flow"
          value={formatINR(cashflow?.net_cashflow_paise ?? 0)}
          icon={TrendingUp}
          detail={(cashflow?.net_cashflow_paise ?? 0) >= 0 ? 'Net Surplus / Saved' : 'Deficit period'}
        />
        <StatCard
          label="Savings Rate"
          value={`${cashflow?.savings_rate_percent?.toFixed(1) ?? '0.0'}%`}
          icon={Percent}
          detail={
            cashflow?.consolidated_balance_paise != null
              ? `Net Worth: ${formatINR(cashflow.consolidated_balance_paise)}`
              : 'Active accounts'
          }
        />
      </section>

      <section className="stat-grid" aria-label="Key spending metrics">
        <StatCard
          label="Total spent"
          value={formatINR(summary?.total_paise ?? 0)}
          icon={WalletCards}
          detail={
            summary?.comparison ? (
              <span className="flex items-center gap-1.5">
                <ComparisonBadge
                  direction={summary.comparison.direction}
                  changePercent={summary.comparison.change_percent}
                  changePaise={summary.comparison.change_paise}
                />
                <span>from last period</span>
              </span>
            ) : (
              'Current period spend'
            )
          }
        />
        <StatCard
          label="Transactions"
          value={String(summary?.transaction_count ?? 0)}
          icon={ReceiptText}
          detail={
            summary?.comparison?.previous_transaction_count != null ? (
              <span>
                {summary.transaction_count - summary.comparison.previous_transaction_count >= 0 ? '+' : ''}
                {summary.transaction_count - summary.comparison.previous_transaction_count} vs last period
              </span>
            ) : (
              'Recorded transactions'
            )
          }
        />
        <StatCard
          label="Daily average"
          value={formatINR(summary?.average_paise ?? 0)}
          icon={Calendar}
          detail="Across active days"
        />
        <StatCard
          label="Highest expense"
          value={
            summary?.highest_expense
              ? formatINR(summary.highest_expense.amount_paise)
              : '₹0.00'
          }
          icon={TrendingUp}
          detail={
            summary?.highest_expense
              ? `${summary.highest_expense.expense_type?.name ?? 'Expense'} · ${formatDate(summary.highest_expense.expense_date)}`
              : 'No recorded expenses'
          }
        />
      </section>

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
                  <p>Where your money went</p>
                </div>
                <Link
                  to={`/breakdown?${period.periodSearch}`}
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
                    <div className="text-[11px] font-semibold tracking-wider text-muted uppercase mb-2.5">
                      Top Outflow Shares
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
                            <span className="text-muted font-mono text-[11px] shrink-0">
                              {formatINR(item.total_paise)} ({item.share_percent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-border/60 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
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
                <p>Your latest recorded expenses</p>
              </div>
              <Link
                to={`/expenses?${period.periodSearch}`}
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
