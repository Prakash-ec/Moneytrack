import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
  Sparkles,
  TrendingUp,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ComparisonBadge } from '@/components/ComparisonBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatCard } from '@/components/StatCard'
import { TransactionList } from '@/components/TransactionList'
import { TypeFormDialog } from '@/components/TypeFormDialog'
import { TypeIcon } from '@/components/TypeIcon'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { TrendChart } from '@/components/charts/TrendChart'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import { formatINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel } from '@/utils/periods'

export function TypeDetailPage() {
  const { typeId: typeIdParam } = useParams<{ typeId: string }>()
  const typeId = Number(typeIdParam)
  const validId = Number.isInteger(typeId) && typeId > 0
  const period = usePeriod()
  const navigate = useNavigate()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const { openCreate, openEdit } = useExpenseDialog()
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [working, setWorking] = useState(false)

  const typeQuery = useApiQuery(['expense-type', typeId], () => api.getExpenseType(typeId), {
    enabled: validId,
  })
  const summaryQuery = useApiQuery(
    ['expense-type-summary', typeId, period.range.start, period.range.end],
    () =>
      api.expenseTypeSummary(typeId, {
        start_date: period.range.start,
        end_date: period.range.end,
      }),
    { enabled: validId },
  )
  const expensesQuery = useApiQuery(
    ['expense-type-expenses', typeId, period.range.start, period.range.end],
    () =>
      api.listExpenses({
        expense_type_id: typeId,
        start_date: period.range.start,
        end_date: period.range.end,
        sort: 'date_desc',
        page_size: 8,
      }),
    { enabled: validId },
  )

  const expenseType = typeQuery.data
  useDocumentTitle(expenseType ? expenseType.name : 'Expense type')

  const openExpenses = () =>
    navigate(`/expenses?type=${typeId}&${period.periodSearch}`)

  const handleArchiveToggle = async () => {
    if (!expenseType) return
    setWorking(true)
    try {
      if (expenseType.is_archived) {
        await api.unarchiveExpenseType(expenseType.id)
        showToast({ title: 'Expense type restored' })
      } else {
        await api.archiveExpenseType(expenseType.id)
        showToast({
          title: 'Expense type archived',
          description: 'Existing history stays intact and the type is hidden from new expenses.',
        })
      }
      invalidate()
      setArchiveOpen(false)
    } catch (error) {
      showToast({
        title: 'Could not update this type',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setWorking(false)
    }
  }

  const handleDelete = async () => {
    if (!expenseType) return
    setWorking(true)
    try {
      await api.deleteExpenseType(expenseType.id)
      invalidate()
      showToast({ title: 'Expense type deleted' })
      navigate('/expense-types', { replace: true })
    } catch (error) {
      showToast({
        title: 'Could not delete this type',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
      setWorking(false)
      setDeleteOpen(false)
    }
  }

  if (!validId || (typeQuery.error && !typeQuery.loading)) {
    return (
      <ErrorState
        title="Expense type not found"
        description={
          typeQuery.error?.message ??
          'This expense type may have been deleted, or the link is invalid.'
        }
        onRetry={validId ? typeQuery.refetch : undefined}
        className="mt-4"
      />
    )
  }

  if (typeQuery.loading && !typeQuery.data) {
    return <PageSkeleton />
  }

  if (!expenseType) return null

  const summary = summaryQuery.data
  const link = `${period.periodSearch}`
  const showLoader = (summaryQuery.loading && !summary) || (expensesQuery.loading && !expensesQuery.data)

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/expense-types"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All expense types
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <TypeIcon icon={expenseType.icon} color={expenseType.color} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-3xl">
                {expenseType.name}
              </h1>
              {expenseType.is_archived ? <Badge tone="archive">Archived</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
              <span>{expenseType.category ?? 'Uncategorised'}</span>
              <span aria-hidden>·</span>
              <span>
                {expenseType.transaction_count.toLocaleString('en-IN')} lifetime{' '}
                {expenseType.transaction_count === 1 ? 'expense' : 'expenses'}
              </span>
              <span aria-hidden>·</span>
              <span>{formatINR(expenseType.total_paise)} all-time</span>
            </div>
            {expenseType.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{expenseType.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setArchiveOpen(true)}
          >
            {expenseType.is_archived ? (
              <ArchiveRestore className="h-4 w-4" aria-hidden />
            ) : (
              <Archive className="h-4 w-4" aria-hidden />
            )}
            {expenseType.is_archived ? 'Restore' : 'Archive'}
          </Button>
          <Button onClick={() => openCreate(expenseType.id)} disabled={expenseType.is_archived}>
            <Plus className="h-4 w-4" aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

      {expenseType.is_archived ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Archive className="h-4 w-4 text-[var(--muted)]" aria-hidden />
            This type is archived. Its history remains fully available, but it cannot be used for new
            expenses.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setArchiveOpen(true)}>
            Restore type
          </Button>
        </div>
      ) : null}

      <PeriodPicker
        preset={period.preset}
        range={period.range}
        onPresetChange={period.setPreset}
        onCustomChange={period.setCustomRange}
      />

      {showLoader ? (
        <PageSkeleton />
      ) : summaryQuery.error ? (
        <ErrorState
          title="Could not load this type's summary"
          description={summaryQuery.error.message}
          onRetry={() => {
            summaryQuery.refetch()
            expensesQuery.refetch()
          }}
        />
      ) : summary ? (
        <>
          <Card
            className="relative overflow-hidden p-5 sm:p-6"
            style={{ borderTopColor: expenseType.color, borderTopWidth: 3 }}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Spent on {expenseType.name}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="tabular text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-4xl">
                    {formatINR(summary.total_paise)}
                  </p>
                  <ComparisonBadge
                    direction={summary.direction}
                    changePercent={summary.change_percent}
                    changePaise={summary.change_paise}
                    withContext
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {formatRangeLabel(period.range)} · previous period{' '}
                  <span className="tabular font-medium text-[var(--text)]">
                    {formatINR(summary.previous_total_paise)}
                  </span>
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={openExpenses}>
                <ReceiptText className="h-4 w-4" aria-hidden />
                All matching expenses
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Transactions"
              value={summary.transaction_count.toLocaleString('en-IN')}
              hint="In selected period"
              icon={ReceiptText}
            />
            <StatCard
              label="Average"
              value={formatINR(summary.average_paise)}
              hint="Per transaction"
              icon={Scale}
            />
            <StatCard
              label="Highest"
              value={summary.highest_expense ? formatINR(summary.highest_expense.amount_paise) : '—'}
              hint={
                summary.highest_expense
                  ? `${formatDate(summary.highest_expense.expense_date)}${
                      summary.highest_expense.note ? ` · ${summary.highest_expense.note}` : ''
                    }`
                  : 'No expense'
              }
              icon={TrendingUp}
              tone="warning"
            />
            <StatCard
              label="Lowest"
              value={summary.lowest_expense ? formatINR(summary.lowest_expense.amount_paise) : '—'}
              hint={
                summary.lowest_expense
                  ? `${formatDate(summary.lowest_expense.expense_date)}${
                      summary.lowest_expense.note ? ` · ${summary.lowest_expense.note}` : ''
                    }`
                  : 'No expense'
              }
              icon={CalendarDays}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <CardHeader
                title="Daily trend"
                description={`${expenseType.name} spending during ${formatRangeLabel(period.range)}.`}
              />
            </div>
            <div className="px-2 pb-3 pt-2 sm:px-3">
              <TrendChart series={summary.daily_trend} granularity="daily" height={240} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
              <CardHeader
                title="Recent expenses"
                description={`${summary.transaction_count} ${
                  summary.transaction_count === 1 ? 'expense' : 'expenses'
                } in this period`}
                action={
                  <Link to={`/expenses?type=${typeId}&${link}`} className={buttonClasses('ghost', 'sm')}>
                    View all
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              />
            </div>
            {expensesQuery.error ? (
              <ErrorState
                title="Could not load expenses"
                description={expensesQuery.error.message}
                onRetry={expensesQuery.refetch}
                className="m-4"
              />
            ) : (expensesQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No expenses in this period"
                description={
                  expenseType.is_archived
                    ? 'Try another period to see this type’s earlier history.'
                    : 'Add an expense under this type to start its history.'
                }
                action={
                  expenseType.is_archived ? null : (
                    <Button size="sm" onClick={() => openCreate(expenseType.id)}>
                      <Plus className="h-4 w-4" aria-hidden />
                      Add expense
                    </Button>
                  )
                }
              />
            ) : (
              <TransactionList expenses={expensesQuery.data?.items ?? []} onEdit={openEdit} />
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Delete this expense type</h2>
                <p className="mt-0.5 max-w-xl text-xs leading-5 text-[var(--muted)]">
                  {expenseType.transaction_count > 0
                    ? `This type is used by ${expenseType.transaction_count} ${
                        expenseType.transaction_count === 1 ? 'expense' : 'expenses'
                      }. It must keep them, so delete is unavailable. Archive it instead.`
                    : 'This type has no expenses and can be permanently deleted. This cannot be undone.'}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                disabled={expenseType.transaction_count > 0}
                title={
                  expenseType.transaction_count > 0
                    ? 'Delete is unavailable while expenses use this type.'
                    : undefined
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete type
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      <TypeFormDialog
        open={editOpen}
        expenseType={expenseType}
        onClose={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void handleArchiveToggle()}
        loading={working}
        tone={expenseType.is_archived ? 'primary' : 'danger'}
        title={expenseType.is_archived ? 'Restore this expense type?' : 'Archive this expense type?'}
        confirmLabel={expenseType.is_archived ? 'Restore type' : 'Archive type'}
        description={
          expenseType.is_archived ? (
            <>
              <strong className="font-semibold text-[var(--text)]">{expenseType.name}</strong> will be available
              again in new expense forms. Its history stays unchanged.
            </>
          ) : (
            <>
              <strong className="font-semibold text-[var(--text)]">{expenseType.name}</strong> will be hidden
              from new expense forms. All existing expenses and reports remain intact. You can
              restore it at any time.
            </>
          )
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        loading={working}
        title="Delete this expense type?"
        confirmLabel="Delete permanently"
        description={
          <>
            <strong className="font-semibold text-[var(--text)]">{expenseType.name}</strong> has no linked
            expenses and will be permanently removed. This cannot be undone.
          </>
        }
      />
    </div>
  )
}
