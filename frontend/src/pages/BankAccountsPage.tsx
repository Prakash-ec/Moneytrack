import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { AccountType, BankAccount, BankAccountCreateInput } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate } from '@/utils/dates'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: 'Savings Account',
  current: 'Current Account',
  credit_card: 'Credit Card',
  wallet: 'Digital Wallet',
  cash: 'Physical Cash',
}

export function BankAccountsPage() {
  useDocumentTitle('Bank Accounts & Reconciliation')
  const { showToast } = useToast()

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [formName, setFormName] = useState('')
  const [formBankName, setFormBankName] = useState('')
  const [formMask, setFormMask] = useState('')
  const [formType, setFormType] = useState<AccountType>('savings')
  const [formOpeningBalance, setFormOpeningBalance] = useState('')
  const [formOpeningDate, setFormOpeningDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formIsPrimary, setFormIsPrimary] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Report balance dialog state
  const [reportingAccount, setReportingAccount] = useState<BankAccount | null>(null)
  const [reportBalanceInput, setReportBalanceInput] = useState('')
  const [reporting, setReporting] = useState(false)

  // Recalculating state
  const [recalculatingId, setRecalculatingId] = useState<number | null>(null)
  const [reconcilingId, setReconcilingId] = useState<number | null>(null)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Query
  const accountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts(true))
  const accounts = accountsQuery.data?.items ?? []
  const rawConsolidated =
    accountsQuery.data?.consolidated_balance_paise ??
    (accountsQuery.data as any)?.total_balance_paise ??
    0
  const reportedPaise = accountsQuery.data?.total_reported_balance_paise ?? 0
  const consolidatedPaise = rawConsolidated !== 0 ? rawConsolidated : (reportedPaise || 0)
  const discrepancyPaise = reportedPaise - (rawConsolidated || reportedPaise)

  // Auto-refresh when SMS arrives or sync finishes
  useEffect(() => {
    const handleSmsChanged = () => {
      accountsQuery.refetch()
    }
    window.addEventListener('moneytrack:sms-changed', handleSmsChanged)
    return () => window.removeEventListener('moneytrack:sms-changed', handleSmsChanged)
  }, [accountsQuery])

  const openCreateDialog = () => {
    setEditingAccount(null)
    setFormName('')
    setFormBankName('HDFC Bank')
    setFormMask('')
    setFormType('savings')
    setFormOpeningBalance('0')
    setFormOpeningDate(new Date().toISOString().slice(0, 10))
    setFormIsPrimary(accounts.length === 0)
    setIsDialogOpen(true)
  }

  const openEditDialog = (account: BankAccount) => {
    setEditingAccount(account)
    setFormName(account.name || (account as any).account_name || '')
    setFormBankName(account.bank_name || '')
    setFormMask(account.account_number_mask ?? '')
    setFormType(account.account_type || 'savings')
    setFormOpeningBalance(((account.opening_balance_paise ?? 0) / 100).toString())
    setFormOpeningDate(
      account.opening_date ||
        (account as any).opening_balance_date ||
        new Date().toISOString().slice(0, 10),
    )
    setFormIsPrimary(Boolean(account.is_primary))
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formBankName.trim()) {
      showToast({ title: 'Validation Error', description: 'Name and bank name are required.', variant: 'error' })
      return
    }

    const openingPaise = parseRupeesToPaise(formOpeningBalance) ?? 0

    setSubmitting(true)
    try {
      const maskVal = formMask.trim() || 'XX0000'
      const payload: BankAccountCreateInput & Record<string, unknown> = {
        name: formName.trim(),
        account_name: formName.trim(),
        bank_name: formBankName.trim(),
        account_number_mask: maskVal,
        account_type: formType,
        opening_balance_paise: openingPaise,
        opening_date: formOpeningDate,
        opening_balance_date: formOpeningDate,
        is_primary: formIsPrimary,
      }

      if (editingAccount) {
        await api.updateBankAccount(editingAccount.id, payload)
        showToast({ title: 'Account Updated', description: 'Bank account details updated.' })
      } else {
        await api.createBankAccount(payload)
        showToast({ title: 'Account Added', description: 'New bank account linked to MoneyTrack.' })
      }

      setIsDialogOpen(false)
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Could not save bank account.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRecalculate = async (id: number) => {
    setRecalculatingId(id)
    try {
      await api.recalculateAccountBalance(id)
      showToast({ title: 'Balance Recalculated', description: 'Ledger transactions recalculated from ground up.' })
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Recalculation Failed',
        description: err instanceof Error ? err.message : 'Error recalculating balance.',
        variant: 'error',
      })
    } finally {
      setRecalculatingId(null)
    }
  }

  const handleReconcile = async (id: number) => {
    setReconcilingId(id)
    try {
      await api.reconcileBankAccount(id)
      showToast({ title: 'Account Reconciled', description: 'Opening balance calibrated to match bank statement.' })
      accountsQuery.refetch()
      window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
    } catch (err) {
      showToast({
        title: 'Reconciliation Failed',
        description: err instanceof Error ? err.message : 'Error reconciling balance.',
        variant: 'error',
      })
    } finally {
      setReconcilingId(null)
    }
  }

  const handleReportBalance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportingAccount) return
    const balancePaise = parseRupeesToPaise(reportBalanceInput)
    if (balancePaise === null) {
      showToast({ title: 'Invalid Balance', description: 'Please enter a valid amount.', variant: 'error' })
      return
    }

    setReporting(true)
    try {
      await api.reportBankBalance(reportingAccount.id, balancePaise)
      showToast({ title: 'Reported Balance Updated', description: 'Bank statement snapshot recorded.' })
      setReportingAccount(null)
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Could not update reported balance.',
        variant: 'error',
      })
    } finally {
      setReporting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteBankAccount(deleteTarget.id)
      showToast({ title: 'Account Deleted', description: 'Bank account removed.' })
      setDeleteTarget(null)
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Could not delete bank account.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  if (accountsQuery.loading && !accountsQuery.data) {
    return <PageSkeleton />
  }

  if (accountsQuery.error) {
    return (
      <div className="page">
        <ErrorState
          title="Could not load bank accounts"
          description={accountsQuery.error instanceof Error ? accountsQuery.error.message : 'An error occurred'}
          onRetry={() => accountsQuery.refetch()}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Banking & accounts"
        title="Bank Accounts & Reconciliation"
        description="Multi-account tracking with automatic SMS reconciliation"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add account</span>
            </Button>
          </div>
        }
      />

      {/* Consolidated Balance Card */}
      <div className="card p-5 sm:p-6 mb-6 bg-surface border border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-muted mb-1 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted" aria-hidden="true" />
              <span>Consolidated net balance</span>
            </div>
            <div className="text-3xl sm:text-4xl font-semibold text-text font-mono tabular-nums">
              {formatINR(consolidatedPaise)}
            </div>
            <div className="text-xs text-muted mt-1">
              Calculated across {accounts.length} active account{accounts.length === 1 ? '' : 's'} (Opening + Incomes - Expenses ± Transfers)
            </div>
          </div>

          <div className="sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-border">
            <div className="text-xs font-medium text-muted mb-1">
              Bank-reported total (SMS)
            </div>
            <div className="text-2xl font-semibold text-text font-mono tabular-nums">
              {formatINR(reportedPaise)}
            </div>
            <div className="mt-1.5">
              {discrepancyPaise === 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary-soft px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Reconciled with SMS</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning bg-warning-soft px-2 py-0.5 rounded-md font-mono tabular-nums">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  <span>Variance: {formatINR(Math.abs(discrepancyPaise))}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Accounts List Grid */}
      {accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((account) => {
            const accDiscrepancy = (account.last_reported_balance_paise ?? account.current_balance_paise) - account.current_balance_paise
            const isReconciled = account.last_reported_balance_paise != null && accDiscrepancy === 0

            return (
              <div
                key={account.id}
                className="card p-5 hover:border-border-strong transition-colors flex flex-col justify-between"
              >
                <div>
                  {/* Account Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-surface-raised text-muted border border-border">
                        {account.account_type === 'credit_card' ? (
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                        ) : account.account_type === 'cash' || account.account_type === 'wallet' ? (
                          <Wallet className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-base text-text flex items-center gap-2">
                          <span>{account.name || (account as any).account_name}</span>
                          {account.is_primary && (
                            <Badge tone="primary">Primary</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted font-mono tabular-nums">
                          {account.bank_name} {account.account_number_mask && `· ••${account.account_number_mask}`}
                        </div>
                      </div>
                    </div>

                    <Badge tone="neutral">{ACCOUNT_TYPE_LABELS[account.account_type]}</Badge>
                  </div>

                  {/* Balance Display */}
                  <div className="my-4 p-3.5 rounded-lg bg-surface-raised border border-border">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs font-medium text-muted">
                        Current calculated balance
                      </span>
                      <span className="text-xl sm:text-2xl font-semibold text-text font-mono tabular-nums">
                        {formatINR(account.current_balance_paise || account.last_reported_balance_paise || 0)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-muted flex items-center gap-1">
                        <span>Latest SMS Balance:</span>
                        <strong className="text-sky-300 font-mono">
                          {account.last_reported_balance_paise != null
                            ? formatINR(account.last_reported_balance_paise)
                            : 'None reported'}
                        </strong>
                      </span>

                      {account.last_reported_balance_paise != null && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isReconciled
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {isReconciled ? '✓ Matched' : `Δ ${formatINR(Math.abs(accDiscrepancy))}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="text-[11px] text-muted space-y-1">
                    <div>Opening Balance: {formatINR(account.opening_balance_paise)} on {formatDate(account.opening_date || (account as any).opening_balance_date)}</div>
                    {account.last_reported_at && (
                      <div>Last SMS Sync: {formatDate(account.last_reported_at)}</div>
                    )}
                  </div>
                </div>

                {/* Account Actions Bar */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRecalculate(account.id)}
                      disabled={recalculatingId === account.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${recalculatingId === account.id ? 'animate-spin' : ''}`} aria-hidden="true" />
                      <span>Recalculate</span>
                    </button>
                    {!isReconciled && account.last_reported_balance_paise != null && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={reconcilingId === account.id}
                        onClick={() => handleReconcile(account.id)}
                        className="text-xs h-7 px-2.5"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        <span>{reconcilingId === account.id ? 'Reconciling...' : 'Reconcile with SMS'}</span>
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReportingAccount(account)
                        setReportBalanceInput(
                          account.last_reported_balance_paise != null
                            ? (account.last_reported_balance_paise / 100).toString()
                            : (account.current_balance_paise / 100).toString()
                        )
                      }}
                    >
                      Update Balance
                    </Button>

                    <button
                      type="button"
                      onClick={() => openEditDialog(account)}
                      className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(account)}
                      className="p-1.5 rounded-lg text-muted hover:text-rose-400 hover:bg-surface transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <EmptyState
            icon={Building2}
            title="No bank accounts added"
            description="Add your savings accounts, current accounts, or wallets to track balances and auto-reconcile bank SMS."
            action={
              <Button variant="primary" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add first bank account</span>
              </Button>
            }
          />
        </div>
      )}

      {/* Add / Edit Bank Account Modal */}
      <Modal
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving...' : editingAccount ? 'Save Changes' : 'Add Account'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">Account Nickname *</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Salary Account, Emergency Fund"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Bank Name *</label>
              <input
                type="text"
                required
                value={formBankName}
                onChange={(e) => setFormBankName(e.target.value)}
                placeholder="e.g. HDFC Bank, SBI, ICICI"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Masked Suffix (Last 4 Digits)</label>
              <input
                type="text"
                maxLength={4}
                value={formMask}
                onChange={(e) => setFormMask(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 8824"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-text focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Account Type *</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as AccountType)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              >
                <option value="savings">Savings Account</option>
                <option value="current">Current Account</option>
                <option value="credit_card">Credit Card</option>
                <option value="wallet">Digital Wallet</option>
                <option value="cash">Physical Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Opening Date *</label>
              <input
                type="date"
                required
                value={formOpeningDate}
                onChange={(e) => setFormOpeningDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Opening Balance (₹) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={formOpeningBalance}
              onChange={(e) => setFormOpeningBalance(e.target.value)}
              placeholder="Initial balance on opening date"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm font-semibold text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[11px] text-muted mt-1 block">
              Calculated balance will be: Opening Balance + All Incomes - All Expenses ± Transfers
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isPrimaryCheckbox"
              checked={formIsPrimary}
              onChange={(e) => setFormIsPrimary(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="isPrimaryCheckbox" className="text-xs text-text select-none cursor-pointer">
              Set as Primary Account (default for new expenses & incomes)
            </label>
          </div>
        </form>
      </Modal>

      {/* Manual Report Balance Modal */}
      <Modal
        open={Boolean(reportingAccount)}
        onClose={() => setReportingAccount(null)}
        title={`Update Balance — ${reportingAccount?.name ?? ''}`}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setReportingAccount(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="button" disabled={reporting} onClick={handleReportBalance}>
              {reporting ? 'Updating...' : 'Save Statement Balance'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleReportBalance} className="space-y-3">
          <p className="text-xs text-muted">
            Record the latest balance reported by {reportingAccount?.bank_name} via SMS or netbanking. This allows MoneyTrack to detect missing entries or bank fees.
          </p>
          <div>
            <label className="block text-xs font-semibold text-text mb-1">Reported Balance (₹) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={reportBalanceInput}
              onChange={(e) => setReportBalanceInput(e.target.value)}
              placeholder="e.g. 45200.50"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm font-bold text-text focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Bank Account?"
        description={`Are you sure you want to delete ${deleteTarget?.name}? Historical transactions linked to this account will remain in your records.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete Account'}
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
