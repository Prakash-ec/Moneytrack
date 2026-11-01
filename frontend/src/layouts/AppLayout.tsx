import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  Camera,
  Database,
  LayoutDashboard,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Tags,
  TrendingUp,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { CommandPalette } from '@/components/CommandPalette'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { Modal } from '@/components/ui/Modal'
import { OfflineBanner, SlowNetworkBanner } from '@/components/ui/States'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import { flushOfflineQueue, getOfflineQueue } from '@/services/offlineQueue'
import { SmsPlugin } from '@/services/sms'
import { cn } from '@/utils/cn'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/income', label: 'Income', icon: ArrowDownLeft },
  { to: '/bank-accounts', label: 'Bank Accounts', icon: Building2 },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/breakdown', label: 'Breakdown', icon: PieChart },
  { to: '/expense-types', label: 'Expense Types', icon: Tags },
  { to: '/trends', label: 'Trends', icon: TrendingUp },
  { to: '/weekly-report', label: 'Weekly Report', icon: Calendar },
  { to: '/security', label: 'Security Centre', icon: ShieldCheck },
  { to: '/sms-review', label: 'SMS Review', icon: MessageSquareText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/bank-accounts', label: 'Banks', icon: Building2 },
  { to: '/weekly-report', label: 'Report', icon: Calendar },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="brand" onClick={onClick} aria-label="MoneyTrack Home">
      <span className="brand-mark">
        <TrendingUp className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <div className="brand-title">MoneyTrack</div>
        <div className="brand-sub">Private ledger</div>
      </div>
    </button>
  )
}

function Sidebar({ unauthorisedSmsCount }: { unauthorisedSmsCount: number }) {
  const { openCreate, openScanReceipt } = useExpenseDialog()
  const navigate = useNavigate()

  return (
    <aside className="sidebar" aria-label="Sidebar navigation">
      <Brand onClick={() => navigate('/')} />

      <div className="sidebar-actions">
        <button
          type="button"
          onClick={() => openCreate()}
          className="button button-primary w-full"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add expense</span>
        </button>
        <button
          type="button"
          onClick={() => openScanReceipt()}
          className="button button-secondary w-full"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span>Scan receipt</span>
        </button>
      </div>

      <nav className="desktop-nav" aria-label="Main navigation">
        {SIDEBAR_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn('nav-item', isActive && 'active')
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/sms-review' && unauthorisedSmsCount > 0 && (
              <span className="notification-badge" title={`${unauthorisedSmsCount} unrecognised payment alerts`}>
                {unauthorisedSmsCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="privacy-note">
        <div className="privacy-note-title">
          <Database className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Local SQLite Database</span>
        </div>
        <div className="privacy-note-desc">
          Your records stay private on this machine with zero cloud tracking.
        </div>
      </div>
    </aside>
  )
}

function Topbar({
  onOpenSearch,
  unreadNotifCount = 0,
}: {
  onOpenSearch?: () => void
  unreadNotifCount?: number
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { openScanReceipt } = useExpenseDialog()

  const currentNav = SIDEBAR_NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  )
  const title = currentNav?.label ?? (location.pathname === '/scanner' ? 'Receipt Scanner' : 'MoneyTrack')

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark')
    }
  }

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="mobile-brand"
          onClick={() => navigate('/')}
          aria-label="MoneyTrack Home"
        >
          <span className="brand-mark h-7 w-7 rounded-md">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </span>
          <strong className="text-sm font-bold text-text">MoneyTrack</strong>
        </button>
        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-right">
        {onOpenSearch && (
          <>
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Search and command palette"
            >
              <Search className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Search or command…</span>
              <kbd className="ml-1 font-mono text-[10px] bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--border)] text-muted">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={onOpenSearch}
              className="button button-ghost button-icon text-muted hover:text-text md:hidden"
              title="Search transactions and commands"
              aria-label="Open search palette"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}

        <Link
          to="/notifications"
          className="relative button button-ghost button-icon text-muted hover:text-text"
          title="Notification Centre"
          aria-label="Notification Centre"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadNotifCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-sm">
              {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
            </span>
          )}
        </Link>

        {online ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted">
            <Wifi className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Online</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-warning">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Offline ready</span>
          </span>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="button button-ghost button-icon text-muted hover:text-text"
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => openScanReceipt()}
          className="button button-secondary button-sm sm:hidden"
          aria-label="Scan receipt"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Scan</span>
        </button>
      </div>
    </header>
  )
}

