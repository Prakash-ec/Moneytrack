import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/FormControls'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useToast } from '@/providers/ToastProvider'
import { api, downloadExport, getApiBase, setApiBase, testConnection } from '@/services/api'
import { SmsPlugin, type PermissionStatus } from '@/services/sms'
import { cn } from '@/utils/cn'

const THEME_OPTIONS = [
  {
    value: 'system' as const,
    label: 'System',
    description: 'Follow your device appearance.',
    icon: Monitor,
  },
  {
    value: 'light' as const,
    label: 'Light',
    description: 'Bright canvas for daytime.',
    icon: Sun,
  },
  {
    value: 'dark' as const,
    label: 'Dark',
    description: 'Low-glare evening view.',
    icon: Moon,
  },
]

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { showToast } = useToast()
  const { invalidate } = useDataRefresh()
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
    loadSmsSettings()
    checkSmsPermissions()
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
    if (!smsSettings) return
    setSmsLoading(true)
    try {
      await SmsPlugin.setAutomationEnabled({ enabled: !smsSettings.smsAutomationEnabled })
      await loadSmsSettings()
    } catch {
      // ignore
    } finally {
      setSmsLoading(false)
    }
  }, [smsSettings, loadSmsSettings])

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
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Appearance, your data, and how MoneyTrack runs on this device."
      />

      <Card className="p-4 sm:p-5">
        <CardHeader
          title="Appearance"
          description={`Currently using the ${resolvedTheme} theme${
            theme === 'system' ? ' from your device setting' : ''
          }.`}
        />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3" role="group" aria-label="Theme preference">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={selected}
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
                  selected
                    ? 'border-primary/45 bg-primary-soft ring-1 ring-primary/15'
                    : 'border-line bg-surface hover:border-primary/25 hover:bg-elevated/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-primary text-primary-contrast' : 'bg-elevated text-muted',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">
                    {option.description}
                  </span>
                </span>
                {selected ? (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden />
                ) : null}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Export your data"
            description="Downloads include every record on this MoneyTrack database, not just the selected period."
          />
          <div className="mt-4 space-y-2.5">
            <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Expenses CSV</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Spreadsheet-friendly rows with dates, types, amounts, notes, and methods.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                loading={exporting === 'csv'}
                disabled={Boolean(exporting)}
                onClick={() => void handleExport('csv')}
              >
                <Download className="h-4 w-4" aria-hidden />
                CSV
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                  <FileJson className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Full JSON backup</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Expense types plus transactions, with paise and rupee amounts preserved.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                loading={exporting === 'json'}
                disabled={Boolean(exporting)}
                onClick={() => void handleExport('json')}
              >
                <Download className="h-4 w-4" aria-hidden />
                JSON
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Upload className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Restore from backup</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Safely import and merge records from a previously exported MoneyTrack JSON file.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
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
                  className="w-full sm:w-auto"
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
          <p className="mt-3 flex gap-1.5 text-[11px] leading-5 text-subtle">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Exported files may contain personal financial notes. Store them somewhere safe.
          </p>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="System status"
            description="Live connection to the local MoneyTrack API and database."
            action={
              <Badge tone={healthQuery.data?.status === 'ok' ? 'positive' : 'neutral'}>
                {!online
                  ? 'Offline'
                  : healthQuery.loading
                    ? 'Checking'
                    : healthQuery.data?.status === 'ok'
                      ? 'Operational'
                      : healthQuery.error
                        ? 'Unavailable'
                        : 'Degraded'}
              </Badge>
            }
          />
          <div className="mt-4 divide-y divide-line rounded-xl border border-line">
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-muted">
                <Database className="h-3.5 w-3.5 text-subtle" aria-hidden />
                Database
              </span>
              <span className="text-xs font-semibold text-ink">
                {!online
                  ? 'Offline'
                  : healthQuery.loading
                    ? 'Checking…'
                    : healthQuery.data?.database === 'connected'
                      ? 'SQLite connected'
                      : 'Not available'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <span className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-subtle" aria-hidden />
                Storage
              </span>
              <span className="text-xs font-semibold text-ink">Local only</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <span className="text-xs text-muted">Timezone</span>
              <span className="text-xs font-semibold text-ink">Asia/Kolkata (IST)</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <span className="text-xs text-muted">Currency</span>
              <span className="text-xs font-semibold text-ink">Indian Rupee (INR)</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <span className="text-xs text-muted">Version</span>
              <span className="tabular text-xs font-semibold text-ink">{appVersion}</span>
            </div>
          </div>
          {!online ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-warning">
              <WifiOff className="h-3.5 w-3.5" aria-hidden />
              Reconnect to the local API to refresh this status.
            </p>
          ) : healthQuery.error ? (
            <p className="mt-3 text-[11px] leading-5 text-danger">{healthQuery.error.message}</p>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <CardHeader
            title="Receipt scanner & local OCR"
            description="Extract expenses from physical receipts and bills with zero per-request costs."
            action={<Camera className="h-4 w-4 text-primary" aria-hidden />}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-line bg-elevated/60 p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-xs font-semibold text-ink">Local OCR setup (Tesseract)</p>
              </div>
              <p className="text-xs leading-5 text-muted">
                Receipt images are processed on your local machine using Tesseract OCR. No images are sent to third parties or cloud services.
              </p>
              <div className="rounded-lg border border-line bg-surface p-2.5 font-mono text-[11px] text-ink">
                winget install UB-Mannheim.TesseractOCR
              </div>
              <p className="text-[11px] text-subtle">
                Ensure <code className="rounded bg-elevated px-1 py-0.5">tesseract</code> is available in your PATH or backend environment.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-line bg-elevated/60 p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-positive" />
                <p className="text-xs font-semibold text-ink">Mobile camera & HTTPS</p>
              </div>
              <p className="text-xs leading-5 text-muted">
                Mobile browsers require HTTPS or <code className="rounded bg-surface px-1 py-0.5">localhost</code> to stream live camera video. When accessing MoneyTrack over local Wi-Fi (e.g. <code className="rounded bg-surface px-1 py-0.5">http://192.168.x.x:8000</code>), use the <strong>Native camera photo</strong> option to take pictures directly.
              </p>
              <p className="text-[11px] text-muted">
                Supports JPEG, PNG, and WebP images up to 10MB.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-line bg-elevated/60 p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-xs font-semibold text-ink">Manual text fallback</p>
              </div>
              <p className="text-xs leading-5 text-muted">
                If Tesseract is not installed or you have digital bills, SMS transaction summaries, or email receipts, click <strong>Paste text</strong> in the scanner modal. The parser will extract merchants, dates, totals, taxes, and line items.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-line bg-elevated/60 p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <p className="text-xs font-semibold text-ink">Review before saving</p>
              </div>
              <p className="text-xs leading-5 text-muted">
                MoneyTrack <strong>never auto-saves</strong> scanned receipts. Extracted amounts, dates, and categories are presented for your review. You can inspect confidence tags, edit any field, and only save when you are satisfied.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Install MoneyTrack"
            description="The full installable app works from http://localhost:8000 or any HTTPS address."
            action={<Smartphone className="h-4 w-4 text-primary" aria-hidden />}
          />
          <ol className="mt-4 space-y-3">
            {[
              'On this computer, run start-prod.ps1, open http://localhost:8000, then use the install icon in Chrome or Edge.',
              'Android Chrome: open the menu and choose “Add to Home screen”. iPhone Safari: tap Share, then “Add to Home Screen”.',
              'Over plain Wi-Fi HTTP, phones may add a shortcut, but browsers only enable the offline service worker on HTTPS or localhost.',
              'The interface can load offline after one production visit; records always require the local API. If using a phone, keep it connected to the same network as the computer.',
            ].map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-muted">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Backend server connection"
            description="Configure and test the MoneyTrack API server address for this device."
            action={<Server className="h-4 w-4 text-primary" aria-hidden />}
          />
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <label htmlFor="backend-url-input" className="text-xs font-semibold text-ink">
                API Base URL
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="backend-url-input"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://192.168.1.x:8000/api or /api"
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
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void handleSaveBackendUrl()}
                  >
                    Save URL
                  </Button>
                </div>
              </div>
            </div>

            {testResult ? (
              <div
                className={cn(
                  'rounded-xl border p-3 text-xs leading-5',
                  testResult.ok
                    ? 'border-positive/30 bg-positive-soft text-positive'
                    : 'border-danger/30 bg-danger-soft text-danger',
                )}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {testResult.ok
                    ? `Connected: ${testResult.application ?? 'MoneyTrack API'} (v${testResult.version ?? '1.0.0'})`
                    : 'Connection Failed'}
                </div>
                {!testResult.ok && testResult.error ? (
                  <p className="mt-1 text-ink/80">{testResult.error}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="text-[11px] font-semibold text-muted">Quick presets:</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBackendUrl('http://127.0.0.1:8000/api')
                    void handleSaveBackendUrl('http://127.0.0.1:8000/api')
                    void handleTestConnection('http://127.0.0.1:8000/api')
                  }}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-mono text-muted hover:border-primary/40 hover:text-ink transition"
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
                  className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-mono text-muted hover:border-primary/40 hover:text-ink transition"
                >
                  Default: /api
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-elevated/50 p-3 text-xs leading-5 text-muted space-y-1">
              <p className="font-semibold text-ink flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-primary" aria-hidden />
                Connecting Android phone or emulator to your computer
              </p>
              <p>
                On Android devices, <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px]">127.0.0.1</code> refers to the phone itself.
              </p>
              <p>
                • <strong>USB cable:</strong> Connect your phone, enable USB debugging, and run <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px]">adb reverse tcp:8000 tcp:8000</code> on your computer.
              </p>
              <p>
                • <strong>Same Wi-Fi:</strong> Use your computer's LAN IP address, such as <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px]">http://192.168.1.x:8000/api</code>.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="SMS transaction detection"
            description="Detect bank and UPI debit transactions from incoming SMS on Android."
            action={
              <Badge
                tone={
                  permissionStatus?.granted || permissionStatus?.receiveSms === 'granted'
                    ? 'positive'
                    : permissionStatus?.receiveSms === 'denied'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {permissionStatus?.granted || permissionStatus?.receiveSms === 'granted'
                  ? 'Permission Granted'
                  : permissionStatus?.receiveSms === 'denied'
                    ? 'Permission Denied'
                    : permissionStatus?.receiveSms === 'unsupported'
                      ? 'Web / Unsupported'
                      : 'Permission Required'}
              </Badge>
            }
          />
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-3 text-xs leading-5 text-ink">
              <p className="font-semibold flex items-center gap-1.5 text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Privacy & On-Device Security Guarantee
              </p>
              <p className="mt-1 text-muted">
                SMS parsing runs entirely on your Android hardware. Only debit transactions (UPI, card, ATM, netbanking) are detected. OTPs, credits, personal chats, and marketing spam are strictly ignored and never saved or transmitted.
              </p>
            </div>

            {permissionStatus?.receiveSms === 'denied' ? (
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs leading-5 text-danger">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  SMS Permission is Denied
                </p>
                <p className="mt-1 text-ink/80">
                  Android has blocked SMS access. To enable auto-detection, open <strong>Settings &gt; Apps &gt; MoneyTrack &gt; Permissions &gt; SMS</strong> and select <strong>Allow</strong>.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                  <Smartphone className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Android SMS Permission</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Required to detect incoming bank and UPI debit alerts.
                  </p>
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
                  ? 'Re-check Permission'
                  : 'Grant Permission'}
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                  <Check className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Auto-detect Debit SMS</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Background listener creates review records when debits arrive.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={smsSettings?.smsAutomationEnabled ? 'primary' : 'secondary'}
                loading={smsLoading}
                onClick={handleToggleSmsAutomation}
                disabled={!smsSettings}
              >
                {smsSettings?.smsAutomationEnabled ? 'Enabled' : 'Enable'}
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
                  <Bell className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Review Queue & Actions</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    Inspect pending transactions or clear unreviewed queue entries.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link to="/sms-review">
                  <Button size="sm" variant="secondary">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Review Queue
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setClearQueueConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden />
                  Clear Queue
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <CardHeader
            title="Privacy & access"
            description="MoneyTrack is designed to stay on hardware you control."
            action={<ShieldCheck className="h-4 w-4 text-primary" aria-hidden />}
          />
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
              Records are stored in a local SQLite database on the computer running the backend.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
              No third-party analytics, trackers, cloud sync, bank connections, or sample
              transactions are included.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
              There is no sign-in. Anyone who can reach this URL or your local API can view and
              change records. Keep it on a trusted network and never expose the API directly to the
              internet.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
              Use the exports above for backup before moving computers or making major changes.
            </li>
          </ul>
        </Card>
      </div>

      <div className="flex items-center justify-center gap-2 pb-2 text-[11px] text-subtle">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-elevated text-muted">
          <Database className="h-3 w-3" aria-hidden />
        </span>
        MoneyTrack · Personal expenditure tracking · v{appVersion}
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
                Ready to restore from <strong className="font-semibold text-ink">{restoreTarget.fileName}</strong>:
              </p>
              <ul className="list-disc pl-4 text-muted">
                <li>
                  <strong className="text-ink">{restoreTarget.typeCount}</strong> expense type(s)
                </li>
                <li>
                  <strong className="text-ink">{restoreTarget.expenseCount}</strong> transaction(s)
                </li>
              </ul>
              <p className="pt-1 text-muted">
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
