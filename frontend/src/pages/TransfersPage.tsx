import {
  ArrowLeftRight,
  ArrowRight,
  Info,
  Plus,
} from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { BankAccount, TransferCreateInput } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate } from '@/utils/dates'
import { formatRangeLabel } from '@/utils/periods'

export function TransfersPage() {
  useDocumentTitle('Account Transfers')
  const period = usePeriod()
  const { showToast } = useToast()
  const { start, end } = period.range

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [fromAccountId, setFromAccountId] = useState<number | ''>('')
  const [toAccountId, setToAccountId] = useState<number | ''>('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formReference, setFormReference] = useState('')
  const [formNote, setFormNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Queries
  const bankAccountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts())
  const transfersQuery = useApiQuery(['transfers', start, end], () =>
    api.listTransfers({ start_date: start, end_date: end }),
  )

  const bankAccounts: BankAccount[] = bankAccountsQuery.data?.items ?? []
  const transfers = transfersQuery.data?.items ?? []
  const totalTransferPaise = transfers.reduce((sum, t) => sum + t.amount_paise, 0)

  const openCreateDialog = () => {
    setFromAccountId(bankAccounts[0]?.id ?? '')
    setToAccountId(bankAccounts[1]?.id ?? '')
    setFormAmount('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormReference('')
    setFormNote('')
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromAccountId || !toAccountId) {
      showToast({ title: 'Select Accounts', description: 'Please select both source and destination accounts.', variant: 'error' })
      return
    }
    if (fromAccountId === toAccountId) {
      showToast({ title: 'Invalid Transfer', description: 'Source and destination accounts must be different.', variant: 'error' })
      return
    }
    const amountPaise = parseRupeesToPaise(formAmount)
    if (!amountPaise || amountPaise <= 0) {
      showToast({ title: 'Invalid Amount', description: 'Please enter a valid transfer amount greater than zero.', variant: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const payload: TransferCreateInput = {
        from_account_id: Number(fromAccountId),
        to_account_id: Number(toAccountId),
        amount_paise: amountPaise,
        transfer_date: formDate,
        reference: formReference.trim() || null,
        note: formNote.trim() || null,
      }

      await api.createTransfer(payload)
      showToast({ title: 'Transfer Completed', description: 'Balances adjusted between accounts.' })
      setIsDialogOpen(false)
      transfersQuery.refetch()
      bankAccountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Transfer Failed',
        description: err instanceof Error ? err.message : 'Could not execute account transfer.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (transfersQuery.loading && !transfersQuery.data) {
    return <PageSkeleton />
  }

  if (transfersQuery.error) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load transfers"
          description={transfersQuery.error instanceof Error ? transfersQuery.error.message : 'An error occurred'}
          onRetry={() => transfersQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Internal ledger"
        title="Account transfers"
        description={`${formatRangeLabel(period.range)} · Inter-account liquidity`}
        actions={
          <div className="flex items-center gap-2">
            <PeriodPicker
              preset={period.preset}
              range={period.range}
              onPresetChange={period.setPreset}
              onCustomChange={period.setCustomRange}
            />
            <Button
              variant="primary"
              disabled={bankAccounts.length < 2}
              onClick={openCreateDialog}
              title={bankAccounts.length < 2 ? 'You need at least 2 bank accounts to transfer' : undefined}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>New transfer</span>
            </Button>
          </div>
        }
      />

      {/* Information Banner */}
      <div className="card p-3.5 sm:p-4 mb-5 flex items-start gap-3 bg-surface-raised border border-border">
        <div className="p-1 rounded-md bg-surface text-muted shrink-0 mt-0.5 border border-border">
          <Info className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="text-xs text-muted leading-relaxed">
          <strong className="text-text font-medium">Non-taxable inter-account movement:</strong> Transfers between your own accounts adjust source and destination balances in the ledger without affecting income, expense, or consolidated balance totals.
        </div>
      </div>

      {/* Transfer Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Total transferred
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-text font-mono tabular-nums">
            {formatINR(totalTransferPaise)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            {transfers.length} inter-account movement{transfers.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Active accounts
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-text font-mono tabular-nums">
            {bankAccounts.length}
          </div>
          <div className="text-[11px] text-muted mt-1">Available for internal routing</div>
        </div>

        <div className="card p-4 sm:p-5">
          <div className="text-xs font-medium text-muted mb-1">
            Net worth impact
          </div>
          <div className="text-2xl sm:text-3xl font-semibold text-text font-mono tabular-nums">
            ₹0.00
          </div>
          <div className="text-[11px] text-muted mt-1">Zero impact on consolidated worth</div>
        </div>
      </div>

      {/* Transfers List */}
      {transfers.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-raised border-b border-border text-muted font-medium text-xs">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">From account</th>
                  <th className="py-3 px-4 text-center">Direction</th>
                  <th className="py-3 px-4">To account</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Reference / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-surface-raised/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono tabular-nums text-muted whitespace-nowrap">
                      {formatDate(transfer.transfer_date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-text">{transfer.from_account?.name}</div>
                      <div className="text-[10px] text-muted font-mono tabular-nums">
                        {transfer.from_account?.bank_name} {transfer.from_account?.account_number_mask && `••${transfer.from_account.account_number_mask}`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center justify-center p-1 rounded-md bg-surface-raised text-muted border border-border">
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-text">{transfer.to_account?.name}</div>
                      <div className="text-[10px] text-muted font-mono tabular-nums">
                        {transfer.to_account?.bank_name} {transfer.to_account?.account_number_mask && `••${transfer.to_account.account_number_mask}`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-text text-sm whitespace-nowrap">
                      {formatINR(transfer.amount_paise)}
                    </td>
                    <td className="py-3.5 px-4 text-muted">
                      {transfer.reference && <div className="font-mono tabular-nums text-[10px]">Ref: {transfer.reference}</div>}
                      {transfer.note && <div className="text-[11px] truncate max-w-xs">{transfer.note}</div>}
                      {!transfer.reference && !transfer.note && <span className="text-[11px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers in this period"
            description="Move funds between your savings accounts, cards, or physical cash wallets."
            action={
              bankAccounts.length >= 2 ? (
                <Button variant="primary" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Record first transfer</span>
                </Button>
              ) : (
                <span className="text-xs text-muted">
                  Add at least 2 bank accounts in the Bank Accounts section to enable transfers.
                </span>
              )
            }
          />
        </div>
      )}

      {/* New Transfer Modal */}
      <Modal
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Record Account Transfer"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Executing Transfer...' : 'Complete Transfer'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">From Account (Source) *</label>
              <select
                required
                value={fromAccountId}
                onChange={(e) => setFromAccountId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id} disabled={acc.id === toAccountId}>
                    {acc.name} ({formatINR(acc.current_balance_paise)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">To Account (Destination) *</label>
              <select
                required
                value={toAccountId}
                onChange={(e) => setToAccountId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id} disabled={acc.id === fromAccountId}>
                    {acc.name} ({formatINR(acc.current_balance_paise)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Transfer Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="e.g. 10000"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm font-bold text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

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
            <label className="block text-xs font-semibold text-text mb-1">Reference / UTR / Txn ID</label>
            <input
              type="text"
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
              placeholder="e.g. IMPS/429104829104"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Note</label>
            <textarea
              rows={2}
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Optional purpose (e.g. Credit card payment, CC bill, wallet top-up)"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none resize-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
