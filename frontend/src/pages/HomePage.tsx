import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Plus,
  Receipt,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { PeriodPicker } from '@/components/PeriodPicker'
import { QuickChipsModal } from '@/components/QuickChipsModal'
import { TransactionRow } from '@/components/TransactionRow'
import { PageHeader } from '@/components/PageHeader'
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
import { cn } from '@/utils/cn'
import { formatINR, formatSignedINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel, rangeLength, suggestedGranularity } from '@/utils/periods'
import { getStoredQuickChips, type QuickExpenseChip } from '@/utils/quickChips'

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint: string
  icon: typeof ArrowDownLeft
  tone?: 'positive' | 'danger' | 'neutral' | 'primary'
}) {
  const toneClass = {
    positive: 'text-positive',
    danger: 'text-danger',
    neutral: 'text-text',
    primary: 'text-primary',
  }[tone]
  const iconClass = {
    positive: 'bg-positive-soft text-positive',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-surface-raised text-muted',
    primary: 'bg-primary-soft text-primary',
  }[tone]

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted">{label}</p>
        <p className={cn('mt-0.5 truncate font-mono text-[17px] font-medium tabular-nums tracking-[-0.02em]', toneClass)}>
          {value}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted">{hint}</p>
      </div>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', iconClass)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </div>
  )
}

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
    const handleChipsUpdate = (event: Event) => {
      const custom = event as CustomEvent<QuickExpenseChip[]>
      setQuickChips(Array.isArray(custom.detail) ? custom.detail : getStoredQuickChips())
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
    api.listExpenses({ start_date: start, end_date: end, sort: 'date_desc', page: 1, page_size: 6 }),
  )

  const summary = summaryQuery.data
  const cashflow = cashflowQuery.data
  const loading = summaryQuery.loading && !summary
  const error =
    summaryQuery.error ??
    cashflowQuery.error ??
    byTypeQuery.error ??
    trendsQuery.error ??
    recentQuery.error

  const retryAll = () => {
    summaryQuery.refetch()
    cashflowQuery.refetch()
    byTypeQuery.refetch()
    trendsQuery.refetch()
    recentQuery.refetch()
  }

  useEffect(() => {
    const handleSmsChanged = () => retryAll()
    window.addEventListener('moneytrack:sms-changed', handleSmsChanged)
    return () => window.removeEventListener('moneytrack:sms-changed', handleSmsChanged)
  })

  const derived = useMemo(() => {
    const accounts = cashflow?.bank_accounts ?? cashflow?.accounts ?? []
    const balance = cashflow?.consolidated_balance_paise ?? cashflow?.total_bank_balance_paise ?? 0
    const reported = cashflow?.total_reported_balance_paise ?? null
    const discrepancy = reported == null ? null : Math.abs(reported - balance)
    const accountCount = accounts.length || cashflow?.account_count || 0
    const days = Math.max(1, rangeLength(period.range))
    const spent = summary?.total_paise ?? 0
    const received = cashflow?.total_income_paise ?? 0
    const net = cashflow?.net_cashflow_paise ?? received - spent
    const transactionCount = summary?.transaction_count ?? 0
    const dailyAverage = Math.round(spent / days)
    const perTransaction = transactionCount > 0 ? Math.round(spent / transactionCount) : 0
    const savingsRate =
      received > 0
        ? (cashflow?.savings_rate_percent ?? Math.round((net / received) * 100))
        : null
    const lastReportedAt = accounts.reduce<string | null>((latest, account) => {
      if (!account.last_reported_at) return latest
      if (!latest || account.last_reported_at > latest) return account.last_reported_at
      return latest
    }, null)
    return {
      accounts,
      balance,
      reported,
      discrepancy,
      accountCount,
      days,
      spent,
      received,
      net,
      transactionCount,
      dailyAverage,
      perTransaction,
      savingsRate,
      lastReportedAt,
      hasActivity: transactionCount > 0 || received > 0,
    }
  }, [cashflow, period.range, summary])

  if (loading) return <PageSkeleton />

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState
          title="Could not load your overview"
          description={error instanceof Error ? error.message : 'The overview request failed.'}
          onRetry={retryAll}
        />
      </div>
    )
  }

  const comparison = summary?.comparison
  const changePercent = comparison?.change_percent ?? null
  const biggestExpense = summary?.highest_expense ?? null

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <PageHeader
        eyebrow="Overview"
        title="Your money, in one place"
        description={`${formatRangeLabel(period.range)} · Asia/Kolkata`}
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
              <span>Add expense</span>
            </Button>
          </>
        }
      />

      <Panel className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium text-muted">Total balance</span>
              <Badge tone="neutral">
                {derived.accountCount} account{derived.accountCount === 1 ? '' : 's'}
              </Badge>
            </div>

            <p className="mt-3 break-words font-mono text-[34px] font-medium leading-none tabular-nums tracking-[-0.035em] text-text sm:text-[42px]">
              {formatINR(derived.balance)}
            </p>
            <p className="mt-2 max-w-md text-xs leading-5 text-muted">
              Opening balance plus every recorded expense, income and transfer. Negative values are
              shown as owed, never hidden.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => openCreate()}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Expense
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/transactions?tab=income')}>
                <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Income
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/transactions?tab=transfers')}>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                Transfer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openScanReceipt()}>
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Scan bill
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[11px] font-semibold text-text">This period</span>
              <Link
                to={`/transactions?${period.periodSearch}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
              >
                Ledger
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            <Metric
              label="Received"
              value={formatINR(derived.received)}
              hint={`${derived.days} day${derived.days === 1 ? '' : 's'} in view`}
              icon={ArrowDownLeft}
              tone="positive"
            />
            <Metric
              label="Spent"
              value={formatINR(derived.spent)}
              hint={`${derived.transactionCount} transaction${derived.transactionCount === 1 ? '' : 's'}`}
              icon={ArrowUpRight}
              tone="danger"
            />
            <Metric
              label="Net flow"
              value={formatSignedINR(derived.net)}
              hint={
                derived.savingsRate == null
                  ? 'No income recorded this period'
                  : `${derived.savingsRate.toFixed(0)}% of income kept`
              }
              icon={Wallet}
              tone={derived.net >= 0 ? 'positive' : 'danger'}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border bg-surface-raised px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-[11px]">
            {derived.reported == null ? (
              <>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                  <CircleAlert className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="text-muted">
                  {derived.accountCount === 0
                    ? 'No bank account linked yet. Reconciliation starts after you link one.'
                    : 'No bank-reported balance yet. This calculated balance has not been verified against a bank SMS.'}
                </span>
              </>
            ) : derived.discrepancy === 0 ? (
              <>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="text-muted">
                  Reconciled with your last bank-reported balance
                  {derived.lastReportedAt ? ` on ${formatDate(derived.lastReportedAt.slice(0, 10))}` : ''}.
                </span>
              </>
            ) : (
              <>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                  <CircleAlert className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className="text-muted">
                  {formatINR(derived.discrepancy ?? 0)} difference from the last bank-reported
                  balance. Review the account before treating it as reconciled.
                </span>
              </>
            )}
          </div>
          <Link
            to={derived.accountCount === 0 ? '/bank-accounts?new=1' : '/bank-accounts'}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary"
          >
            {derived.accountCount === 0 ? 'Link an account' : 'Manage accounts'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </Panel>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="text-[11px] font-medium text-muted">Spent this period</p>
          <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
            {formatINR(derived.spent)}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {changePercent == null ? (
              'No previous period to compare'
            ) : (
              <span className={changePercent > 0 ? 'text-danger' : changePercent < 0 ? 'text-positive' : ''}>
                {changePercent > 0 ? '+' : ''}
                {changePercent.toFixed(1)}% vs previous period
              </span>
            )}
          </p>
        </Panel>

        <Panel className="p-4">
          <p className="text-[11px] font-medium text-muted">Average spend</p>
          <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
            {formatINR(derived.dailyAverage)}
            <span className="ml-1 font-sans text-[11px] font-normal text-muted">/ day</span>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {formatINR(derived.perTransaction)} per transaction · {derived.days} day
            {derived.days === 1 ? '' : 's'}
          </p>
        </Panel>

        <Panel className="p-4">
          <p className="text-[11px] font-medium text-muted">Largest expense</p>
          <p className="mt-1.5 truncate font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
            {formatINR(biggestExpense?.amount_paise ?? 0)}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted">
            {biggestExpense
              ? `${biggestExpense.expense_type?.name ?? 'Expense'} · ${formatDate(biggestExpense.expense_date)}`
              : 'Nothing recorded this period'}
          </p>
        </Panel>
      </div>

      {derived.hasActivity ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <Panel className="min-w-0 lg:col-span-8">
            <PanelHeader
              title="Spending over time"
              description={`${formatRangeLabel(period.range)} · ${granularity} buckets`}
              action={
                <Link
                  to={`/analytics?${period.periodSearch}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
                >
                  Analytics
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              }
            />
            <div className="px-3 py-4 sm:px-5">
              <TrendChart
                series={trendsQuery.data?.series ?? []}
                granularity={granularity}
                variant="bar"
                height={260}
              />
            </div>
          </Panel>

          <Panel className="min-w-0 lg:col-span-4">
            <PanelHeader
              title="Where it went"
              description="Share of period spend"
              action={
                <Link
                  to={`/analytics?view=breakdown&${period.periodSearch}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
                >
                  All
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              }
            />
            <div className="p-5">
              {byTypeQuery.data?.items?.length ? (
                <ol className="space-y-4">
                  {byTypeQuery.data.items.slice(0, 5).map((item) => (
                    <li key={item.expense_type_id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          to={`/expense-types/${item.expense_type_id}`}
                          className="min-w-0 truncate text-xs font-medium text-text hover:text-primary"
                        >
                          {item.name}
                        </Link>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                          {item.share_percent.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(2, Math.min(100, item.share_percent))}%` }}
                          />
                        </div>
                        <span className="w-[86px] shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                          {formatINR(item.total_paise)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-8 text-center text-xs text-muted">No categorised spend yet.</p>
              )}
            </div>
          </Panel>
        </div>
      ) : (
        <Panel className="mt-4">
          <EmptyState
            icon={Receipt}
            title="A clean slate"
            description="Record your first expense, income or account balance. Every figure stays exact, in paise, and under your account only."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add expense
                </Button>
                <Button variant="secondary" onClick={() => navigate('/transactions?tab=income')}>
                  <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                  Record income
                </Button>
                <Button variant="ghost" onClick={() => navigate('/bank-accounts')}>
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  Link account
                </Button>
              </div>
            }
          />
        </Panel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Panel className="min-w-0 lg:col-span-8">
          <PanelHeader
            title="Recent expenses"
            description="Latest recorded outflow"
            action={
              <Link
                to={`/transactions?${period.periodSearch}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
              >
                View all
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          {recentQuery.data?.items?.length ? (
            <div>
              {recentQuery.data.items.map((expense) => (
                <TransactionRow key={expense.id} expense={expense} onEdit={openEdit} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-text">No expenses in this period</p>
              <p className="mt-1 text-xs text-muted">
                Change the period above, or record a new expense.
              </p>
            </div>
          )}
        </Panel>

        <Panel className="min-w-0 lg:col-span-4">
          <PanelHeader
            title="Quick add"
            description="One tap, then confirm"
            action={
              <button
                type="button"
                onClick={() => setIsEditChipsOpen(true)}
                className="text-[11px] font-medium text-muted hover:text-text"
              >
                Edit
              </button>
            }
          />
          <div className="space-y-2 p-5">
            {quickChips.slice(0, 4).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() =>
                  openCreate({
                    amount: chip.amount,
                    merchant: chip.merchant,
                    note: chip.note,
                    payment_method: chip.payment_method,
                  })
                }
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary-border hover:bg-primary-soft"
              >
                <span className="min-w-0 truncate text-xs font-medium text-text">
                  {chip.label.replace(/^[^\p{L}\p{N}]+/u, '')}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                  {formatINR(
                    Number.isFinite(Number(chip.amount))
                      ? Math.round(Number(chip.amount) * 100)
                      : 0,
                  )}
                </span>
              </button>
            ))}
            <p className="pt-1 text-[10px] leading-4 text-muted">
              Quick add opens the expense form with the amount filled in. Nothing posts until you
              confirm.
            </p>
          </div>
        </Panel>
      </div>

      <QuickChipsModal
        open={isEditChipsOpen}
        onClose={() => setIsEditChipsOpen(false)}
        onChipsChanged={(updated) => setQuickChips(updated)}
      />
    </div>
  )
}
