import { useEffect, useState } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Moon,
  Settings,
  ShieldAlert,
  Calendar,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { api, ApiError } from '@/services/api'
import { checkAppPermission, requestAppPermission, type PermissionStateResult } from '@/services/permissions'
import type {
  NotificationCenterSummary,
  NotificationPreferences,
} from '@/types/api'
import { cn } from '@/utils/cn'

export default function NotificationsPage() {
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
      else setError('Failed to load notifications. Please check your backend connection.')
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
          items: prev.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        }
      })
    } catch {
      // ignore
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead()
      setData((prev) => {
        if (!prev) return prev
        return {
          unread_count: 0,
          items: prev.items.map((n) => ({ ...n, is_read: true })),
        }
      })
    } catch {
      // ignore
    }
  }

  const handleSavePreferences = async (updated: Partial<NotificationPreferences>) => {
    try {
      const res = await api.updateNotificationPreferences(updated)
      setPrefs(res)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save preferences')
    }
  }

  const filteredItems = (data?.items || []).filter((item) => {
    if (selectedCategory === 'ALL') return true
    return item.category === selectedCategory
  })

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'SECURITY':
        return <ShieldAlert className="h-5 w-5 text-amber-400" />
      case 'WEEKLY_REPORT':
        return <Calendar className="h-5 w-5 text-primary" />
      default:
        return <Bell className="h-5 w-5 text-indigo-400" />
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Notification Centre"
          description="Review security alerts, weekly spending summaries, and configure notification rules."
        />
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPrefsModalOpen(true)}
            className="min-h-[44px]"
          >
            <Settings className="h-4 w-4" />
            Preferences
          </Button>

          {data && data.unread_count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="min-h-[44px]"
            >
              <CheckCheck className="h-4 w-4 text-primary" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Notification Permission Info Card */}
      {notifPermission === 'granted' ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 sm:px-4 text-xs text-emerald-400">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="font-medium">
              Push & system notification permission is <strong>active</strong>. You will receive real-time alerts for unusual debits & weekly spending digests.
            </span>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 shrink-0">
            Granted
          </span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
          <div className="flex items-start gap-2.5 min-w-0">
            <Bell className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <strong className="block text-sm text-text font-semibold">
                Notification permission is not granted
              </strong>
              <p className="text-muted mt-0.5">
                Enable device notifications so MoneyTrack can alert you immediately when unusual bank transactions or Monday weekly digest reports arrive.
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
            Enable Notifications
          </Button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold no-scrollbar">
        {['ALL', 'SECURITY', 'WEEKLY_REPORT', 'SYSTEM'].map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'rounded-xl px-4 py-2 min-h-[44px] transition-all shrink-0',
              selectedCategory === cat
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface border border-line text-muted hover:text-ink hover:bg-surface-hover'
            )}
          >
            {cat === 'ALL' && `All (${data?.items.length || 0})`}
            {cat === 'SECURITY' && 'Security Alerts'}
            {cat === 'WEEKLY_REPORT' && 'Weekly Digest'}
            {cat === 'SYSTEM' && 'System'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadNotifications} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You are fully up to date. Alerts for suspicious transactions and Monday reports will appear here."
        />
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => !item.is_read && handleMarkRead(item.id)}
              className={cn(
                'rounded-2xl border p-4.5 transition-all shadow-sm flex items-start justify-between gap-3 cursor-pointer',
                !item.is_read
                  ? 'border-primary/40 bg-surface-card hover:border-primary/60'
                  : 'border-line/40 bg-surface/40 hover:bg-surface/70'
              )}
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface border border-line">
                  {getCategoryIcon(item.category)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-display font-semibold text-sm text-ink">{item.title}</h4>
                    {!item.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-muted leading-relaxed max-w-xl">{item.body}</p>
                  <div className="text-[10px] text-muted pt-1">
                    {new Date(item.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              {!item.is_read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMarkRead(item.id)
                  }}
                  className="text-muted hover:text-primary p-2 shrink-0 rounded-lg"
                  title="Mark as read"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notification Preferences Modal */}
      {prefs && (
        <Modal
          open={prefsModalOpen}
          onClose={() => setPrefsModalOpen(false)}
          title="Notification Preferences"
          description="Manage how and when MoneyTrack alerts you regarding finances."
          footer={
            <Button variant="primary" onClick={() => setPrefsModalOpen(false)}>
              Done
            </Button>
          }
        >
          <div className="space-y-5 py-2 text-xs">
            {/* Suspicious Alerts Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface/50 p-3.5">
              <div className="space-y-0.5 max-w-[80%]">
                <div className="font-semibold text-ink text-sm">Suspicious Activity Alerts</div>
                <div className="text-muted text-xs">
                  Immediate alerts for charges &gt;3x normal, unfamiliar merchants, or rapid debits.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.suspicious_alerts_enabled}
                onChange={(e) =>
                  handleSavePreferences({ suspicious_alerts_enabled: e.target.checked })
                }
                className="h-5 w-5 accent-primary cursor-pointer"
              />
            </div>

            {/* Weekly Spending Report Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface/50 p-3.5">
              <div className="space-y-0.5 max-w-[80%]">
                <div className="font-semibold text-ink text-sm">Weekly Spending Digest</div>
                <div className="text-muted text-xs">
                  Digest of previous Monday-Sunday expenses, cashflow, and savings rate.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.weekly_report_enabled}
                onChange={(e) =>
                  handleSavePreferences({ weekly_report_enabled: e.target.checked })
                }
                className="h-5 w-5 accent-primary cursor-pointer"
              />
            </div>

            {/* Quiet Hours */}
            <div className="rounded-xl border border-line bg-surface/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-400" />
                  <span className="font-semibold text-ink text-sm">Quiet Hours</span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.quiet_hours_enabled}
                  onChange={(e) =>
                    handleSavePreferences({ quiet_hours_enabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-primary cursor-pointer"
                />
              </div>

              {prefs.quiet_hours_enabled && (
                <div className="flex items-center gap-3 pt-2 text-muted">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px]">Start Time</label>
                    <input
                      type="time"
                      value={prefs.quiet_hours_start}
                      onChange={(e) =>
                        handleSavePreferences({ quiet_hours_start: e.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px]">End Time</label>
                    <input
                      type="time"
                      value={prefs.quiet_hours_end}
                      onChange={(e) =>
                        handleSavePreferences({ quiet_hours_end: e.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Max Alerts Per Day */}
            <div className="rounded-xl border border-line bg-surface/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink text-sm">Maximum Push Alerts Per Day</span>
                <span className="font-mono font-bold text-primary">{prefs.max_alerts_per_day}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={prefs.max_alerts_per_day}
                onChange={(e) =>
                  handleSavePreferences({ max_alerts_per_day: parseInt(e.target.value) })
                }
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[10px] text-muted">
                Prevents alert fatigue by throttling routine push notifications.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
