import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { api, ApiError } from '@/services/api'
import type {
  SecurityAlert,
  SecuritySummary,
  SecurityActionResponse,
} from '@/types/api'
import { cn } from '@/utils/cn'

export default function SecurityCentrePage() {
  const [summary, setSummary] = useState<SecuritySummary | null>(null)
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [filter, setFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'DISPUTED' | 'RECOGNISED'>('NEEDS_REVIEW')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  // Dispute modal state
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
      else setError('Failed to load security centre. Check your backend server.')
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
      alert(err instanceof Error ? err.message : 'Failed to update alert')
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
      alert(err instanceof Error ? err.message : 'Failed to register dispute')
    } finally {
      setActionLoadingId(null)
    }
  }

  const formatInr = (paise: number) => {
    const rupees = Math.abs(paise) / 100
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Payment Security Centre"
        description="Monitor potentially unusual charges, unfamiliar merchants, and rapid transactions."
      />

      {/* Security Shield Overview Banner */}
      <div className="relative overflow-hidden rounded-[1.5rem] border border-line/60 bg-gradient-to-br from-surface-card via-surface to-background p-6 shadow-soft backdrop-blur-xl">
        <div className="absolute right-4 -top-8 -mr-6 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/25 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Account Protection Active</h2>
              <p className="text-xs text-muted max-w-md">
                Heuristic security actively inspects new debits for unusual amounts (&gt;3x average), new merchants, and rapid consecutive debits.
              </p>
            </div>
          </div>

          <div className="flex w-full sm:w-auto items-center gap-3">
            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Counter Pills */}
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line/40 pt-4">
          <div className="rounded-xl bg-surface/50 p-3 text-center border border-line/40">
            <div className="text-xs text-muted">Needs Review</div>
            <div className="mt-1 font-display text-xl font-bold text-amber-400">
              {summary ? summary.needs_review_count : '–'}
            </div>
          </div>
          <div className="rounded-xl bg-surface/50 p-3 text-center border border-line/40">
            <div className="text-xs text-muted">Disputed</div>
            <div className="mt-1 font-display text-xl font-bold text-danger">
              {summary ? summary.disputed_count : '–'}
            </div>
          </div>
          <div className="rounded-xl bg-surface/50 p-3 text-center border border-line/40">
            <div className="text-xs text-muted">Total Monitored</div>
            <div className="mt-1 font-display text-xl font-bold text-ink">
              {summary ? summary.total_alerts : '–'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-medium no-scrollbar">
        {(['NEEDS_REVIEW', 'ALL', 'DISPUTED', 'RECOGNISED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'rounded-xl px-4 py-2 min-h-[44px] transition-all font-semibold shrink-0',
              filter === tab
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface border border-line text-muted hover:text-ink hover:bg-surface-hover'
            )}
          >
            {tab === 'NEEDS_REVIEW' && '⚠️ Needs Review'}
            {tab === 'ALL' && 'All Alerts'}
            {tab === 'DISPUTED' && 'Disputed'}
            {tab === 'RECOGNISED' && 'Recognised'}
          </button>
        ))}
      </div>

      {/* Alerts Feed */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadData} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={filter === 'NEEDS_REVIEW' ? 'All Clear! No alerts need review.' : 'No security alerts found.'}
          description="MoneyTrack will notify you if any transaction triggers suspicious amount, unfamiliar merchant, or rapid debit heuristics."
        />
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const isDisputed = alert.status === 'DISPUTED'
            const isRecognised = alert.status === 'RECOGNISED'

            return (
              <div
                key={alert.id}
                className={cn(
                  'rounded-2xl border p-5 transition-all shadow-sm',
                  isDisputed
                    ? 'border-danger/30 bg-danger/5'
                    : isRecognised
                    ? 'border-line/40 bg-surface/40'
                    : 'border-amber-500/30 bg-surface-card'
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-xs',
                        alert.severity === 'CRITICAL'
                          ? 'bg-danger/20 text-danger border border-danger/30'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      )}
                    >
                      {alert.severity === 'CRITICAL' ? '!' : '⚠️'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-ink">
                          {alert.merchant || 'Unfamiliar Recipient'}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                            alert.status === 'NEEDS_REVIEW' && 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                            alert.status === 'DISPUTED' && 'bg-danger/15 text-danger border border-danger/30',
                            alert.status === 'RECOGNISED' && 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          )}
                        >
                          {alert.status.replace('_', ' ')}
                        </span>
                        {alert.account_suffix && (
                          <span className="text-[10px] text-muted">A/c ending {alert.account_suffix}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{alert.reason}</p>
                    </div>
                  </div>

                  <div className="text-right sm:self-center">
                    <div className="font-display text-lg font-bold text-ink">
                      {formatInr(alert.amount_paise)}
                    </div>
                    <div className="text-[11px] text-muted">
                      {new Date(alert.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                {/* Dispute details if available */}
                {isDisputed && alert.dispute_reason && (
                  <div className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger-soft">
                    <span className="font-semibold text-danger">Reported Dispute: </span>
                    {alert.dispute_reason}
                  </div>
                )}

                {/* Action Controls */}
                {alert.status === 'NEEDS_REVIEW' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-3 border-t border-line/40">
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => handleRecognise(alert.id)}
                      disabled={actionLoadingId === alert.id}
                    >
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      I Recognise This
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-[44px] border-danger/30 text-danger hover:bg-danger/10"
                      onClick={() => openDisputeModal(alert)}
                      disabled={actionLoadingId === alert.id}
                    >
                      <AlertTriangle className="h-4 w-4 text-danger" />
                      I Don't Recognise (Dispute)
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Verified Indian Bank & Cybercrime Helplines Guide */}
      <div className="rounded-2xl border border-line/60 bg-surface-card/60 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-primary" />
          <h3 className="font-display text-sm font-bold text-ink">
            Official Emergency Banking Helplines (24x7)
          </h3>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          If you detect an unauthorised debit or suspected UPI phishing, call your bank's official emergency fraud helpline immediately to freeze your card or UPI handle:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
          {[
            { bank: 'State Bank of India (SBI)', phone: '1800 11 1109 / 1800 425 3800' },
            { bank: 'HDFC Bank', phone: '1800 1600 / 1800 266 4060' },
            { bank: 'ICICI Bank', phone: '1800 1080' },
            { bank: 'Axis Bank', phone: '1860 419 5555' },
            { bank: 'Kotak Mahindra Bank', phone: '1860 266 2666' },
            { bank: 'Punjab National Bank (PNB)', phone: '1800 1800 / 1800 2021' },
          ].map((item, idx) => (
            <div key={idx} className="rounded-xl border border-line/40 bg-surface/50 p-3">
              <div className="font-semibold text-ink">{item.bank}</div>
              <a href={`tel:${item.phone.split(' ')[0]}`} className="mt-1 block text-primary font-mono text-[11px] hover:underline">
                {item.phone}
              </a>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-primary text-xs">National Cybercrime Helpline</span>
            <span className="font-mono text-primary font-bold">1930</span>
          </div>
          <p className="text-[11px] text-muted">
            Report financial fraud directly to the Ministry of Home Affairs at{' '}
            <a
              href="https://cybercrime.gov.in"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline font-medium"
            >
              cybercrime.gov.in
            </a>
          </p>
        </div>
      </div>

      {/* Dispute Modal */}
      <Modal
        open={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Dispute Unrecognised Debit"
        description="Flag this transaction as unrecognised and access verified bank emergency steps."
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setDisputeModalOpen(false)}>
              Close
            </Button>
            {!disputeResult ? (
              <Button
                variant="danger"
                onClick={handleConfirmDispute}
                disabled={actionLoadingId !== null}
              >
                {actionLoadingId !== null ? 'Disputing...' : 'Register Dispute'}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setDisputeModalOpen(false)}>
                Done
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4 py-2 text-xs text-muted">
          {selectedAlert && (
            <div className="rounded-xl bg-surface/60 p-3 border border-line flex items-center justify-between">
              <div>
                <div className="font-bold text-ink text-sm">
                  {selectedAlert.merchant || 'Unfamiliar Recipient'}
                </div>
                <div className="text-[11px] text-muted">{selectedAlert.reason}</div>
              </div>
              <div className="font-display font-bold text-danger text-base">
                {formatInr(selectedAlert.amount_paise)}
              </div>
            </div>
          )}

          {!disputeResult ? (
            <div className="space-y-2">
              <label className="font-semibold text-ink">Dispute Reason (Optional)</label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. I did not make this purchase, phone was in my bag, duplicate charge..."
                rows={3}
                className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-danger font-semibold">
                ✓ Dispute logged in MoneyTrack. The ledger entry is preserved for your records.
              </div>

              {disputeResult.fraud_guidance && (
                <div className="space-y-1.5">
                  <div className="font-bold text-ink">Recommended Immediate Actions:</div>
                  <ul className="list-disc pl-4 space-y-1 text-muted">
                    {disputeResult.fraud_guidance.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-line bg-surface/50 p-3">
                <div className="font-semibold text-ink">National Cybercrime Helpline:</div>
                <div className="mt-1 font-mono text-sm font-bold text-primary">
                  📞 {disputeResult.cybercrime_helpline || '1930'}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  Report on portal: {disputeResult.cybercrime_url || 'https://cybercrime.gov.in'}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-surface/30 p-2.5 text-[10px] text-muted leading-relaxed">
            <span className="font-bold text-ink">Disclaimer: </span>
            MoneyTrack is an offline-capable finance tracker that analyzes SMS notifications. MoneyTrack cannot reverse transactions or freeze bank funds directly. Please contact your bank directly using the helplines above.
          </div>
        </div>
      </Modal>
    </div>
  )
}