function MobileNav({
  unauthorisedSmsCount,
  unreadNotifCount = 0,
  onMoreClick,
  isMoreActive,
}: {
  unauthorisedSmsCount: number
  unreadNotifCount?: number
  onMoreClick: () => void
  isMoreActive: boolean
}) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {MOBILE_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <div className="relative inline-flex items-center justify-center">
            <item.icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </div>
          <span>{item.label}</span>
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMoreClick}
        className={isMoreActive ? 'active' : ''}
        aria-label="More navigation items"
      >
        <div className="relative inline-flex items-center justify-center">
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {(unauthorisedSmsCount > 0 || unreadNotifCount > 0) && (
            <span className="notification-badge absolute -top-1.5 -right-2 text-[9px] min-w-[14px] h-[14px] p-0 flex items-center justify-center bg-danger">
              {unauthorisedSmsCount + unreadNotifCount}
            </span>
          )}
        </div>
        <span>More</span>
      </button>
    </nav>
  )
}

export function AppLayout() {
  const online = useOnlineStatus()
  const location = useLocation()
  const navigate = useNavigate()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const { openCreate } = useExpenseDialog()
  const [offlineCount, setOfflineCount] = useState(() => getOfflineQueue().length)
  const [syncingOffline, setSyncingOffline] = useState(false)
  const [unauthorisedSmsCount, setUnauthorisedSmsCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  const isMoreActive = [
    '/income',
    '/transfers',
    '/breakdown',
    '/expense-types',
    '/trends',
    '/security',
    '/sms-review',
    '/notifications',
    '/settings',
  ].some((p) => location.pathname.startsWith(p))

  // Polling unread notification count
  const checkNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications(true)
      setUnreadNotifCount(res.unread_count)
    } catch {
      // offline or waiting
    }
  }, [])

  useEffect(() => {
    void checkNotifications()
    const interval = setInterval(() => void checkNotifications(), 15000)
    return () => clearInterval(interval)
  }, [checkNotifications])

  // Keyboard shortcut: Cmd+K / Ctrl+K and '/' for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      } else if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const checkPendingSms = useCallback(async () => {
    try {
      const res = await SmsPlugin.getPendingTransactions()
      const pending = res.items.filter(
        (i) => i.status === 'PENDING_REVIEW' || i.status === 'READY_TO_SYNC',
      ).length
      setUnauthorisedSmsCount(pending)
    } catch {
      // web
    }
  }, [])

  useEffect(() => {
    void checkPendingSms()
    const interval = setInterval(() => void checkPendingSms(), 10000)
    window.addEventListener('moneytrack:sms-changed', checkPendingSms)
    return () => {
      clearInterval(interval)
      window.removeEventListener('moneytrack:sms-changed', checkPendingSms)
    }
  }, [checkPendingSms])

  useEffect(() => {
    const handleQueueChange = () => setOfflineCount(getOfflineQueue().length)
    window.addEventListener('moneytrack:offline-queue-changed', handleQueueChange)
    return () => window.removeEventListener('moneytrack:offline-queue-changed', handleQueueChange)
  }, [])

  const handleSyncOffline = useCallback(async () => {
    setSyncingOffline(true)
    try {
      const res = await flushOfflineQueue()
      setOfflineCount(getOfflineQueue().length)
      if (res.synced > 0) {
        showToast({
          title: 'Offline sync complete',
          description: `Synced ${res.synced} offline transaction${res.synced === 1 ? '' : 's'}.`,
        })
        invalidate()
      }
    } catch {
      showToast({ title: 'Sync failed', description: 'Could not sync offline transactions.', variant: 'error' })
    } finally {
      setSyncingOffline(false)
    }
  }, [showToast, invalidate])

  useEffect(() => {
    if (online && offlineCount > 0 && !syncingOffline) {
      handleSyncOffline()
    }
  }, [online, offlineCount, syncingOffline, handleSyncOffline])

  return (
    <div className="app-shell">
      <OfflineBanner />
      <SlowNetworkBanner />
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <Sidebar unauthorisedSmsCount={unauthorisedSmsCount} />

      <div className="app-main">
        <Topbar
          onOpenSearch={() => setCommandPaletteOpen(true)}
          unreadNotifCount={unreadNotifCount}
        />

        {!online && (
          <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>You are offline. New expenses will be saved locally and synced once reconnected.</span>
          </div>
        )}

        {offlineCount > 0 && (
          <div className="flex items-center justify-between border-b border-primary/20 bg-primary-soft px-4 py-2 text-xs text-primary sm:px-6">
            <span className="flex items-center gap-2 font-medium">
              <RefreshCw className={cn('h-3.5 w-3.5', syncingOffline && 'animate-spin')} aria-hidden="true" />
              <span>{offlineCount} expense{offlineCount === 1 ? '' : 's'} stored offline awaiting sync</span>
            </span>
            <button
              type="button"
              disabled={syncingOffline || !online}
              onClick={handleSyncOffline}
              className="button button-primary button-sm"
            >
              {syncingOffline ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}

        {unauthorisedSmsCount > 0 && location.pathname !== '/sms-review' && (
          <div className="sms-alert-banner mx-4 sm:mx-8 mt-4">
            <div className="flex items-center gap-3">
              <span className="notification-badge">{unauthorisedSmsCount}</span>
              <div>
                <strong className="text-xs font-semibold text-[var(--text)]">
                  Action Required: {unauthorisedSmsCount} unrecognised payment{unauthorisedSmsCount > 1 ? 's' : ''} detected
                </strong>
                <p className="text-[11px] text-[var(--muted)]">
                  Review and authorise to record {unauthorisedSmsCount > 1 ? 'them' : 'it'} into your expenses.
                </p>
              </div>
            </div>
            <Link to="/sms-review" className="button button-primary button-sm shrink-0 flex items-center gap-1.5">
              <span>Authorise now</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        <main id="main-content" className="flex-1">
          <Outlet />
        </main>
      </div>

      <button
        type="button"
        className="fab"
        onClick={() => openCreate()}
        aria-label="Add expense"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>

      <MobileNav
        unauthorisedSmsCount={unauthorisedSmsCount}
        unreadNotifCount={unreadNotifCount}
        onMoreClick={() => setMoreMenuOpen(true)}
        isMoreActive={isMoreActive}
      />

      <Modal
        open={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        title="Quick Navigation & Tools"
        description="Jump to all MoneyTrack features"
      >
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/income')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Income</div>
              <div className="text-[10px] text-muted">Earnings & Salary</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/transfers')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Transfers</div>
              <div className="text-[10px] text-muted">Between Accounts</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/breakdown')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <PieChart className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Breakdown</div>
              <div className="text-[10px] text-muted">Category Analytics</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/expense-types')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Tags className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Expense Types</div>
              <div className="text-[10px] text-muted">Categories</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/trends')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Trends</div>
              <div className="text-[10px] text-muted">Spending Velocity</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/security')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Security</div>
              <div className="text-[10px] text-muted">Fraud Detection</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/sms-review')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition relative"
          >
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-text flex items-center justify-between">
                <span>SMS Review</span>
                {unauthorisedSmsCount > 0 && <span className="notification-badge">{unauthorisedSmsCount}</span>}
              </div>
              <div className="text-[10px] text-muted">Auto-detected</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/notifications')
            }}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-text flex items-center justify-between">
                <span>Alerts</span>
                {unreadNotifCount > 0 && <span className="notification-badge">{unreadNotifCount}</span>}
              </div>
              <div className="text-[10px] text-muted">Notifications</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen(false)
              navigate('/settings')
            }}
            className="col-span-2 flex items-center gap-3 p-3 rounded-xl bg-surface-raised hover:bg-primary-soft border border-border text-left transition"
          >
            <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text">Settings & Backup</div>
              <div className="text-[10px] text-muted">Preferences, Theme, and Data Export/Restore</div>
            </div>
          </button>
        </div>
      </Modal>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  )
}
