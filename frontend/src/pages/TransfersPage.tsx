import { ArrowLeftRight, ArrowRight, Info, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { BankAccount, TransferCreateInput } from '@/types/api'
import { formatINR, parseRupeesToPaise } from '@/utils/currency'
import { formatDate, todayIST } from '@/utils/dates'
import { formatRangeLabel } from '@/utils/periods'

export function TransfersPage({ embedded = false }: { embedded?: boolean } = {}) {
  useDocumentTitle('Account Transfers')
  const period = usePeriod()
  const navigate = useNavigate()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const { start, end } = period.range

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [fromAccountId, setFromAccountId] = useState<number | ''>('')
  const [toAccountId, setToAccountId] = useState<number | ''>('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(() => todayIST())
  const [formReference, setFormReference] = useState('')
  const [formNote, setFormNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const bankAccountsQuery = useApiQuery(['bank-accounts'], () => api.listBankAccounts())
  const transfersQuery = useApiQuery(['transfers', start, end], () =>
    api.listTransfers({ start_date: start, end_date: end }),
  )

  const bankAccounts: BankAccount[] = bankAccountsQuery.data?.items ?? []
  const transfers = transfersQuery.data?.items ?? []
  const totalTransferPaise = transfers.reduce((sum, transfer) => sum + transfer.amount_paise, 0)

  const openCreateDialog = () => {
    setFromAccountId(bankAccounts[0]?.id ?? '')
    setToAccountId(bankAccounts[1]?.id ?? '')
    setFormAmount('')
    setFormDate(todayIST())
    setFormReference('')
    setFormNote('')
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromAccountId || !toAccountId) {
      showToast({
        title: 'Select both accounts',
        description: 'A transfer needs a source and a destination.',
        variant: 'error',
      })
      return
    }
    if (fromAccountId === toAccountId) {
      showToast({
        title: 'Invalid transfer',
        description: 'Source and destination must be different accounts.',
        variant: 'error',
      })
      return
    }
    const amountPaise = parseRupeesToPaise(formAmount)
    if (!amountPaise || amountPaise <= 0) {
      showToast({
        title: 'Invalid amount',
        description: 'Enter a transfer amount greater than zero.',
        variant: 'error',
      })
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
      showToast({
        title: 'Transfer recorded',
        description: 'Both account balances were adjusted in one transaction.',
      })
      setIsDialogOpen(false)
      invalidate()
      transfersQuery.refetch()
      bankAccountsQuery.refetch()
    } catch (err) {
      showToast({
        title: 'Could not record transfer',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const content = (() => {
    if (transfersQuery.loading && !transfersQuery.data) {
      return <PageSkeleton />
    }

    if (transfersQuery.error) {
      return (
        <ErrorState
          title="Could not load transfers"
          description={
            transfersQuery.error instanceof Error
              ? transfersQuery.error.message
              : 'The transfer request failed.'
          }
          onRetry={() => transfersQuery.refetch()}
        />
      )
    }

    return (
      <>
        {!embedded ? (
          <PageHeader
            eyebrow="Internal ledger"
            title="Account transfers"
            description={`${formatRangeLabel(period.range)} · Asia/Kolkata`}
            actions={
              <>
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
                  title={
                    bankAccounts.length < 2
                      ? 'Add at least two bank accounts to transfer between them'
                      : undefined
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New transfer
                </Button>
              </>
            }
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Moved in period</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
              {formatINR(totalTransferPaise)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {transfers.length} movement{transfers.length === 1 ? '' : 's'} shown
            </p>
          </Panel>

          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Accounts available</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
              {bankAccounts.length}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {bankAccounts.length < 2
                ? 'Two accounts are required'
                : 'Eligible as source or destination'}
            </p>
          </Panel>

          <Panel className="p-4">
            <p className="text-[11px] font-medium text-muted">Net worth impact</p>
            <p className="mt-1.5 font-mono text-[22px] font-medium tabular-nums tracking-[-0.02em] text-text">
              ₹0.00
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Internal movement never changes consolidated balance
            </p>
          </Panel>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-[12px] leading-5 text-muted">
            A transfer debits one account and credits another in the same database transaction.
            It does not appear as income or expense.
          </p>
        </div>

        <Panel className="mt-4 overflow-hidden">
          <PanelHeader
            title="Transfer history"
            description={formatRangeLabel(period.range)}
            action={
              bankAccounts.length >= 2 && embedded ? (
                <Button variant="primary" size="sm" onClick={openCreateDialog}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Transfer
                </Button>
              ) : null
            }
          />

          {transfers.length > 0 ? (
            <ul className="divide-y divide-border">
              {transfers.map((transfer) => {
                const from = transfer.from_account
                const to = transfer.to_account
                return (
                  <li
                    key={transfer.id}
                    className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-muted">
                      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-text">
                        <span className="truncate">{from?.name ?? 'Source account'}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
                        <span className="truncate">{to?.name ?? 'Destination account'}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        <span>{formatDate(transfer.transfer_date)}</span>
                        {from ? (
                          <span className="truncate">
                            {from.bank_name}
                            {from.account_number_mask ? ` ••${from.account_number_mask}` : ''}
                          </span>
                        ) : null}
                        {transfer.reference ? (
                          <span className="truncate font-mono text-[10px] text-subtle">
                            Ref {transfer.reference}
                          </span>
                        ) : null}
                      </p>
                      {transfer.note ? (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                          {transfer.note}
                        </p>
                      ) : null}
                    </div>

                    <p className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-text sm:text-right">
                      {formatINR(transfer.amount_paise)}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transfers in this period"
              description={
                bankAccounts.length >= 2
                  ? 'Move money between your own accounts without changing income or expenses.'
                  : 'Add at least two bank accounts before recording an internal transfer.'
              }
              action={
                bankAccounts.length >= 2 ? (
                  <Button variant="primary" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Record a transfer
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => navigate('/bank-accounts')}>
                    Add bank accounts
                  </Button>
                )
              }
            />
          )}
        </Panel>

        <Modal
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Record account transfer"
          description="Both sides post together. The consolidated balance stays unchanged."
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="transfer-form" loading={submitting}>
                Complete transfer
              </Button>
            </div>
          }
        >
          <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From account" required>
                <Select
                  required
                  value={fromAccountId}
                  onChange={(event) => setFromAccountId(Number(event.target.value))}
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={acc.id === toAccountId}>
                      {acc.name} · {formatINR(acc.current_balance_paise)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="To account" required>
                <Select
                  required
                  value={toAccountId}
                  onChange={(event) => setToAccountId(Number(event.target.value))}
                >
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={acc.id === fromAccountId}>
                      {acc.name} · {formatINR(acc.current_balance_paise)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

              <Field label="Date" required>
                <Input
                  type="date"
                  required
                  value={formDate}
                  onChange={(event) => setFormDate(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Reference or UTR" optional hint="Useful when reconciling against a bank statement.">
              <Input
                type="text"
                value={formReference}
                onChange={(event) => setFormReference(event.target.value)}
                placeholder="IMPS, NEFT or UPI reference"
                className="font-mono text-[12px]"
              />
            </Field>

            <Field label="Note" optional>
              <Textarea
                rows={2}
                value={formNote}
                onChange={(event) => setFormNote(event.target.value)}
                placeholder="Why the money moved"
              />
            </Field>
          </form>
        </Modal>
      </>
    )
  })()

  if (embedded) return <div>{content}</div>
  return <AppPage>{content}</AppPage>
}
