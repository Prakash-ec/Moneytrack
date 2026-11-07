import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Monitor,
  Moon,
  Phone,
  RefreshCw,
  Server,
  Smartphone,
  Sun,
  Tags,
  Trash2,
  Upload,
  User as UserIcon,
  LogOut,
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/FormControls'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/providers/AuthProvider'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useToast } from '@/providers/ToastProvider'
import { api, downloadExport, getApiBase, setApiBase, testConnection } from '@/services/api'
import { SmsPlugin, type PermissionStatus } from '@/services/sms'
import { cn } from '@/utils/cn'

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { theme, setTheme } = useTheme()
  const { showToast } = useToast()
  const { invalidate } = useDataRefresh()
  const { user, logout } = useAuth()
  const online = useOnlineStatus()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<{
    fileName: string
    payload: unknown
    typeCount: number
    expenseCount: number
  } | null>(null)
  const [restoring, setRestoring] = useState(false)

  // Backend URL configuration & connection testing
  const [backendUrl, setBackendUrl] = useState(() => getApiBase())
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    status: number
    version?: string
    application?: string
    error?: string
  } | null>(null)

  // SMS settings & permissions
  const [smsSettings, setSmsSettings] = useState<{
    smsAutomationEnabled: boolean
    backendUrl: string
    notificationsEnabled: boolean
  } | null>(null)
  const [smsLoading, setSmsLoading] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null)
  const [requestingPermission, setRequestingPermission] = useState(false)
  const [clearQueueConfirmOpen, setClearQueueConfirmOpen] = useState(false)
  const [clearingQueue, setClearingQueue] = useState(false)

  // Database status
  const [dbStatus, setDbStatus] = useState<{
    provider: string
    connected: boolean
    status: string
  }>({
    provider: 'sqlite',
    connected: true,
    status: 'connected',
  })

  useEffect(() => {
    let active = true
    api.databaseHealth()
      .then((res) => {
        if (active) {
          setDbStatus({
            provider: res.provider || 'sqlite',
            connected: res.connected,
            status: res.status,
          })
        }
      })
      .catch(() => {
        api.health()
          .then((res) => {
            if (active) {
              setDbStatus({
                provider: res.provider || 'sqlite',
                connected: res.database === 'connected',
                status: res.status,
              })
            }
          })
          .catch(() => {
            if (active) {
              setDbStatus({
                provider: 'unknown',
                connected: false,
                status: 'unavailable',
              })
            }
          })
      })
    return () => {
      active = false
    }
  }, [])

  const loadSmsSettings = useCallback(async () => {
    try {
      const s = await SmsPlugin.getSettings()
      setSmsSettings({
        smsAutomationEnabled: s.smsAutomationEnabled,
        backendUrl: s.backendUrl ?? '',
        notificationsEnabled: s.notificationsEnabled,
      })
      if (s.backendUrl && s.backendUrl !== getApiBase()) {
        setBackendUrl(s.backendUrl)
      }
    } catch {
      // ignore - SMS plugin may not be available on web
    }
  }, [])

  const checkSmsPermissions = useCallback(async () => {
    try {
      const status = await SmsPlugin.checkPermissions()
      setPermissionStatus(status)
    } catch {
      // web / unsupported
    }
  }, [])

  useEffect(() => {
    void loadSmsSettings()
    void checkSmsPermissions()
  }, [loadSmsSettings, checkSmsPermissions])

  const handleTestConnection = async (targetUrl?: string) => {
    const url = targetUrl ?? backendUrl
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await testConnection(url)
      setTestResult(res)
      if (res.ok) {
        showToast({
          title: 'Connection successful',
          description: `Connected to ${res.application ?? 'MoneyTrack API'} v${res.version ?? '1.0.0'}.`,
        })
      } else {
        showToast({
          title: 'Connection test failed',
          description: res.error ?? `Server returned HTTP ${res.status}`,
          variant: 'error',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setTestResult({ ok: false, status: 0, error: msg })
      showToast({
        title: 'Connection error',
        description: msg,
        variant: 'error',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSaveBackendUrl = async (newUrl?: string) => {
    const raw = newUrl !== undefined ? newUrl : backendUrl
    setApiBase(raw)
    const normalized = getApiBase()
    setBackendUrl(normalized)
    setSmsSettings((prev) => (prev ? { ...prev, backendUrl: normalized } : null))
    try {
      await SmsPlugin.setBackendUrl({ url: normalized })
    } catch {
      // ignore on web
    }
    showToast({
      title: 'Backend URL updated',
      description: `MoneyTrack is now pointing to: ${normalized}`,
    })
    invalidate()
  }

  const handleToggleSmsAutomation = useCallback(async () => {
    setSmsLoading(true)
    try {
      const current = smsSettings?.smsAutomationEnabled ?? false
      const nextEnabled = !current
      if (nextEnabled && permissionStatus?.receiveSms !== 'granted') {
        try {
          const perm = await SmsPlugin.requestPermissions()
          setPermissionStatus(perm)
        } catch {
          // ignore
        }
      }
      await SmsPlugin.setAutomationEnabled({ enabled: nextEnabled })
      setSmsSettings((prev) => ({
        smsAutomationEnabled: nextEnabled,
        backendUrl: prev?.backendUrl ?? getApiBase(),
        notificationsEnabled: prev?.notificationsEnabled ?? true,
      }))
      showToast({
        title: nextEnabled ? 'SMS scan enabled' : 'SMS scan disabled',
        description: nextEnabled
          ? 'Incoming bank SMS transactions will be scanned and queued for review.'
          : 'Automatic SMS scanning is now turned off.',
      })
    } catch {
      showToast({
        title: 'Could not update setting',
        description: 'Please check your device settings.',
        variant: 'error',
      })
    } finally {
      setSmsLoading(false)
      await loadSmsSettings()
    }
  }, [smsSettings, permissionStatus, loadSmsSettings, showToast])

  const handleRequestSmsPermissions = async () => {
    setRequestingPermission(true)
    try {
      const status = await SmsPlugin.requestPermissions()
      setPermissionStatus(status)
      if (status.granted || status.receiveSms === 'granted') {
        showToast({
          title: 'SMS permission granted',
          description: 'MoneyTrack can now auto-detect incoming bank transactions.',
        })
      } else if (status.receiveSms === 'denied') {
        showToast({
          title: 'SMS permission denied',
          description: 'Please enable SMS permission in Android Settings > Apps > MoneyTrack.',
          variant: 'error',
        })
      }
    } catch (err) {
      showToast({
        title: 'Could not request permissions',
        description: err instanceof Error ? err.message : 'Please check Android settings.',
        variant: 'error',
      })
    } finally {
      setRequestingPermission(false)
      await loadSmsSettings()
    }
  }

  const handleClearSmsQueue = async () => {
    setClearingQueue(true)
    try {
      await SmsPlugin.clearPendingQueue()
      showToast({
        title: 'SMS review queue cleared',
        description: 'All pending SMS transactions have been cleared from this device.',
      })
      setClearQueueConfirmOpen(false)
    } catch (err) {
      showToast({
        title: 'Could not clear queue',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setClearingQueue(false)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string)
        if (
          !content ||
          content.schema_version !== 1 ||
          !Array.isArray(content.expense_types) ||
          !Array.isArray(content.expenses)
        ) {
          showToast({
            title: 'Invalid backup file',
            description: 'The file is not a valid MoneyTrack version 1 JSON backup.',
            variant: 'error',
          })
          if (fileInputRef.current) fileInputRef.current.value = ''
          return
        }
        setRestoreTarget({
          fileName: file.name,
          payload: content,
          typeCount: content.expense_types.length,
          expenseCount: content.expenses.length,
        })
      } catch {
        showToast({
          title: 'Invalid JSON file',
          description: 'Could not parse JSON from the selected file.',
          variant: 'error',
        })
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const result = await api.restoreBackup(restoreTarget.payload)
      showToast({
        title: 'Backup restored successfully',
        description: result.message,
      })
      invalidate()
      setRestoreTarget(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      showToast({
        title: 'Restoration failed',
        description: error instanceof Error ? error.message : 'Could not restore the backup file.',
        variant: 'error',
      })
    } finally {
      setRestoring(false)
    }
  }

  const healthQuery = useApiQuery(['health'], () => api.health(), { enabled: online })

  const handleExport = async (kind: 'csv' | 'json') => {
    setExporting(kind)
    try {
      await downloadExport(kind)
      showToast({
        title: kind === 'csv' ? 'CSV export downloaded' : 'JSON backup downloaded',
        description:
          kind === 'csv'
            ? 'Every expense is included, with amounts in rupees and paise.'
            : 'The backup includes all expense types and all recorded expenses.',
      })
    } catch (error) {
      showToast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setExporting(null)
    }
  }

  const appVersion = healthQuery.data?.version ?? '1.0.0'

  return (
    <div className="narrow-page space-y-6">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Manage appearance, connectivity, and your local data."
      />

      {/* Section 1: Appearance */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>Appearance</h2>
          <p>Choose how MoneyTrack looks on this device.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="theme-options">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={theme === t ? 'active' : ''}
                onClick={() => setTheme(t)}
              >
                <span>
                  {t === 'light' ? (
                    <Sun size={18} />
                  ) : t === 'dark' ? (
                    <Moon size={18} />
                  ) : (
                    <Monitor size={18} />
                  )}
                </span>
                <strong>{t[0].toUpperCase() + t.slice(1)}</strong>
                {theme === t && (
                  <i>
                    <Check size={12} />
                  </i>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Account & Profile */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>Account</h2>
          <p>Authenticated user and session control.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <UserIcon size={18} />
              </span>
              <div className="setting-text">
                <h3>{user?.full_name || 'Personal Account'}</h3>
                <p>{user?.email || 'Authenticated user'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.is_superuser && (
                <Badge tone="primary">Admin</Badge>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => logout()}
                className="gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories & Taxonomies */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>Categories & Taxonomies</h2>
          <p>Organize expense and income taxonomies, colors, and icons.</p>
        </div>
        <div className="card p-4 sm:p-5 flex items-center justify-between">
          <div>
            <strong className="text-sm font-semibold text-text block">Manage Expense Categories</strong>
            <p className="text-xs text-muted mt-0.5">Customize categories, archive unused types, and configure icons.</p>
          </div>
          <Link to="/expense-types" className="button button-secondary button-sm shrink-0 flex items-center gap-1.5">
            <Tags className="h-4 w-4 text-muted" aria-hidden="true" />
            <span>Manage types</span>
          </Link>
        </div>
      </section>

      {/* Section 2: Connection */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>Connection</h2>
          <p>Your local MoneyTrack service and status.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Wifi size={18} />
              </span>
              <div className="setting-text">
                <h3>API connection</h3>
                <p>
                  {online && healthQuery.data?.status === 'ok'
                    ? `Connected to local server (${getApiBase()})`
                    : 'Check your backend URL and status'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={healthQuery.data?.status === 'ok' ? 'positive' : 'warning'}>
                {healthQuery.data?.status === 'ok' ? 'Connected' : 'Offline'}
              </Badge>
            </div>
          </div>

          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-muted)] space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000/api"
                className="flex-1 font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={testingConnection}
                  onClick={() => void handleTestConnection()}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Test
                </Button>
                <Button size="sm" onClick={() => void handleSaveBackendUrl()}>
                  Save
                </Button>
              </div>
            </div>

            {testResult ? (
              <div
                className={cn(
                  'rounded-lg p-2.5 text-xs',
                  testResult.ok
                    ? 'bg-positive/10 text-positive border border-positive/20'
                    : 'bg-danger/10 text-danger border border-danger/20',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>
                    {testResult.ok
                      ? `Connected: ${testResult.application ?? 'MoneyTrack'} v${testResult.version ?? '1.0.0'}`
                      : (testResult.error ?? 'Connection failed')}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
              <span>Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setBackendUrl('http://127.0.0.1:8000/api')
                  void handleSaveBackendUrl('http://127.0.0.1:8000/api')
                  void handleTestConnection('http://127.0.0.1:8000/api')
                }}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 hover:border-[var(--primary)] text-[var(--text)]"
              >
                USB: http://127.0.0.1:8000/api
              </button>
              <button
                type="button"
                onClick={() => {
                  setBackendUrl('/api')
                  void handleSaveBackendUrl('/api')
                  void handleTestConnection('/api')
                }}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 hover:border-[var(--primary)] text-[var(--text)]"
              >
                Default: /api
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Database size={18} />
              </span>
              <div className="setting-text">
                <h3>Database & storage</h3>
                <p>
                  {dbStatus.provider === 'neon'
                    ? 'Connected to Neon PostgreSQL (Serverless Cloud)'
                    : dbStatus.provider === 'postgresql'
                    ? 'Connected to PostgreSQL Cloud Database'
                    : dbStatus.connected
                    ? 'All changes saved locally on this device in SQLite'
                    : 'Backend database is offline'}
                </p>
              </div>
            </div>
            <Badge tone={dbStatus.connected ? 'positive' : 'danger'}>
              {dbStatus.provider === 'neon'
                ? 'Neon PG'
                : dbStatus.provider === 'postgresql'
                ? 'PostgreSQL'
                : dbStatus.connected
                ? 'Local SQLite'
                : 'Offline'}
            </Badge>
          </div>
        </div>
      </section>

      {/* Section 3: Data management */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>Data management</h2>
          <p>Export a copy or restore your MoneyTrack data.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <FileSpreadsheet size={18} />
              </span>
              <div className="setting-text">
                <h3>Expenses CSV</h3>
                <p>Download full transaction ledger in spreadsheet CSV format</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={exporting === 'csv'}
              disabled={Boolean(exporting)}
              onClick={() => void handleExport('csv')}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <FileJson size={18} />
              </span>
              <div className="setting-text">
                <h3>Full JSON backup</h3>
                <p>Categories, expense items, amounts in paise and metadata</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={exporting === 'json'}
              disabled={Boolean(exporting)}
              onClick={() => void handleExport('json')}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export JSON
            </Button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Upload size={18} />
              </span>
              <div className="setting-text">
                <h3>Restore from backup</h3>
                <p>Safely merge records from a MoneyTrack JSON file</p>
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={restoring}
                disabled={!online || Boolean(exporting) || restoring}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                Restore JSON
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: SMS transactions */}
      <section className="settings-section">
        <div className="settings-heading">
          <h2>SMS transactions</h2>
          <p>Available in the MoneyTrack Android app.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Smartphone size={18} />
              </span>
              <div className="setting-text">
                <h3>Automatic SMS scan</h3>
                <p>Detect expenses from transaction messages on Android</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={smsSettings?.smsAutomationEnabled ? 'primary' : 'secondary'}
                loading={smsLoading}
                onClick={handleToggleSmsAutomation}
              >
                {smsSettings?.smsAutomationEnabled ? 'Enabled' : 'Enable'}
              </Button>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Phone size={18} />
              </span>
              <div className="setting-text">
                <h3>Android SMS permission</h3>
                <p>Required to detect incoming bank and UPI debit alerts</p>
              </div>
            </div>
            <Button
              size="sm"
              variant={
                permissionStatus?.granted || permissionStatus?.receiveSms === 'granted'
                  ? 'secondary'
                  : 'primary'
              }
              loading={requestingPermission}
              disabled={permissionStatus?.receiveSms === 'unsupported'}
              onClick={() => void handleRequestSmsPermissions()}
            >
              {permissionStatus?.granted || permissionStatus?.receiveSms === 'granted'
                ? 'Re-check'
                : 'Grant Permission'}
            </Button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Bell size={18} />
              </span>
              <div className="setting-text">
                <h3>System notifications permission</h3>
                <p>Required for instant debit fraud alerts & weekly digest reports</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {permissionStatus?.postNotifications === 'granted' ||
              (typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted') ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Granted</span>
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  loading={requestingPermission}
                  onClick={async () => {
                    setRequestingPermission(true)
                    try {
                      await SmsPlugin.requestPermissions()
                      await checkSmsPermissions()
                      showToast({
                        title: 'Notification permission requested',
                        description: 'Please confirm the permission prompt if shown.',
                      })
                    } finally {
                      setRequestingPermission(false)
                    }
                  }}
                >
                  Enable Notifications
                </Button>
              )}
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-icon">
                <Bell size={18} />
              </span>
              <div className="setting-text">
                <h3>Review queue & actions</h3>
                <p>Inspect pending transactions or clear unreviewed queue</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/sms-review">
                <Button size="sm" variant="secondary">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Review Queue
                </Button>
              </Link>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setClearQueueConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Clear
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-2 pt-2 pb-4 text-xs text-[var(--muted)]">
        <Server size={14} />
        <span>MoneyTrack · Personal expenditure tracking · v{appVersion}</span>
      </div>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onClose={() => {
          setRestoreTarget(null)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
        onConfirm={() => void handleConfirmRestore()}
        loading={restoring}
        tone="primary"
        title="Restore records from backup?"
        confirmLabel="Restore records"
        description={
          restoreTarget ? (
            <div className="space-y-2 text-xs leading-5">
              <p>
                Ready to restore from <strong className="font-semibold text-[var(--text)]">{restoreTarget.fileName}</strong>:
              </p>
              <ul className="list-disc pl-4 text-[var(--muted)]">
                <li>
                  <strong className="text-[var(--text)]">{restoreTarget.typeCount}</strong> expense type(s)
                </li>
                <li>
                  <strong className="text-[var(--text)]">{restoreTarget.expenseCount}</strong> transaction(s)
                </li>
              </ul>
              <p className="pt-1 text-[var(--muted)]">
                Records will be merged safely into your database. Matching expense types will be reused, new types will be added, and duplicate expenses will be skipped. Your existing records will not be deleted.
              </p>
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        open={clearQueueConfirmOpen}
        onClose={() => setClearQueueConfirmOpen(false)}
        onConfirm={() => void handleClearSmsQueue()}
        loading={clearingQueue}
        tone="danger"
        title="Clear pending SMS review queue?"
        confirmLabel="Clear queue"
        description="This will remove all pending unreviewed SMS transactions currently queued on this device. Existing saved expenses in your database will not be affected."
      />
    </div>
  )
}
