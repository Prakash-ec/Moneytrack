import { AlertTriangle, CheckCircle2, Phone, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/providers/ToastProvider'
import { api, ApiError } from '@/services/api'
import type { SecurityActionResponse, SecurityAlert, SecuritySummary } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR } from '@/utils/currency'

type SecurityFilter = 'NEEDS_REVIEW' | 'ALL' | 'DISPUTED' | 'RECOGNISED'

const FILTERS: Array<{ id: SecurityFilter; label: string }> = [
  { id: 'NEEDS_REVIEW', label: 'Needs review' },
  { id: 'ALL', label: 'All alerts' },
  { id: 'DISPUTED', label: 'Disputed' },
  { id: 'RECOGNISED', label: 'Recognised' },
]

const HELPLINES = [
  { bank: 'State Bank of India (SBI)', phone: '1800 11 1109 / 1800 425 3800' },
  { bank: 'HDFC Bank', phone: '1800 1600 / 1800 266 4060' },
  { bank: 'ICICI Bank', phone: '1800 1080' },
  { bank: 'Axis Bank', phone: '1860 419 5555' },
  { bank: 'Kotak Mahindra Bank', phone: '1860 266 2666' },
  { bank: 'Punjab National Bank (PNB)', phone: '1800 1800 / 1800 2021' },
]

function severityTone(severity: SecurityAlert['severity']) {
  if (severity === 'CRITICAL') return 'text-danger'
  if (severity === 'WARNING') return 'text-warning'
  return 'text-primary'
}

