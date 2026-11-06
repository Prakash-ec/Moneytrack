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

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { BankAccount, Income, IncomeCreateInput, IncomeType } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel } from '@/utils/periods'

export function IncomePage() {
  useDocumentTitle('Income & Inflows')
  const period = usePeriod()
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
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formPayer, setFormPayer] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('UPI')
  const [formReference, setFormReference] = useState('')
  const [formNote, setFormNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Queries
  const incomeTypesQuery = useApiQuery(['income-types'], () => api.listIncomeTypes())
  const bankAccountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts())
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
  const rawTypes = incomeTypesQuery.data
  const incomeTypes: IncomeType[] = Array.isArray(rawTypes)
    ? rawTypes
    : (rawTypes as any)?.items ?? []
  const bankAccounts: BankAccount[] = bankAccountsQuery.data?.items ?? []
  const totalInflowPaise = incomes.reduce((sum, item) => sum + item.amount_paise, 0)

  const openCreateDialog = () => {
    setEditingIncome(null)
    setFormAmount('')
    setFormTypeId(incomeTypes[0]?.id ?? '')
    setFormAccountId(bankAccounts[0]?.id ?? '')
    setFormDate(new Date().toISOString().slice(0, 10))
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
      showToast({ title: 'Invalid Amount', description: 'Please enter a valid amount greater than zero.', variant: 'error' })
      return
    }
    if (!formTypeId) {
      showToast({ title: 'Category Required', description: 'Please choose an income category.', variant: 'error' })
      return
    }

    setSubmitting(true)
    try {
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

      if (editingIncome) {
        await api.updateIncome(editingIncome.id, payload)
        showToast({ title: 'Income Updated', description: 'Changes saved successfully.' })
      } else {
        await api.createIncome(payload)
        showToast({ title: 'Income Recorded', description: 'New income added to ledger.' })
      }

      setIsDialogOpen(false)
      incomesQuery.refetch()
      bankAccountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Could not save income.',
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
      showToast({ title: 'Income Deleted', description: 'Income transaction removed.' })
      setDeleteTarget(null)
      incomesQuery.refetch()
      bankAccountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Could not delete income.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  if (incomesQuery.loading && !incomesQuery.data) {
    return <PageSkeleton />
  }

  if (incomesQuery.error) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load income"
          description={incomesQuery.error instanceof Error ? incomesQuery.error.message : 'An error occurred'}
          onRetry={() => incomesQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cashflow"
        title="Income & Earnings"
        description={`${formatRangeLabel(period.range)} · Inflows`}
        actions={
          <div className="flex items-center gap-2">
            <PeriodPicker
              preset={period.preset}
              range={period.range}
              onPresetChange={period.setPreset}
              onCustomChange={period.setCustomRange}
            />
            <Button variant="primary" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add income</span>
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Total inflow
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-primary font-mono tabular-nums">
            {formatINR(totalInflowPaise)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            {incomesQuery.data?.total ?? 0} transaction{(incomesQuery.data?.total ?? 0) === 1 ? '' : 's'}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Average inflow
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-text font-mono tabular-nums">
            {incomes.length > 0 ? formatINR(Math.round(totalInflowPaise / incomes.length)) : '₹0'}
          </div>
          <div className="text-[11px] text-muted mt-1">Per recorded transaction</div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Linked accounts
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-text font-mono tabular-nums">
            {bankAccounts.length}
          </div>
          <div className="text-[11px] text-muted mt-1">Active receiving accounts</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-3 sm:p-4 mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payer, note, reference…"
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-surface border border-border text-xs text-text placeholder:text-muted focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : undefined)}
            className="py-2 px-3 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none"
          >
            <option value="">All accounts</option>
            {bankAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.bank_name})
              </option>
            ))}
          </select>

          <select
            value={selectedTypeId ?? ''}
            onChange={(e) => setSelectedTypeId(e.target.value ? Number(e.target.value) : undefined)}
            className="py-2 px-3 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none"
          >
            <option value="">All categories</option>
            {incomeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Income List */}
      {incomes.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-raised border-b border-border text-muted font-medium text-xs">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source / payer</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {incomes.map((income) => (
                  <tr key={income.id} className="hover:bg-surface-raised/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono tabular-nums text-muted whitespace-nowrap">
                      {formatDate(income.income_date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-text">
                        {income.payer || income.income_type?.name || 'Income'}
                      </div>
                      {income.note && (
                        <div className="text-[11px] text-muted truncate max-w-xs">{income.note}</div>
                      )}
                      {income.reference && (
                        <div className="text-[10px] font-mono tabular-nums text-muted/75">Ref: {income.reference}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge tone="positive">{income.income_type?.name ?? 'General'}</Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      {income.account || (income as any).bank_account ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted bg-surface-raised px-2 py-0.5 rounded-md border border-border font-mono tabular-nums">
                          {(income.account || (income as any).bank_account)?.bank_name}
                          {(income.account || (income as any).bank_account)?.account_number_mask &&
                            ` · ••${(income.account || (income as any).bank_account)?.account_number_mask}`}
                        </span>
                      ) : (
                        <span className="text-muted text-[11px]">Unlinked</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-primary text-sm whitespace-nowrap">
                      +{formatINR(income.amount_paise)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(income)}
                          className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(income)}
                          className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-surface transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {incomesQuery.data && incomesQuery.data.pages > 1 && (
            <div className="p-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted">
                Page {page} of {incomesQuery.data.pages} ({incomesQuery.data.total} total)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= incomesQuery.data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <EmptyState
            icon={ArrowDownLeft}
            title="No income recorded"
            description="No earnings recorded for this period. Add salary, freelance payment, cashback, or refund."
            action={
              <Button variant="primary" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add first income</span>
              </Button>
            }
          />
        </div>
      )}

      {/* Add / Edit Income Modal */}
      <Modal
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={editingIncome ? 'Edit Income' : 'Record Income'}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving...' : editingIncome ? 'Save Changes' : 'Record Income'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Category *</label>
              <select
                required
                value={formTypeId}
                onChange={(e) => setFormTypeId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                {incomeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Bank Account</label>
              <select
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                <option value="">No account</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.bank_name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Date *</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Payment Method</label>
              <select
                value={formPaymentMethod}
                onChange={(e) => setFormPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                <option value="Cash">Cash Deposit</option>
                <option value="Debit Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Source / Payer</label>
            <input
              type="text"
              value={formPayer}
              onChange={(e) => setFormPayer(e.target.value)}
              placeholder="e.g. Acme Corp, Client, Google Pay"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Reference / Txn ID</label>
            <input
              type="text"
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
              placeholder="e.g. UPI/328491823901"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Note</label>
            <textarea
              rows={2}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none resize-none"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Income Transaction?"
        description={`Are you sure you want to delete this income of ${
          deleteTarget ? formatINR(deleteTarget.amount_paise) : ''
        }? This will automatically recalculate the associated bank account's balance.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
