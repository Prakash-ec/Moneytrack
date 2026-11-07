import { Capacitor } from '@capacitor/core'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit3,
  History,
  Inbox,
  MessageSquare,
  Phone,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/States'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import { SmsPlugin, type PendingTransaction, type SmsSettings } from '@/services/sms'
import type { ExpenseType, IncomeType } from '@/types/api'
import { formatDate } from '@/utils/dates'

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="h-4 w-24 animate-pulse rounded-lg bg-[var(--surface-muted)]" aria-hidden />
      <div className="mt-4 h-8 w-40 animate-pulse rounded-lg bg-[var(--surface-muted)]" aria-hidden />
      <div className="mt-3 h-3 w-32 animate-pulse rounded-lg bg-[var(--surface-muted)]" aria-hidden />
    </div>
  )
}

export function SmsReviewPage() {
  useDocumentTitle('SMS review')
  const { showToast } = useToast()
  const isNative = Capacitor.isNativePlatform()

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
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importDays, setImportDays] = useState(30)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const typesResult = await api
        .listExpenseTypes({ archived: 'exclude', page_size: 200 })
        .catch(() => ({ items: [] }))
      setExpenseTypes(typesResult.items)

      if (Capacitor.isNativePlatform()) {
        const [pending, settingsResult] = await Promise.all([
          SmsPlugin.getPendingTransactions(),
          SmsPlugin.getSettings(),
        ])
        setItems(pending.items)
        setSettings(settingsResult)
      }
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

  useEffect(() => {
    void load()
  }, [load])

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
        if (isNative) {
          await SmsPlugin.confirmTransaction({ id })
        } else {
          const item = items.find((i) => i.id === id)
          if (item && item.amount) {
            const paise = Math.round(parseFloat(item.amount) * 100)
            const isCredit =
              item.reason?.toLowerCase().includes('credit') ||
              item.note?.toLowerCase().includes('credit') ||
              item.category?.toLowerCase() === 'salary' ||
              item.category?.toLowerCase() === 'income'

            if (isCredit) {
              const incomeTypes = await api.listIncomeTypes().catch(() => [] as IncomeType[])
              const type =
                incomeTypes.find(
                  (t: IncomeType) => t.name.toLowerCase() === item.category.toLowerCase(),
                ) || incomeTypes[0]
              if (type) {
                await api.createIncome({
                  amount_paise: paise,
                  income_date: item.date || new Date().toISOString().slice(0, 10),
                  income_type_id: type.id,
                  payer: item.merchant || 'Auto-credit via SMS',
                  note: item.note || 'Authorised SMS credit',
                  payment_method: 'UPI',
                })
              }
            } else {
              const type =
                expenseTypes.find(
                  (t) => t.name.toLowerCase() === item.category.toLowerCase(),
                ) || expenseTypes[0]
              if (type) {
                await api.createExpense({
                  amount_paise: paise,
                  expense_date: item.date || new Date().toISOString().slice(0, 10),
                  expense_type_id: type.id,
                  merchant: item.merchant || 'Unrecognised merchant',
                  note: item.note || 'Authorised SMS transaction',
                  payment_method: 'UPI',
                })
              }
            }
          }
        }
        setItems((current) => current.filter((item) => item.id !== id))
        showToast({
          title: 'Payment authorised',
          description: 'Transaction recorded and added to your expenses.',
        })
        window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
      } catch (error) {
        showToast({
          title: 'Could not authorise',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        })
      } finally {
        setLoading(false)
      }
    },
    [isNative, items, expenseTypes, showToast],
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
    setSettingsLoading(true)
    try {
      const current = settings?.smsAutomationEnabled ?? false
      const nextEnabled = !current
      if (nextEnabled) {
        try {
          await SmsPlugin.requestPermissions()
        } catch {
          // ignore
        }
      }
      await SmsPlugin.setAutomationEnabled({ enabled: nextEnabled })
      setSettings((prev) => ({
        smsAutomationEnabled: nextEnabled,
        backendUrl: prev?.backendUrl ?? '',
        notificationsEnabled: prev?.notificationsEnabled ?? true,
      }))
      showToast({
        title: nextEnabled ? 'Automation enabled' : 'Automation disabled',
        description: nextEnabled
          ? 'New SMS transactions will be queued for review automatically.'
          : 'New SMS transactions will no longer be captured automatically.',
      })
      await load()
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
      case 'PENDING_REVIEW':
        return <Badge tone="warning">Pending review</Badge>
      case 'READY_TO_SYNC':
        return <Badge tone="primary">Pending sync</Badge>
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
        description: 'SMS receive and notification permissions are needed for auto-detection.',
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

  const handleSimulateSms = useCallback(() => {
    const demoId = `sim-${Date.now()}`
    const demoItem: PendingTransaction = {
      id: demoId,
      status: 'PENDING_REVIEW',
      reason: 'Unrecognised payment · Authorisation required',
      createdAtMs: Date.now(),
      amount: '750.00',
      merchant: 'Zomato Payment Hyd',
      reference: 'UPI/3829481029',
      date: new Date().toISOString().slice(0, 10),
      category: 'Food',
      note: 'Auto-detected from HDFC Bank SMS',
      sender: 'VM-HDFCBK',
      error: '',
      retryCount: 0,
      notified: true,
    }
    setItems((prev) => [demoItem, ...prev.filter((p) => p.id !== demoId)])
    showToast({
      title: 'Action Required: Authorise Payment',
      description:
        'Unrecognised payment of ₹750.00 at Zomato Payment Hyd detected. Tap Authorise to add to expenses.',
      variant: 'info',
    })
    window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
  }, [showToast])

  const pendingCount = items.filter(
    (i) => i.status === 'PENDING_REVIEW' || i.status === 'READY_TO_SYNC',
  ).length

  const handleImportHistorical = useCallback(async () => {
    setImporting(true)
    try {
      if (isNative) {
        await SmsPlugin.requestPermissions()
        const res = await SmsPlugin.importHistoricalSms({ days: importDays })
        showToast({
          title: 'SMS import complete',
          description: `Scanned ${res.totalScanned} messages. Found ${res.eligibleFound} transactions (${res.newImported} imported, ${res.duplicatesSkipped} duplicates skipped).`,
          variant: 'success',
        })
      } else {
        const sampleCount = importDays === 7 ? 2 : importDays === 30 ? 3 : 5
        const simulated: PendingTransaction[] = [
          {
            id: `sim-hist-${Date.now()}-1`,
            status: 'PENDING_REVIEW',
            reason: 'Historical bank SMS debit · Review required',
            createdAtMs: Date.now() - 86400000 * 2,
            amount: '1240.00',
            merchant: 'Swiggy Instamart Bangalore',
            reference: 'UPI/409218491823',
            date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
            category: 'Groceries',
            note: 'Historical SMS import',
            sender: 'VM-HDFCBK',
            error: '',
            retryCount: 0,
            notified: false,
          },
          {
            id: `sim-hist-${Date.now()}-2`,
            status: 'PENDING_REVIEW',
            reason: 'Historical bank SMS debit · Review required',
            createdAtMs: Date.now() - 86400000 * 5,
            amount: '699.00',
            merchant: 'Jio Prepaid Recharge',
            reference: 'UPI/408912389182',
            date: new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10),
            category: 'Bills',
            note: 'Historical SMS import',
            sender: 'AX-ICICIB',
            error: '',
            retryCount: 0,
            notified: false,
          },
          {
            id: `sim-hist-${Date.now()}-3`,
            status: 'PENDING_REVIEW',
            reason: 'Historical bank SMS debit · Review required',
            createdAtMs: Date.now() - 86400000 * 8,
            amount: '2450.00',
            merchant: 'Apollo Pharmacy',
            reference: 'POS/982173198',
            date: new Date(Date.now() - 86400000 * 8).toISOString().slice(0, 10),
            category: 'Healthcare',
            note: 'Historical SMS import',
            sender: 'VK-SBIINB',
            error: '',
            retryCount: 0,
            notified: false,
          },
        ].slice(0, sampleCount)

        setItems((prev) => [...simulated, ...prev])
        showToast({
          title: 'SMS import simulation',
          description: `Imported ${simulated.length} sample historical transactions for review.`,
          variant: 'info',
        })
      }
      setImportModalOpen(false)
      await load()
      window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
    } catch (error) {
      showToast({
        title: 'SMS import failed',
        description: error instanceof Error ? error.message : 'Please check SMS permissions.',
        variant: 'error',
      })
    } finally {
      setImporting(false)
    }
  }, [isNative, importDays, load, showToast])

  const handleBulkAuthorise = useCallback(async () => {
    if (items.length === 0) return
    setLoading(true)
    try {
      for (const item of items) {
        if (item.status === 'PENDING_REVIEW' || item.status === 'READY_TO_SYNC') {
          if (isNative) {
            await SmsPlugin.confirmTransaction({ id: item.id })
          } else if (item.amount) {
            const paise = Math.round(parseFloat(item.amount) * 100)
            const type =
              expenseTypes.find(
                (t) => t.name.toLowerCase() === item.category.toLowerCase(),
              ) || expenseTypes[0]
            if (type) {
              await api.createExpense({
                amount_paise: paise,
                expense_date: item.date || new Date().toISOString().slice(0, 10),
                expense_type_id: type.id,
                merchant: item.merchant || 'Unrecognised merchant',
                note: item.note || 'Authorised SMS transaction',
                payment_method: 'UPI',
              })
            }
          }
        }
      }
      setItems([])
      showToast({
        title: 'All payments authorised',
        description: `Authorised and added ${pendingCount} transactions to expenses.`,
      })
      window.dispatchEvent(new CustomEvent('moneytrack:sms-changed'))
    } catch (error) {
      showToast({
        title: 'Bulk authorise error',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [isNative, items, pendingCount, expenseTypes, showToast])

  return (
    <div className="page space-y-5">
      <PageHeader
        eyebrow="SMS review"
        title="SMS Review"
        description="Review transactions detected from bank messages and authorise payments."
        actions={
          <div className="flex flex-wrap gap-2">
            {pendingCount > 1 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleBulkAuthorise()}
                disabled={loading}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                <span>Authorise all ({pendingCount})</span>
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportModalOpen(true)}
              disabled={loading || importing}
            >
              <History className="h-4 w-4" aria-hidden />
              <span>Import SMS history</span>
            </Button>
            {!isNative ? (
              <Button variant="secondary" size="sm" onClick={handleSimulateSms}>
                <MessageSquare className="h-4 w-4" aria-hidden />
                <span>Simulate unrecognised SMS</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRequestPermissions}
                  disabled={loading}
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  Request permission
                </Button>
                <Button onClick={handleSync} disabled={loading} size="sm">
                  <RefreshCw
                    className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                    aria-hidden
                  />
                  Sync now
                </Button>
              </>
            )}
          </div>
        }
      />

      {!isNative && (
        <section className="card unsupported">
          <span className="unsupported-icon">
            <MessageSquare size={30} aria-hidden />
          </span>
          <Badge tone="warning">Android Feature</Badge>
          <h2>SMS detection runs natively on your Android device</h2>
          <p>
            When a bank SMS arrives on Android, MoneyTrack inspects it in the background. If any
            unrecognised or pending payment is detected, a high-priority alert reminds you to authorise
            it so it can be recorded into your expenses.
          </p>
          <div className="feature-list">
            <span>
              <Check size={17} aria-hidden /> Private, on-device processing
            </span>
            <span>
              <Check size={17} aria-hidden /> You authorise every expense
            </span>
            <span>
              <Check size={17} aria-hidden /> Works with any Indian bank SMS
            </span>
          </div>
        </section>
      )}

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
            >
              {settings?.smsAutomationEnabled ? 'Enabled' : 'Enable'}
            </Button>
          }
        />
      </Card>

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No SMS transactions to review"
            description="Detected SMS transactions appear here. Enable SMS automation and make sure you've granted SMS permission on your device."
            action={
              <Button variant="secondary" size="sm" onClick={handleRequestPermissions}>
                <Phone className="h-4 w-4" aria-hidden />
                Request SMS permission
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {item.status === 'PENDING_REVIEW' && (
                    <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>Unrecognised payment detected · Please authorise to add to expenses</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-[var(--text)] truncate">
                      {item.merchant || 'Unknown merchant'}
                    </p>
                    <span className="shrink-0 tabular text-base font-bold text-[var(--text)]">
                      {item.amount ? `₹${item.amount}` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)] mb-2">
                    <span>{item.date ? formatDate(item.date) : '—'}</span>
                    <span>·</span>
                    <span>{item.sender || '—'}</span>
                    {item.reference && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-xs">{item.reference}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">
                      {item.category || 'Uncategorized'}
                    </Badge>
                    {statusBadge(item.status)}
                    {item.error && <AlertCircle className="h-4 w-4 text-danger" aria-hidden />}
                  </div>
                  {item.error && (
                    <p className="mt-1 text-[11px] text-danger">{item.error}</p>
                  )}
                </div>
                  <div className="flex flex-wrap gap-2 sm:items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(item)}
                    disabled={loading || item.status === 'SYNCED'}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleConfirm(item.id)}
                    disabled={loading || item.status === 'SYNCED'}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Authorise payment
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
              <Select
                value={editFields.category}
                onChange={(e) =>
                  setEditFields({ ...editFields, category: e.target.value })
                }
              >
                <option value="">Select category...</option>
                {editFields.category &&
                  !expenseTypes.some(
                    (t) => t.name.toLowerCase() === editFields.category.toLowerCase(),
                  ) && (
                    <option value={editFields.category}>
                      {editFields.category} (Detected)
                    </option>
                  )}
                {expenseTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name}
                  </option>
                ))}
              </Select>
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
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)] mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(null)
                setEditFields(null)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" loading={loading} onClick={saveEdit} disabled={loading}>
              Save & confirm
            </Button>
          </div>
        </Modal>
      )}

      {importModalOpen && (
        <Modal
          open={importModalOpen}
          onClose={() => !importing && setImportModalOpen(false)}
          title="Import historical SMS transactions"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              MoneyTrack securely scans your device SMS inbox for past bank debits, recharges, and UPI transactions.
            </p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)] space-y-1.5">
              <p className="font-semibold text-[var(--text)]">🔒 Privacy guarantee</p>
              <p>• SMS processing runs 100% locally on your device.</p>
              <p>• Personal chats and OTPs are ignored and never saved.</p>
              <p>• Transactions are queued for review and only recorded when you authorise them.</p>
            </div>
            <Field label="Import time period">
              <Select
                value={String(importDays)}
                onChange={(e) => setImportDays(Number(e.target.value))}
                disabled={importing}
              >
                <option value="7">Past 7 days</option>
                <option value="15">Past 15 days</option>
                <option value="30">Past 30 days (Recommended)</option>
                <option value="60">Past 60 days</option>
                <option value="90">Past 90 days</option>
                <option value="180">Past 180 days (6 months)</option>
                <option value="0">All available messages</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)] mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportModalOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={importing}
              onClick={() => void handleImportHistorical()}
              disabled={importing}
            >
              Start import
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
          tone="danger"
          title="Dismiss this transaction?"
          confirmLabel="Dismiss"
          description="This SMS transaction will be removed from review and not saved to your records."
        />
      )}
    </div>
  )
}