export default function SecurityCentrePage() {
  const { showToast } = useToast()
  const [summary, setSummary] = useState<SecuritySummary | null>(null)
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [filter, setFilter] = useState<SecurityFilter>('NEEDS_REVIEW')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  const [disputeModalOpen, setDisputeModalOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeResult, setDisputeResult] = useState<SecurityActionResponse | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sumData, alertData] = await Promise.all([
        api.getSecuritySummary(),
        api.listSecurityAlerts(filter === 'ALL' ? undefined : filter),
      ])
      setSummary(sumData)
      setAlerts(alertData)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to load the security centre. Check the backend connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [filter])

  const handleRecognise = async (alertId: number) => {
    setActionLoadingId(alertId)
    try {
      await api.actionSecurityAlert(alertId, 'recognise')
      await loadData()
    } catch (err) {
      showToast({
        title: 'Could not update alert',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  const openDisputeModal = (alert: SecurityAlert) => {
    setSelectedAlert(alert)
    setDisputeReason('')
    setDisputeResult(null)
    setDisputeModalOpen(true)
  }

  const handleConfirmDispute = async () => {
    if (!selectedAlert) return
    setActionLoadingId(selectedAlert.id)
    try {
      const result = await api.actionSecurityAlert(selectedAlert.id, 'dispute', disputeReason)
      setDisputeResult(result)
      await loadData()
    } catch (err) {
      showToast({
        title: 'Could not register dispute',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="Protection"
        title="Payment security"
        description="Unusual amounts, unfamiliar merchants and rapid debits, surfaced for review."
        actions={
          <Button variant="secondary" onClick={loadData} loading={loading}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary-border bg-primary-soft text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-text">Protection is active</p>
              <p className="mt-1 max-w-lg text-[12px] leading-5 text-muted">
                New debits are inspected for amounts well above your average, unfamiliar
                merchants, and rapid consecutive charges. Nothing is blocked automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-border pt-4">
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted">Needs review</p>
            <p className="mt-1 font-mono text-[20px] font-medium tabular-nums text-warning">
              {summary ? summary.needs_review_count : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted">Disputed</p>
            <p className="mt-1 font-mono text-[20px] font-medium tabular-nums text-danger">
              {summary ? summary.disputed_count : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted">Total monitored</p>
            <p className="mt-1 font-mono text-[20px] font-medium tabular-nums text-text">
              {summary ? summary.total_alerts : '—'}
            </p>
          </div>
        </div>
      </Panel>

      <div
        className="mt-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 no-scrollbar"
        role="tablist"
        aria-label="Security alert filter"
      >
        {FILTERS.map((item) => {
          const selected = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(item.id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                selected ? 'bg-surface-raised text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState description={error} onRetry={loadData} />
        </div>
      ) : alerts.length === 0 ? (
        <Panel className="mt-4">
          <EmptyState
            icon={ShieldCheck}
            title={filter === 'NEEDS_REVIEW' ? 'Nothing needs review' : 'No alerts in this view'}
            description="MoneyTrack will surface an alert here when a transaction triggers the unusual-amount, unfamiliar-merchant or rapid-debit checks."
          />
        </Panel>
      ) : (
        <div className="mt-4 space-y-3">
          {alerts.map((alert) => {
            const isDisputed = alert.status === 'DISPUTED'
            const isRecognised = alert.status === 'RECOGNISED'

            return (
              <Panel
                key={alert.id}
                className={cn(
                  'p-4 sm:p-5',
                  isDisputed && 'border-danger-border',
                  !isDisputed && !isRecognised && 'border-warning-border',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised',
                        severityTone(alert.severity),
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium text-text">
                          {alert.merchant || 'Unfamiliar recipient'}
                        </span>
                        <Badge
                          tone={
                            isDisputed ? 'danger' : isRecognised ? 'positive' : 'warning'
                          }
                        >
                          {alert.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                        {alert.account_suffix ? (
                          <span className="font-mono text-[10px] text-subtle">
                            A/c ••{alert.account_suffix}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-muted">{alert.reason}</p>
                    </div>
                  </div>

                  <div className="shrink-0 sm:text-right">
                    <p className="font-mono text-[15px] font-medium tabular-nums text-text">
                      {formatINR(alert.amount_paise)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] tabular-nums text-subtle">
                      {new Date(alert.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {isDisputed && alert.dispute_reason ? (
                  <div className="mt-3 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-[11px] leading-5 text-text">
                    <span className="font-medium text-danger">Reported dispute: </span>
                    {alert.dispute_reason}
                  </div>
                ) : null}

                {alert.status === 'NEEDS_REVIEW' ? (
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRecognise(alert.id)}
                      disabled={actionLoadingId === alert.id}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      I recognise this
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-danger"
                      onClick={() => openDisputeModal(alert)}
                      disabled={actionLoadingId === alert.id}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      I don't recognise this
                    </Button>
                  </div>
                ) : null}
              </Panel>
            )
          })}
        </div>
      )}

      <Panel className="mt-4">
        <PanelHeader
          title="Bank fraud helplines"
          description="Call your bank directly to freeze a card or UPI handle. MoneyTrack cannot reverse a transaction."
          action={<Phone className="h-4 w-4 text-muted" aria-hidden="true" />}
        />
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5 md:grid-cols-3">
          {HELPLINES.map((item) => (
            <div
              key={item.bank}
              className="rounded-lg border border-border bg-surface-raised px-3.5 py-3"
            >
              <p className="text-[12px] font-medium text-text">{item.bank}</p>
              <a
                href={`tel:${item.phone.split(' ')[0]}`}
                className="mt-1 block font-mono text-[11px] text-primary hover:underline"
              >
                {item.phone}
              </a>
            </div>
          ))}
        </div>

        <div className="mx-4 mb-4 rounded-lg border border-primary-border bg-primary-soft px-4 py-3 sm:mx-5 sm:mb-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-primary">National cybercrime helpline</p>
            <a href="tel:1930" className="font-mono text-[14px] font-semibold text-primary">
              1930
            </a>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            Report financial fraud to the Ministry of Home Affairs at{' '}
            <a
              href="https://cybercrime.gov.in"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline"
            >
              cybercrime.gov.in
            </a>
            .
          </p>
        </div>
      </Panel>

      <Modal
        open={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Dispute this debit"
        description="Flag the charge as unrecognised and see the recommended emergency steps."
        footer={
          <div className="flex w-full flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setDisputeModalOpen(false)}>
              Close
            </Button>
            {!disputeResult ? (
              <Button
                variant="danger"
                onClick={handleConfirmDispute}
                loading={actionLoadingId !== null}
              >
                Register dispute
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setDisputeModalOpen(false)}>
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {selectedAlert ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3.5 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text">
                  {selectedAlert.merchant || 'Unfamiliar recipient'}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">{selectedAlert.reason}</p>
              </div>
              <p className="shrink-0 font-mono text-[14px] font-medium tabular-nums text-danger">
                {formatINR(selectedAlert.amount_paise)}
              </p>
            </div>
          ) : null}

          {!disputeResult ? (
            <Field label="What happened?" optional>
              <Textarea
                value={disputeReason}
                onChange={(event) => setDisputeReason(event.target.value)}
                placeholder="I did not make this purchase, my phone was not with me, duplicate charge…"
                rows={3}
              />
            </Field>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-danger-border bg-danger-soft px-3.5 py-3">
                <p className="text-[12px] font-medium text-danger">Dispute recorded</p>
                <p className="mt-0.5 text-[11px] leading-5 text-text">
                  The ledger entry stays in your records. MoneyTrack does not contact the bank for
                  you.
                </p>
              </div>

              {disputeResult.fraud_guidance ? (
                <div>
                  <p className="text-[12px] font-medium text-text">Recommended immediate actions</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-5 text-muted">
                    {disputeResult.fraud_guidance.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-3">
                <p className="text-[12px] font-medium text-text">National cybercrime helpline</p>
                <p className="mt-1 font-mono text-[15px] font-semibold text-primary">
                  {disputeResult.cybercrime_helpline || '1930'}
                </p>
                <p className="mt-1 break-all text-[11px] text-muted">
                  {disputeResult.cybercrime_url || 'https://cybercrime.gov.in'}
                </p>
              </div>
            </div>
          )}

          <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[10px] leading-5 text-muted">
            <span className="font-medium text-text">Note: </span>
            MoneyTrack reads SMS notifications and keeps your ledger. It cannot reverse a
            transaction or freeze bank funds — use the helplines above.
          </p>
        </div>
      </Modal>
    </AppPage>
  )
}
