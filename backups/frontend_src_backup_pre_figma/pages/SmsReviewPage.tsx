import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Edit3,
  Inbox,
  Phone,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { useCallback, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/States'
import { Field, Input } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/providers/ToastProvider'
import { SmsPlugin, type PendingTransaction, type SmsSettings } from '@/services/sms'
import { formatDate } from '@/utils/dates'

function CardSkeleton() {
  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="h-4 w-24 animate-pulse rounded-lg bg-line/60" aria-hidden />
      <div className="mt-4 h-8 w-40 animate-pulse rounded-lg bg-line/60" aria-hidden />
      <div className="mt-3 h-3 w-32 animate-pulse rounded-lg bg-line/60" aria-hidden />
    </div>
  )
}

export function SmsReviewPage() {
  useDocumentTitle('SMS review')
  const { showToast } = useToast()

  const [items, setItems] = useState<PendingTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<SmsSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [editing, setEditing] = useState<PendingTransaction | null>(null)
  const [editFields, setEditFields] = useState<{
    amount: string
    merchant: string
    date: string
    note: string
    category: string
  } | null>(null)
  const [rejectConfirm, setRejectConfirm] = useState<{ id: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pending, settingsResult] = await Promise.all([
        SmsPlugin.getPendingTransactions(),
        SmsPlugin.getSettings(),
      ])
      setItems(pending.items)
      setSettings(settingsResult)
    } catch (error) {
      showToast({
        title: 'Could not load SMS transactions',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const handleSync = useCallback(async () => {
    setLoading(true)
    try {
      await SmsPlugin.syncNow()
      await load()
      showToast({
        title: 'Synced',
        description: 'Pending SMS transactions were sent to the backend.',
      })
    } catch (error) {
      showToast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [load, showToast])

  const handleConfirm = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        await SmsPlugin.confirmTransaction({ id })
        setItems((current) => current.filter((item) => item.id !== id))
        showToast({ title: 'Confirmed', description: 'Transaction saved to your records.' })
      } catch (error) {
        showToast({
          title: 'Could not confirm',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        })
      } finally {
        setLoading(false)
      }
    },
    [showToast],
  )

  const handleRejectConfirm = (id: string) => setRejectConfirm({ id })

  const handleReject = useCallback(async () => {
    if (!rejectConfirm) return
    setLoading(true)
    try {
      await SmsPlugin.dismissTransaction({ id: rejectConfirm.id })
      setItems((current) => current.filter((item) => item.id !== rejectConfirm.id))
      setRejectConfirm(null)
      showToast({ title: 'Dismissed', description: 'SMS transaction was removed from review.' })
    } catch (error) {
      showToast({
        title: 'Could not dismiss',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [rejectConfirm, showToast])

  const handleToggleAutomation = useCallback(async () => {
    if (!settings) return
    setSettingsLoading(true)
    try {
      await SmsPlugin.setAutomationEnabled({ enabled: !settings.smsAutomationEnabled })
      await load()
      showToast({
        title: settings.smsAutomationEnabled ? 'Automation disabled' : 'Automation enabled',
        description: settings.smsAutomationEnabled
          ? 'New SMS transactions will no longer be saved automatically.'
          : 'New SMS transactions will be queued for review.',
      })
    } catch (error) {
      showToast({
        title: 'Could not update setting',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSettingsLoading(false)
    }
  }, [settings, load, showToast])

  const handleBackendUrlChange = useCallback(async (url: string) => {
    setSettingsLoading(true)
    try {
      await SmsPlugin.setBackendUrl({ url: url.trim() })
      await load()
      showToast({ title: 'Backend URL updated' })
    } catch (error) {
      showToast({
        title: 'Could not update backend URL',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSettingsLoading(false)
    }
  }, [load, showToast])

  const startEdit = useCallback((item: PendingTransaction) => {
    setEditing(item)
    setEditFields({
      amount: item.amount ?? '',
      merchant: item.merchant,
      date: item.date,
      note: item.note,
      category: item.category,
    })
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editing || !editFields) return
    setLoading(true)
    try {
      await SmsPlugin.updateTransaction({
        id: editing.id,
        amount: editFields.amount || null,
        merchant: editFields.merchant || null,
        date: editFields.date || null,
        note: editFields.note || null,
        type: editFields.category || null,
      })
      await SmsPlugin.confirmTransaction({ id: editing.id })
      setItems((current) => current.filter((item) => item.id !== editing.id))
      setEditing(null)
      setEditFields(null)
      showToast({ title: 'Updated & confirmed', description: 'Transaction saved to your records.' })
    } catch (error) {
      showToast({
        title: 'Could not update',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [editing, editFields, showToast])

  const statusBadge = (status: string) => {
    switch (status) {
      case 'READY_TO_SYNC':
        return <Badge tone="primary">Pending</Badge>
      case 'SYNCED':
        return <Badge tone="positive">Synced</Badge>
      case 'FAILED':
        return <Badge tone="danger">Failed</Badge>
      default:
        return <Badge tone="neutral">{status}</Badge>
    }
  }

  const handleRequestPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const status = await SmsPlugin.requestPermissions()
      await load()
      showToast({
        title: status.granted ? 'Permissions granted' : 'Permissions not granted',
        description:
          'SMS receive and notification permissions are needed for auto-detection.',
        variant: status.granted ? 'success' : 'info',
      })
    } catch (error) {
      showToast({
        title: 'Permission request failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [load, showToast])

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            SMS transactions
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Review detected transactions
          </h1>
          <p className="mt-1 text-sm text-muted">
            Transactions detected from SMS are shown here for your review before being saved.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestPermissions}
            disabled={loading}
          >
            <Phone className="h-4 w-4" aria-hidden />
            Request SMS permission
          </Button>
          <Button onClick={handleSync} disabled={loading}>
            {loading ? null : <RefreshCw className="h-4 w-4" aria-hidden />}
            Sync now
          </Button>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <CardHeader
          title="SMS automation"
          description="Automatically detect and save transactions from incoming SMS messages."
          action={
            <Button
              size="sm"
              variant={settings?.smsAutomationEnabled ? 'primary' : 'secondary'}
              loading={settingsLoading}
              onClick={handleToggleAutomation}
              disabled={!settings}
            >
              {settings?.smsAutomationEnabled ? 'Enabled' : 'Enable'}
            </Button>
          }
        />
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                <Smartphone className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Auto-detect from SMS</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  Incoming bank/UPI SMS messages are scanned and queued for your review.
                </p>
              </div>
            </div>
            <Badge tone={settings?.smsAutomationEnabled ? 'positive' : 'neutral'}>
              {settings?.smsAutomationEnabled ? 'On' : 'Off'}
            </Badge>
          </div>

          {settings && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-line bg-surface">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                  <Bell className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Notify when new SMS transactions are detected.
                  </p>
                </div>
              </div>
              <Badge tone={settings.notificationsEnabled ? 'positive' : 'neutral'}>
                {settings.notificationsEnabled ? 'On' : 'Off'}
              </Badge>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Backend URL</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">
                  Local API address used when confirming transactions on this device.
                </p>
              </div>
            </div>
            <Input
              value={settings?.backendUrl ?? ''}
              onChange={(e) => void handleBackendUrlChange(e.target.value)}
              placeholder="http://192.168.1.x:8000/api"
              disabled={settingsLoading}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Permission status"
          description="SMS receive permission is required on Android to detect incoming messages."
        />
        <div className="mt-4 divide-y divide-line rounded-xl border border-line">
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="flex items-center gap-2 text-xs text-muted">
              <Phone className="h-3.5 w-3.5 text-subtle" aria-hidden />
              SMS receive
            </span>
            <span className="text-xs font-semibold text-ink">
              {settings ? (settings.smsAutomationEnabled ? 'Configured' : 'Not enabled') : 'Loading…'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="flex items-center gap-2 text-xs text-muted">
              <Bell className="h-3.5 w-3.5 text-subtle" aria-hidden />
              Notifications
            </span>
            <span className="text-xs font-semibold text-ink">
              {settings ? (settings.notificationsEnabled ? 'On' : 'Off') : 'Loading…'}
            </span>
          </div>
        </div>
        {!settings?.smsAutomationEnabled && (
          <p className="mt-3 text-[11px] text-warning">
            Enable SMS automation to start detecting transactions from incoming messages.
          </p>
        )}
      </Card>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Pending review
        </p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink">
          {items.length} transaction{items.length === 1 ? '' : 's'} awaiting your review
        </h2>
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No SMS transactions to review"
          description={
            "Detected SMS transactions appear here. Enable SMS automation and make sure you've granted SMS permission on your device."
          }
          action={
            <Button variant="secondary" size="sm" onClick={handleRequestPermissions}>
              <Phone className="h-4 w-4" aria-hidden />
              Request SMS permission
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4 sm:p-5 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-ink truncate">
                      {item.merchant || 'Unknown merchant'}
                    </p>
                    <span className="shrink-0 tabular text-sm font-semibold text-ink">
                      {item.amount ? `₹${item.amount}` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-2">
                    <span>{item.date ? formatDate(item.date) : '—'}</span>
                    <span className="h-[1px] w-px bg-line" />
                    <span>{item.sender || '—'}</span>
                    {item.reference && (
                      <>
                        <span className="h-[1px] w-px bg-line" />
                        <span className="truncate max-w-xs">{item.reference}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">
                      {item.category || 'Uncategorized'}
                    </Badge>
                    {statusBadge(item.status)}
                    {item.error && <AlertCircle className="h-4 w-4 text-danger" aria-hidden />}
                  </div>
                  {item.error && (
                    <p className="mt-1 text-[11px] text-danger">{item.error}</p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(item)}
                    disabled={loading || item.status !== 'READY_TO_SYNC'}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleConfirm(item.id)}
                    disabled={loading || item.status !== 'READY_TO_SYNC'}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Confirm
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRejectConfirm(item.id)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Dismiss
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && editFields && (
        <Modal
          open={Boolean(editing)}
          onClose={() => {
            setEditing(null)
            setEditFields(null)
          }}
          title="Edit transaction"
          size="sm"
        >
          <div className="space-y-4">
            <Field label="Amount (₹)">
              <Input
                value={editFields.amount}
                onChange={(e) =>
                  setEditFields({ ...editFields, amount: e.target.value })
                }
                type="text"
              />
            </Field>
            <Field label="Merchant">
              <Input
                value={editFields.merchant}
                onChange={(e) =>
                  setEditFields({ ...editFields, merchant: e.target.value })
                }
              />
            </Field>
            <Field label="Date">
              <Input
                value={editFields.date}
                onChange={(e) =>
                  setEditFields({ ...editFields, date: e.target.value })
                }
                type="text"
              />
            </Field>
            <Field label="Category">
              <Input
                value={editFields.category}
                onChange={(e) =>
                  setEditFields({ ...editFields, category: e.target.value })
                }
              />
            </Field>
            <Field label="Note">
              <Input
                value={editFields.note}
                onChange={(e) =>
                  setEditFields({ ...editFields, note: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-line">
            <Button variant="secondary" size="sm" onClick={() => {
              setEditing(null)
              setEditFields(null)
            }}>
              Cancel
            </Button>
            <Button size="sm" loading={loading} onClick={saveEdit} disabled={loading}>
              Save & confirm
            </Button>
          </div>
        </Modal>
      )}

      {rejectConfirm && (
        <ConfirmDialog
          open={Boolean(rejectConfirm)}
          onClose={() => setRejectConfirm(null)}
          onConfirm={handleReject}
          loading={loading}
          title="Dismiss this transaction?"
          confirmLabel="Dismiss"
          description="This SMS transaction will be removed from review and not saved to your records."
        />
      )}
    </div>
  )
}
