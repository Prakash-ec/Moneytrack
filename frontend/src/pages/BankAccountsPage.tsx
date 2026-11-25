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

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Panel } from '@/components/ui/Panel'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { AccountType, BankAccount, BankAccountCreateInput } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate, todayIST } from '@/utils/dates'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: 'Savings',
  current: 'Current',
  credit_card: 'Credit card',
  wallet: 'Wallet',
  cash: 'Cash',
}

function AccountIcon({ type }: { type: AccountType }) {
  const Icon = type === 'credit_card' ? CreditCard : type === 'wallet' || type === 'cash' ? Wallet : Building2
  return <Icon className="h-4 w-4" aria-hidden="true" />
}

export function BankAccountsPage() {
  useDocumentTitle('Accounts & Reconciliation')
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [formName, setFormName] = useState('')
  const [formBankName, setFormBankName] = useState('')
  const [formMask, setFormMask] = useState('')
  const [formType, setFormType] = useState<AccountType>('savings')
  const [formOpeningBalance, setFormOpeningBalance] = useState('')
  const [formOpeningDate, setFormOpeningDate] = useState(() => todayIST())
  const [formIsPrimary, setFormIsPrimary] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [reportingAccount, setReportingAccount] = useState<BankAccount | null>(null)
  const [reportBalanceInput, setReportBalanceInput] = useState('')
  const [reporting, setReporting] = useState(false)

  const [recalculatingId, setRecalculatingId] = useState<number | null>(null)
  const [reconcilingId, setReconcilingId] = useState<number | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)
  const [deleting, setDeleting] = useState(false)

  const accountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts(true))
  const accounts = accountsQuery.data?.items ?? []

  // Show the calculated total exactly as stored. Never substitute the reported
  // total when the calculated total is zero — that would hide a real variance.
  const calculatedPaise = accountsQuery.data?.consolidated_balance_paise ?? 0
  const reportedPaise = accountsQuery.data?.total_reported_balance_paise
  const hasReportedTotal = reportedPaise !== undefined && reportedPaise !== null
  const discrepancyPaise = hasReportedTotal ? reportedPaise - calculatedPaise : 0

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
    setFormBankName('')
    setFormMask('')
    setFormType('savings')
    setFormOpeningBalance('0')
    setFormOpeningDate(todayIST())
    setFormIsPrimary(accounts.length === 0)
    setIsDialogOpen(true)
  }

  const openEditDialog = (account: BankAccount) => {
    setEditingAccount(account)
    setFormName(account.name)
    setFormBankName(account.bank_name)
    setFormMask(account.account_number_mask ?? '')
    setFormType(account.account_type || 'savings')
    setFormOpeningBalance(((account.opening_balance_paise ?? 0) / 100).toString())
    setFormOpeningDate(account.opening_date || todayIST())
    setFormIsPrimary(Boolean(account.is_primary))
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formBankName.trim()) {
      showToast({
        title: 'Missing account details',
        description: 'A nickname and bank name are required.',
        variant: 'error',
      })
      return
    }

    const openingPaise = parseRupeesToPaise(formOpeningBalance) ?? 0

    setSubmitting(true)
    try {
      const payload: BankAccountCreateInput & Record<string, unknown> = {
        name: formName.trim(),
        account_name: formName.trim(),
        bank_name: formBankName.trim(),
        account_number_mask: formMask.trim() || 'XX0000',
        account_type: formType,
        opening_balance_paise: openingPaise,
        opening_date: formOpeningDate,
        opening_balance_date: formOpeningDate,
        is_primary: formIsPrimary,
      }

      if (editingAccount) {
        await api.updateBankAccount(editingAccount.id, payload)
        showToast({ title: 'Account updated', description: 'Details saved.' })
      } else {
        await api.createBankAccount(payload)
        showToast({ title: 'Account added', description: 'It can now receive expenses and income.' })
      }

      setIsDialogOpen(false)
      invalidate()
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Could not save account',
        description: err instanceof Error ? err.message : 'Please try again.',
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
      showToast({
        title: 'Balance recalculated',
        description: 'Every posted entry was replayed from the opening balance.',
      })
      invalidate()
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Recalculation failed',
        description: err instanceof Error ? err.message : 'Please try again.',
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
      showToast({
        title: 'Account reconciled',
        description: 'The opening balance was calibrated to the reported statement balance.',
      })
      invalidate()
      accountsQuery.refetch()
      window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
    } catch (err) {
      showToast({
        title: 'Reconciliation failed',
        description: err instanceof Error ? err.message : 'Please try again.',
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
      showToast({
        title: 'Invalid balance',
        description: 'Enter an amount greater than zero.',
        variant: 'error',
      })
      return
    }

    setReporting(true)
    try {
      await api.reportBankBalance(reportingAccount.id, balancePaise)
      showToast({
        title: 'Reported balance saved',
        description: 'A bank statement snapshot was added to the audit trail.',
      })
      setReportingAccount(null)
      invalidate()
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Could not save balance',
        description: err instanceof Error ? err.message : 'Please try again.',
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
      showToast({ title: 'Account deleted', description: 'Its historical entries remain in the ledger.' })
      setDeleteTarget(null)
      invalidate()
      accountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  if (accountsQuery.loading && !accountsQuery.data) {
    return (
      <AppPage>
        <PageSkeleton />
      </AppPage>
    )
  }

  if (accountsQuery.error) {
    return (
      <AppPage>
        <ErrorState
          title="Could not load accounts"
          description={
            accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : 'The accounts request failed.'
          }
          onRetry={() => accountsQuery.refetch()}
        />
      </AppPage>
    )
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="Banking"
        title="Accounts & reconciliation"
        description="Calculated balances, bank-reported snapshots and the variance between them."
        actions={
          <Button variant="primary" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add account
          </Button>
        }
      />

      <Panel className="p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_auto] lg:items-start">
          <div>
            <p className="text-[11px] font-medium text-muted">Consolidated calculated balance</p>
            <p className="mt-1.5 break-words font-mono text-[30px] font-medium leading-none tabular-nums tracking-[-0.03em] text-text sm:text-[34px]">
              {formatINR(calculatedPaise)}
            </p>
            <p className="mt-2 max-w-sm text-[11px] leading-5 text-muted">
              Opening balances plus every posted income, expense and transfer. Zero and negative
              values are shown as they are.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted">Last bank-reported total</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
              {hasReportedTotal ? formatINR(reportedPaise) : 'Not reported'}
            </p>
            <p className="mt-2 text-[11px] leading-5 text-muted">
              {hasReportedTotal
                ? 'Latest balance reported by SMS or a manual statement entry.'
                : 'Add a reported balance on an account to start reconciliation.'}
            </p>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <p className="text-[11px] font-medium text-muted">Variance</p>
            {!hasReportedTotal ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-muted">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Nothing to compare yet
              </p>
            ) : discrepancyPaise === 0 ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-positive-border bg-positive-soft px-2.5 py-1 text-[11px] font-medium text-positive">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Reconciled
              </p>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {formatINR(Math.abs(discrepancyPaise))} {discrepancyPaise > 0 ? 'reported above ledger' : 'reported below ledger'}
              </p>
            )}
            <p className="mt-2 text-[11px] leading-5 text-muted">
              {accounts.length} active account{accounts.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </Panel>

      {accounts.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {accounts.map((account) => {
            const reported = account.last_reported_balance_paise
            const variance = reported != null ? reported - account.current_balance_paise : null
            const isReconciled = variance === 0

            return (
              <Panel key={account.id} className="flex flex-col p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-muted">
                      <AccountIcon type={account.account_type} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-text">
                        <span className="truncate">{account.name}</span>
                        {account.is_primary ? <Badge tone="primary">Primary</Badge> : null}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {account.bank_name}
                        {account.account_number_mask ? ` · ••${account.account_number_mask}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge tone="neutral">{ACCOUNT_TYPE_LABELS[account.account_type]}</Badge>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-surface-raised px-3.5 py-3">
                  <p className="text-[10px] font-medium text-muted">Calculated balance</p>
                  <p className="mt-1 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
                    {formatINR(account.current_balance_paise)}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                    <span className="text-[11px] text-muted">
                      Reported{' '}
                      <span className="font-mono tabular-nums text-text">
                        {reported != null ? formatINR(reported) : '—'}
                      </span>
                    </span>
                    {reported == null ? (
                      <span className="text-[10px] text-muted">No snapshot yet</span>
                    ) : isReconciled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-positive">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Matched
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'font-mono text-[10px] font-medium tabular-nums',
                          variance != null && variance > 0 ? 'text-warning' : 'text-danger',
                        )}
                      >
                        {variance != null ? formatINR(Math.abs(variance)) : '—'} variance
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-[11px] text-muted">
                  <p>
                    Opening {formatINR(account.opening_balance_paise)} on{' '}
                    {formatDate(account.opening_date)}
                  </p>
                  {account.last_reported_at ? (
                    <p>Last snapshot {formatDate(account.last_reported_at.slice(0, 10))}</p>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReportingAccount(account)
                        setReportBalanceInput(
                          account.last_reported_balance_paise != null
                            ? (account.last_reported_balance_paise / 100).toString()
                            : (account.current_balance_paise / 100).toString(),
                        )
                      }}
                    >
                      Update balance
                    </Button>
                    {reported != null && !isReconciled ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={reconcilingId === account.id}
                        onClick={() => handleReconcile(account.id)}
                      >
                        Reconcile
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleRecalculate(account.id)}
                      disabled={recalculatingId === account.id}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
                      aria-label={`Recalculate ${account.name} from its opening balance`}
                      title="Recalculate from ledger"
                    >
                      <RefreshCw
                        className={cn('h-3.5 w-3.5', recalculatingId === account.id && 'animate-spin')}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditDialog(account)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-text"
                      aria-label={`Edit ${account.name}`}
                      title="Edit account"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(account)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      aria-label={`Delete ${account.name}`}
                      title="Delete account"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      ) : (
        <Panel className="mt-4">
          <EmptyState
            icon={Building2}
            title="No accounts yet"
            description="Add a savings account, current account, card, wallet or cash balance. Reconciliation begins with the first reported balance."
            action={
              <Button variant="primary" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add your first account
              </Button>
            }
          />
        </Panel>
      )}

      <Modal
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title={editingAccount ? 'Edit account' : 'Add account'}
        description="The calculated balance starts from the opening balance and every posted entry."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="account-form" loading={submitting}>
              {editingAccount ? 'Save changes' : 'Add account'}
            </Button>
          </div>
        }
      >
        <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Account nickname" required>
            <Input
              type="text"
              required
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              placeholder="Salary account, emergency fund…"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank or institution" required>
              <Input
                type="text"
                required
                value={formBankName}
                onChange={(event) => setFormBankName(event.target.value)}
                placeholder="HDFC Bank, SBI, ICICI…"
              />
            </Field>

            <Field label="Last four digits" optional>
              <Input
                type="text"
                maxLength={4}
                value={formMask}
                onChange={(event) => setFormMask(event.target.value.replace(/\D/g, ''))}
                placeholder="8824"
                inputMode="numeric"
                className="font-mono"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account type" required>
              <Select
                value={formType}
                onChange={(event) => setFormType(event.target.value as AccountType)}
              >
                <option value="savings">Savings account</option>
                <option value="current">Current account</option>
                <option value="credit_card">Credit card</option>
                <option value="wallet">Digital wallet</option>
                <option value="cash">Physical cash</option>
              </Select>
            </Field>

            <Field label="Opening date" required>
              <Input
                type="date"
                required
                value={formOpeningDate}
                onChange={(event) => setFormOpeningDate(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Opening balance (₹)"
            required
            hint="Calculated balance = opening balance + income − expenses ± transfers."
          >
            <Input
              type="number"
              step="0.01"
              required
              value={formOpeningBalance}
              onChange={(event) => setFormOpeningBalance(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="font-mono tabular-nums"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-raised p-3">
            <input
              type="checkbox"
              checked={formIsPrimary}
              onChange={(event) => setFormIsPrimary(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-[12px] leading-5 text-text">
              Set as primary account
              <span className="block text-[11px] text-muted">
                Used as the default account for new expenses and income.
              </span>
            </span>
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(reportingAccount)}
        onClose={() => setReportingAccount(null)}
        title="Update reported balance"
        description={
          reportingAccount
            ? `${reportingAccount.name} · record the latest balance the bank reported.`
            : undefined
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setReportingAccount(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="report-balance-form" loading={reporting}>
              Save snapshot
            </Button>
          </div>
        }
      >
        <form id="report-balance-form" onSubmit={handleReportBalance} className="space-y-4">
          <p className="text-[12px] leading-5 text-muted">
            This does not rewrite the calculated balance. It stores a bank-reported snapshot so the
            variance can be reviewed.
          </p>
          <Field label="Reported balance (₹)" required>
            <Input
              type="number"
              step="0.01"
              required
              value={reportBalanceInput}
              onChange={(event) => setReportBalanceInput(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="font-mono tabular-nums"
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this account?"
        description={`Delete ${deleteTarget?.name ?? 'this account'}? Its historical transactions stay in your ledger, but the account can no longer reconcile them.`}
        confirmLabel="Delete account"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </AppPage>
  )
}
