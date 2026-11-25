import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  Moon,
  Settings,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppPage } from '@/components/AppPage'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { Panel } from '@/components/ui/Panel'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/providers/ToastProvider'
import { api, ApiError } from '@/services/api'
import {
  checkAppPermission,
  requestAppPermission,
  type PermissionStateResult,
} from '@/services/permissions'
import type { NotificationCenterSummary, NotificationPreferences } from '@/types/api'
import { cn } from '@/utils/cn'

const CATEGORIES = ['ALL', 'SECURITY', 'WEEKLY_REPORT', 'SYSTEM'] as const

function categoryIcon(category: string) {
  if (category === 'SECURITY') {
    return <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
  }
  if (category === 'WEEKLY_REPORT') {
    return <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
  }
  return <Bell className="h-4 w-4 text-muted" aria-hidden="true" />
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-surface-raised p-3.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-5 text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-primary"
      />
    </label>
  )
}

export default function NotificationsPage() {
  const { showToast } = useToast()
  const [data, setData] = useState<NotificationCenterSummary | null>(null)
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [prefsModalOpen, setPrefsModalOpen] = useState(false)
  const [notifPermission, setNotifPermission] = useState<PermissionStateResult>('prompt')
  const [requestingNotif, setRequestingNotif] = useState(false)

  const loadNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const [notifs, preferences] = await Promise.all([
        api.getNotifications(),
        api.getNotificationPreferences(),
      ])
      setData(notifs)
      setPrefs(preferences)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to load notifications. Check the backend connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
    void checkAppPermission('notifications').then(setNotifPermission)
  }, [])

  const handleRequestPermission = async () => {
    setRequestingNotif(true)
    try {
      const granted = await requestAppPermission('notifications')
      setNotifPermission(granted ? 'granted' : 'denied')
    } finally {
      setRequestingNotif(false)
    }
  }

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id)
      setData((prev) => {
        if (!prev) return prev
        return {
          unread_count: Math.max(0, prev.unread_count - 1),
          items: prev.items.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
        }
      })
    } catch {
      // Marking a single notification read is best-effort.
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead()
      setData((prev) => {
        if (!prev) return prev
        return {
          unread_count: 0,
          items: prev.items.map((item) => ({ ...item, is_read: true })),
        }
      })
    } catch {
      // Best-effort.
    }
  }

  const handleSavePreferences = async (updated: Partial<NotificationPreferences>) => {
    try {
      const res = await api.updateNotificationPreferences(updated)
      setPrefs(res)
    } catch (err) {
      showToast({
        title: 'Could not save preferences',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const filteredItems = (data?.items ?? []).filter(
    (item) => selectedCategory === 'ALL' || item.category === selectedCategory,
  )

  return (
    <AppPage>
      <PageHeader
        eyebrow="Alerts"
        title="Notification centre"
        description="Security alerts, weekly digests and the rules that decide what reaches you."
        actions={
          <>
            <Button variant="secondary" onClick={() => setPrefsModalOpen(true)}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Preferences
            </Button>
            {data && data.unread_count > 0 ? (
              <Button variant="ghost" onClick={handleMarkAllRead}>
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                Mark all read
              </Button>
            ) : null}
          </>
        }
      />

      {notifPermission === 'granted' ? (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-card)] border border-positive-border bg-positive-soft px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
          <p className="text-[12px] leading-5 text-text">
            Device notifications are <strong className="font-semibold">active</strong>. Security
            alerts and the weekly digest can reach you outside the app.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning-border bg-warning-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-text">Device notifications are off</p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted">
                Enable them to hear about unusual debits and the Monday digest immediately.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            loading={requestingNotif}
            onClick={handleRequestPermission}
            className="shrink-0 self-start sm:self-auto"
          >
            Enable notifications
          </Button>
        </div>
      )}

      <div
        className="mt-4 flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 no-scrollbar"
        role="tablist"
        aria-label="Notification category"
      >
        {CATEGORIES.map((category) => {
          const selected = selectedCategory === category
          const count =
            category === 'ALL'
              ? (data?.items.length ?? 0)
              : (data?.items ?? []).filter((item) => item.category === category).length
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                selected ? 'bg-surface-raised text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              {category === 'ALL' ? 'All' : null}
              {category === 'SECURITY' ? 'Security' : null}
              {category === 'WEEKLY_REPORT' ? 'Weekly digest' : null}
              {category === 'SYSTEM' ? 'System' : null}
              <span className="font-mono text-[10px] text-muted">{count}</span>
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
          <ErrorState description={error} onRetry={loadNotifications} />
        </div>
      ) : filteredItems.length === 0 ? (
        <Panel className="mt-4">
          <EmptyState
            icon={Bell}
            title="Nothing here yet"
            description={
              selectedCategory === 'ALL'
                ? 'Alerts for unusual transactions and the Monday digest will appear here.'
                : 'No notification in this category. Try another filter.'
            }
          />
        </Panel>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {filteredItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  if (!item.is_read) void handleMarkRead(item.id)
                }}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors sm:px-5',
                  item.is_read ? 'hover:bg-surface-raised' : 'bg-primary-soft/30 hover:bg-primary-soft/50',
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised">
                  {categoryIcon(item.category)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-text">{item.title}</span>
                    {!item.is_read ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-muted">{item.body}</span>
                  <span className="mt-1 block font-mono text-[10px] tabular-nums text-subtle">
                    {new Date(item.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>

                {!item.is_read ? (
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted"
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {prefs ? (
        <Modal
          open={prefsModalOpen}
          onClose={() => setPrefsModalOpen(false)}
          title="Notification preferences"
          description="Decide what reaches you and when."
          footer={
            <Button variant="primary" onClick={() => setPrefsModalOpen(false)}>
              Done
            </Button>
          }
        >
          <div className="space-y-3">
            <ToggleRow
              title="Suspicious activity alerts"
              description="Immediate alerts for charges well above normal, unfamiliar merchants, or rapid debits."
              checked={prefs.suspicious_alerts_enabled}
              onChange={(next) => handleSavePreferences({ suspicious_alerts_enabled: next })}
            />

            <ToggleRow
              title="Weekly spending digest"
              description="A Monday summary of the previous week's expenses, cashflow and savings rate."
              checked={prefs.weekly_report_enabled}
              onChange={(next) => handleSavePreferences({ weekly_report_enabled: next })}
            />

            <div className="rounded-lg border border-border bg-surface-raised p-3.5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                  <Moon className="h-4 w-4 text-muted" aria-hidden="true" />
                  Quiet hours
                </span>
                <input
                  type="checkbox"
                  checked={prefs.quiet_hours_enabled}
                  onChange={(event) =>
                    handleSavePreferences({ quiet_hours_enabled: event.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-primary"
                  aria-label="Enable quiet hours"
                />
              </div>

              {prefs.quiet_hours_enabled ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Start">
                    <Input
                      type="time"
                      value={prefs.quiet_hours_start}
                      onChange={(event) =>
                        handleSavePreferences({ quiet_hours_start: event.target.value })
                      }
                      className="font-mono text-[12px]"
                    />
                  </Field>
                  <Field label="End">
                    <Input
                      type="time"
                      value={prefs.quiet_hours_end}
                      onChange={(event) =>
                        handleSavePreferences({ quiet_hours_end: event.target.value })
                      }
                      className="font-mono text-[12px]"
                    />
                  </Field>
                </div>
              ) : (
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  Alerts arrive at any hour while quiet hours are off.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-text">Maximum push alerts per day</span>
                <span className="font-mono text-[13px] font-medium tabular-nums text-primary">
                  {prefs.max_alerts_per_day}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={prefs.max_alerts_per_day}
                onChange={(event) =>
                  handleSavePreferences({ max_alerts_per_day: Number.parseInt(event.target.value) })
                }
                className="mt-3 w-full cursor-pointer accent-primary"
                aria-label="Maximum push alerts per day"
              />
              <p className="mt-1 text-[11px] leading-5 text-muted">
                Throttles routine alerts so they stay meaningful.
              </p>
            </div>
          </div>
        </Modal>
      ) : null}
    </AppPage>
  )
}
