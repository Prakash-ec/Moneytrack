import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Building2,
  Camera,
  Database,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  PieChart,
  Plus,
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
import { BackendWakingBanner, OfflineBanner } from '@/components/ui/States'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useAuth } from '@/providers/AuthProvider'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import { startKeepAliveService } from '@/services/keepAlive'
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
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/bank-accounts', label: 'Accounts', icon: Building2 },
  { to: '/analytics', label: 'Analytics', icon: PieChart },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Ledger', icon: ArrowLeftRight },
  { to: '/bank-accounts', label: 'Accounts', icon: Building2 },
  { to: '/analytics', label: 'Insights', icon: PieChart },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="brand" onClick={onClick} aria-label="MoneyTrack Home">
      <span className="brand-mark h-8 w-8 min-w-[32px] max-w-[32px] min-h-[32px] max-h-[32px] shrink-0 aspect-square overflow-hidden p-1 bg-surface-elevated border border-border">
        <img
          src="/branding/moneytrack-icon.svg"
          className="h-full w-full max-h-full max-w-full shrink-0 aspect-square object-contain block"
          alt=""
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 text-left">
        <div className="brand-title truncate">MoneyTrack</div>
        <div className="brand-sub truncate">Private ledger</div>
      </div>
    </button>
  )
}

function DatabaseStatusBadge() {
  const [dbState, setDbState] = useState<{
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

    const fetchDbStatus = async () => {
      try {
        const res = await api.databaseHealth()
        if (active) {
          setDbState({
            provider: res.provider || 'sqlite',
            connected: res.connected,
            status: res.status,
          })
        }
      } catch {
        try {
          const fallback = await api.health()
          if (active) {
            setDbState({
              provider: fallback.provider || (fallback.database === 'connected' ? 'sqlite' : 'unknown'),
              connected: fallback.database === 'connected',
              status: fallback.status,
            })
          }
        } catch {
          if (active) {
            setDbState({
              provider: 'unknown',
              connected: false,
              status: 'unavailable',
            })
          }
        }
      }
    }

    void fetchDbStatus()
    return () => {
      active = false
    }
  }, [])

  const getProviderInfo = () => {
    if (!dbState.connected || dbState.status === 'unavailable') {
      return {
        name: 'Database Offline',
        desc: 'Cannot reach backend database service.',
        dot: 'bg-rose-500',
      }
    }
    if (dbState.provider === 'neon') {
      return {
        name: 'Neon PostgreSQL',
        desc: 'Neon Serverless Cloud Database connected.',
        dot: 'bg-emerald-500',
      }
    }
    if (dbState.provider === 'postgresql') {
      return {
        name: 'PostgreSQL Database',
        desc: 'PostgreSQL cloud database connected.',
        dot: 'bg-emerald-500',
      }
    }
    return {
      name: 'Local SQLite Database',
      desc: 'Private on-device storage with zero cloud tracking.',
      dot: 'bg-emerald-500',
    }
  }

  const info = getProviderInfo()

  return (
    <div className="privacy-note" role="status" aria-label={`Database: ${info.name}`}>
      <div className="privacy-note-title flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Database className="h-3.5 w-3.5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{info.name}</span>
        </div>
        <span
          className={cn('h-2 w-2 rounded-full flex-shrink-0', info.dot)}
          title={dbState.connected ? 'Connected' : 'Offline'}
        />
      </div>
      <div className="privacy-note-desc">
        {info.desc}
      </div>
    </div>
  )
}

function Sidebar({ unauthorisedSmsCount }: { unauthorisedSmsCount: number }) {
  const { openCreate, openScanReceipt } = useExpenseDialog()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    const pendingCount = getOfflineQueue(user?.id).length
    if (pendingCount > 0 && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `You have ${pendingCount} unsynchronized offline transaction${
          pendingCount === 1 ? '' : 's'
        } pending on this device.\n\nThey are preserved securely under your account and will sync automatically when you log back in.\n\nDo you want to log out now?`
      )
      if (!confirmed) return
    }
    logout()
  }

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
              <span className="notification-badge" title={`${unauthorisedSmsCount} new transaction review alerts`}>
                {unauthorisedSmsCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="privacy-note mb-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <div className="truncate text-xs font-semibold text-ink">
              {user?.full_name || 'Account'}
            </div>
            <div className="truncate text-[11px] text-subtle">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <DatabaseStatusBadge />
    </aside>
  )
}

