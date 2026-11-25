import {
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { TypeSelectSheet } from '@/components/TypeSelectSheet'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Panel } from '@/components/ui/Panel'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api, ApiError } from '@/services/api'
import { enqueueOfflineIncome } from '@/services/offlineQueue'
import type { BankAccount, Income, IncomeCreateInput, IncomeType } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate, todayIST } from '@/utils/dates'
import { formatRangeLabel } from '@/utils/periods'

const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Debit Card', 'Other']

export function IncomePage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle('Income & Inflows')
  const period = usePeriod()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const { start, end } = period.range

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined)
  const [selectedTypeId, setSelectedTypeId] = useState<number | undefined>(undefined)

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState<Income | null>(null)
  const [formAmount, setFormAmount] = useState('')
  const [formTypeId, setFormTypeId] = useState<number | ''>('')
  const [formAccountId, setFormAccountId] = useState<number | ''>('')
  const [formDate, setFormDate] = useState(() => todayIST())
  const [formPayer, setFormPayer] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('UPI')
  const [formReference, setFormReference] = useState('')
  const [formNote, setFormNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null)
  const [deleting, setDeleting] = useState(false)

  const incomeTypesQuery = useApiQuery(['income-types'], () => api.listIncomeTypes())
  const bankAccountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts())
  const cashflowQuery = useApiQuery(['cashflow', start, end], () =>
    api.getCashFlowSummary({ start_date: start, end_date: end }),
  )
  const incomesQuery = useApiQuery(
    ['incomes', start, end, page, debouncedSearch, selectedAccountId, selectedTypeId],
    () =>
      api.listIncomes({
        start_date: start,
        end_date: end,
        page,
        page_size: 20,
        search: debouncedSearch || undefined,
        account_id: selectedAccountId,
        income_type_id: selectedTypeId,
      }),
  )

  const incomes = incomesQuery.data?.items ?? []
  const incomeTypes: IncomeType[] = incomeTypesQuery.data ?? []
  const bankAccounts: BankAccount[] = bankAccountsQuery.data?.items ?? []
  const pageInflowPaise = incomes.reduce((sum, item) => sum + item.amount_paise, 0)
  const cashflow = cashflowQuery.data
  const hasFilters = Boolean(debouncedSearch || selectedAccountId || selectedTypeId)

  const openCreateDialog = () => {
    setEditingIncome(null)
    setFormAmount('')
    setFormTypeId(incomeTypes[0]?.id ?? '')
    setFormAccountId(bankAccounts[0]?.id ?? '')
    setFormDate(todayIST())
    setFormPayer('')
    setFormPaymentMethod('UPI')
    setFormReference('')
    setFormNote('')
    setIsDialogOpen(true)
  }

  const openEditDialog = (income: Income) => {
    setEditingIncome(income)
    setFormAmount((income.amount_paise / 100).toString())
    setFormTypeId(income.income_type_id)
    setFormAccountId(income.account_id ?? '')
    setFormDate(income.income_date)
    setFormPayer(income.payer ?? '')
    setFormPaymentMethod(income.payment_method ?? 'UPI')
    setFormReference(income.reference ?? '')
    setFormNote(income.note ?? '')
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountPaise = parseRupeesToPaise(formAmount)
    if (!amountPaise || amountPaise <= 0) {
      showToast({
        title: 'Invalid amount',
        description: 'Enter an amount greater than zero.',
        variant: 'error',
      })
      return
    }
    if (!formTypeId) {
      showToast({
        title: 'Category required',
        description: 'Choose an income category.',
        variant: 'error',
      })
      return
    }

    setSubmitting(true)
    const payload: IncomeCreateInput = {
      amount_paise: amountPaise,
      income_type_id: Number(formTypeId),
      account_id: formAccountId ? Number(formAccountId) : null,
      income_date: formDate,
      payer: formPayer.trim() || null,
      payment_method: formPaymentMethod || null,
      reference: formReference.trim() || null,
      note: formNote.trim() || null,
    }

    try {
      if (editingIncome) {
        await api.updateIncome(editingIncome.id, payload)
        showToast({ title: 'Income updated', description: 'Changes saved to your ledger.' })
      } else {
        await api.createIncome(payload)
        showToast({ title: 'Income recorded', description: 'Added to your ledger.' })
      }

      setIsDialogOpen(false)
      invalidate()
      incomesQuery.refetch()
      bankAccountsQuery.refetch()
      cashflowQuery.refetch()
    } catch (err) {
      if (!editingIncome && err instanceof ApiError && err.status === 0) {
        enqueueOfflineIncome(payload)
        showToast({
          title: 'Income queued offline',
          description: 'Saved on this device. It will sync when the connection returns.',
          variant: 'info',
        })
        setIsDialogOpen(false)
        return
      }
      showToast({
        title: 'Could not save income',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteIncome(deleteTarget.id)
      showToast({ title: 'Income deleted', description: 'Removed from your ledger.' })
      setDeleteTarget(null)
      invalidate()
      incomesQuery.refetch()
      bankAccountsQuery.refetch()
      cashflowQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Could not delete income',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  const content = (() => {
    if (incomesQuery.loading && !incomesQuery.data) {
      return <PageSkeleton />
    }

    if (incomesQuery.error) {
      return (
        <ErrorState
          title="Could not load income"
          description={
            incomesQuery.error instanceof Error
              ? incomesQuery.error.message
              : 'The income request failed.'
          }
          onRetry={() => incomesQuery.refetch()}
        />
      )
    }

    return (
      <>
        {!embedded ? (
          <PageHeader
            eyebrow="Cashflow"
            title="Income & inflows"
            description={`${formatRangeLabel(period.range)} · Asia/Kolkata`}
            actions={
              <>
                <PeriodPicker
                  preset={period.preset}
                  range={period.range}
                  onPresetChange={period.setPreset}
                  onCustomChange={period.setCustomRange}
                />
                <Button variant="primary" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add income
                </Button>
              </>
            }
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Income in period</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-positive">
              {cashflow ? formatINR(cashflow.total_income_paise) : '—'}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {cashflow ? 'Every inflow recorded in this range' : 'Loading period total…'}
            </p>
          </Panel>

          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Income entries</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
              {incomesQuery.data?.total ?? 0}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {hasFilters ? 'Matching your filters' : 'Recorded in this range'}
            </p>
          </Panel>

          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Net cashflow</p>
            <p
              className={cn(
                'mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em]',
                cashflow && cashflow.net_cashflow_paise < 0 ? 'text-danger' : 'text-text',
              )}
            >
              {cashflow
                ? `${cashflow.net_cashflow_paise < 0 ? '−' : '+'}${formatINR(
                    Math.abs(cashflow.net_cashflow_paise),
                  )}`
                : '—'}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Income minus expenses for the period
            </p>
          </Panel>
        </div>

        <Panel className="mt-4 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span className="sr-only">Search income</span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search payer, note or reference"
                className="h-full w-full min-w-0 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setPage(1)
                  }}
                  aria-label="Clear search"
                  className="shrink-0 text-muted hover:text-text"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </label>

            <div className="flex items-center gap-2">
              <Select
                value={selectedAccountId ?? ''}
                onChange={(event) => {
                  setSelectedAccountId(
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                  setPage(1)
                }}
                aria-label="Filter by bank account"
                className="h-9 text-[12px]"
              >
                <option value="">All accounts</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.bank_name})
                  </option>
                ))}
              </Select>

              <Select
                value={selectedTypeId ?? ''}
                onChange={(event) => {
                  setSelectedTypeId(event.target.value ? Number(event.target.value) : undefined)
                  setPage(1)
                }}
                aria-label="Filter by income category"
                className="h-9 text-[12px]"
              >
                <option value="">All categories</option>
                {incomeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </div>

            {embedded ? (
              <Button variant="primary" size="sm" onClick={openCreateDialog} className="shrink-0">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add income
              </Button>
            ) : null}
          </div>

          {incomes.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2 text-[11px] sm:px-5">
                <span className="text-muted">
                  {incomesQuery.data?.total ?? 0} entr
                  {(incomesQuery.data?.total ?? 0) === 1 ? 'y' : 'ies'}
                  {hasFilters ? ' matching filters' : ''}
                </span>
                <span className="font-mono tabular-nums text-text">
                  Page total {formatINR(pageInflowPaise)}
                </span>
              </div>

              <ul className="divide-y divide-border">
                {incomes.map((income) => {
                  const account = income.account ?? null
                  return (
                    <li key={income.id} className="group flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-positive-soft text-positive">
                        <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-[13px] font-medium text-text">
                            {income.payer?.trim() || income.income_type?.name || 'Income'}
                          </p>
                          <p className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-positive">
                            +{formatINR(income.amount_paise)}
                          </p>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                          <span>{formatDate(income.income_date)}</span>
                          <span aria-hidden="true">·</span>
                          <Badge tone="neutral">{income.income_type?.name ?? 'General'}</Badge>
                          {account ? (
                            <span className="truncate">
                              {account.bank_name}
                              {account.account_number_mask ? ` ••${account.account_number_mask}` : ''}
                            </span>
                          ) : (
                            <span>No account linked</span>
                          )}
                          {income.reference ? (
                            <span className="truncate font-mono text-[10px] text-subtle">
                              Ref {income.reference}
                            </span>
                          ) : null}
                        </div>

                        {income.note ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                            {income.note}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEditDialog(income)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-text"
                          aria-label={`Edit income of ${formatINR(income.amount_paise)} on ${formatDate(income.income_date)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(income)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                          aria-label={`Delete income of ${formatINR(income.amount_paise)} on ${formatDate(income.income_date)}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {incomesQuery.data && incomesQuery.data.pages > 1 ? (
                <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-muted sm:px-5">
                  <span>
                    Page {incomesQuery.data.page} of {incomesQuery.data.pages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= incomesQuery.data.pages}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={ArrowDownLeft}
              title={hasFilters ? 'No matching income' : 'No income recorded'}
              description={
                hasFilters
                  ? 'No inflow matched this search and date range. Clear the filters to see everything.'
                  : 'Record salary, freelance payments, cashback or refunds to complete the cashflow picture.'
              }
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('')
                      setSelectedAccountId(undefined)
                      setSelectedTypeId(undefined)
                      setPage(1)
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add income
                  </Button>
                )
              }
            />
          )}
        </Panel>

        <Modal
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title={editingIncome ? 'Edit income' : 'Record income'}
          description="The amount is stored exactly as entered, in paise."
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="income-form"
                loading={submitting}
              >
                {editingIncome ? 'Save changes' : 'Record income'}
              </Button>
            </div>
          }
        >
          <form id="income-form" onSubmit={handleSubmit} className="space-y-4">
            <Field label="Amount (₹)" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formAmount}
                onChange={(event) => setFormAmount(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="font-mono text-[15px] tabular-nums"
              />
            </Field>

            <TypeSelectSheet
              label="Income category"
              value={formTypeId}
              onChange={(newId) => setFormTypeId(Number(newId))}
              options={incomeTypes}
              placeholder="Select income category…"
              suggestions={incomeTypes.slice(0, 4)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank account">
                <Select
                  value={formAccountId}
                  onChange={(event) =>
                    setFormAccountId(event.target.value ? Number(event.target.value) : '')
                  }
                >
                  <option value="">No account</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bank_name})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Date" required>
                <Input
                  type="date"
                  required
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment method">
                <Select
                  value={formPaymentMethod}
                  onChange={(event) => setFormPaymentMethod(event.target.value)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method === 'Bank Transfer' ? 'Bank transfer (NEFT/IMPS)' : method}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Source or payer">
                <Input
                  type="text"
                  value={formPayer}
                  onChange={(event) => setFormPayer(event.target.value)}
                  placeholder="Employer, client, platform"
                />
              </Field>
            </div>

            <Field label="Reference or transaction ID" optional>
              <Input
                type="text"
                value={formReference}
                onChange={(event) => setFormReference(event.target.value)}
                placeholder="UTR, UPI reference, cheque number"
                className="font-mono text-[12px]"
              />
            </Field>

            <Field label="Note" optional>
              <Textarea
                rows={2}
                value={formNote}
                onChange={(event) => setFormNote(event.target.value)}
                placeholder="What this inflow was for"
              />
            </Field>
          </form>
        </Modal>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete this income?"
          description={`Delete ${deleteTarget ? formatINR(deleteTarget.amount_paise) : 'this income'}? The linked account balance will be recalculated. This cannot be undone.`}
          confirmLabel="Delete"
          tone="danger"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      </>
    )
  })()

  if (embedded) return <div>{content}</div>
  return <AppPage>{content}</AppPage>
}