function Topbar({
  onOpenSearch,
  unreadNotifCount = 0,
  unauthorisedSmsCount = 0,
}: {
  onOpenSearch?: () => void
  unreadNotifCount?: number
  unauthorisedSmsCount?: number
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
      <div className="flex items-center gap-3 min-w-0 shrink">
        <button
          type="button"
          className="mobile-brand shrink-0 min-w-0"
          onClick={() => navigate('/')}
          aria-label="MoneyTrack Home"
        >
          <span className="brand-mark h-7 w-7 min-w-[28px] max-w-[28px] min-h-[28px] max-h-[28px] shrink-0 aspect-square rounded-md overflow-hidden p-0.5 bg-surface-elevated border border-border">
            <img
              src="/branding/moneytrack-icon.svg"
              className="h-full w-full max-h-full max-w-full shrink-0 aspect-square object-contain block"
              alt=""
              aria-hidden="true"
            />
          </span>
          <strong className="text-sm font-bold text-text truncate">MoneyTrack</strong>
        </button>
        <span className="topbar-title truncate">{title}</span>
      </div>

      <div className="topbar-right">
        {onOpenSearch && (
          <>
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-xs text-muted bg-[var(--surface-raised)] hover:bg-[var(--surface)] border border-[var(--border)] rounded-lg transition-colors focus:outline-none focus:border-primary"
              aria-label="Search and command palette"
            >
              <Search className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
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

        {unauthorisedSmsCount > 0 && (
          <Link
            to="/sms-review"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary/10 border border-primary/20 text-primary font-medium hover:bg-primary/20 transition-colors"
            title={`${unauthorisedSmsCount} new payment alerts`}
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{unauthorisedSmsCount} SMS</span>
            <span className="sm:hidden">{unauthorisedSmsCount}</span>
          </Link>
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
  const { user } = useAuth()
  const [offlineCount, setOfflineCount] = useState(() => getOfflineQueue(user?.id).length)
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
    const handleQueueChange = () => setOfflineCount(getOfflineQueue(user?.id).length)
    setOfflineCount(getOfflineQueue(user?.id).length)
    window.addEventListener('moneytrack:offline-queue-changed', handleQueueChange)
    return () => window.removeEventListener('moneytrack:offline-queue-changed', handleQueueChange)
  }, [user?.id])

  const handleSyncOffline = useCallback(async () => {
    setSyncingOffline(true)
    try {
      const res = await flushOfflineQueue(user?.id)
      setOfflineCount(getOfflineQueue(user?.id).length)
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
  }, [user?.id, showToast, invalidate])

  useEffect(() => {
    if (online && offlineCount > 0 && !syncingOffline) {
      handleSyncOffline()
    }
  }, [online, offlineCount, syncingOffline, handleSyncOffline])

  useEffect(() => {
    const stopKeepAlive = startKeepAliveService()
    return () => {
      stopKeepAlive()
    }
  }, [])

  return (
    <div className="app-shell">
      {/* Floating status pills at top center - never disrupts flex layout */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-1.5 pointer-events-none">
        <BackendWakingBanner />
        <OfflineBanner />
      </div>

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
          unauthorisedSmsCount={unauthorisedSmsCount}
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
              <span>{offlineCount} transaction{offlineCount === 1 ? '' : 's'} stored offline awaiting sync</span>
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
                  Review Required: {unauthorisedSmsCount} new transaction{unauthorisedSmsCount > 1 ? 's' : ''} awaiting review
                </strong>
                <p className="text-[11px] text-[var(--muted)]">
                  Review and confirm details to record {unauthorisedSmsCount > 1 ? 'them' : 'it'} into your accounts.
                </p>
              </div>
            </div>
            <Link to="/sms-review" className="button button-primary button-sm shrink-0 flex items-center gap-1.5">
              <span>Review now</span>
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
