import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Building2,
  Camera,
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
  description: string
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, description: 'Balance and activity' },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, description: 'Expenses, income, transfers' },
  { to: '/bank-accounts', label: 'Accounts', icon: Building2, description: 'Balances and reconciliation' },
  { to: '/analytics', label: 'Analytics', icon: PieChart, description: 'Trends and breakdowns' },
]

const MANAGE_NAV: NavItem[] = [
  { to: '/sms-review', label: 'SMS review', icon: MessageSquareText, description: 'Review detected payments' },
  { to: '/expense-types', label: 'Categories', icon: Tags, description: 'Expense and income types' },
]

const SYSTEM_NAV: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings, description: 'Preferences and data' },
  { to: '/security', label: 'Security', icon: ShieldCheck, description: 'Alerts and fraud guidance' },
  { to: '/notifications', label: 'Notifications', icon: Bell, description: 'Alerts and reports' },
]

const ALL_NAV = [...PRIMARY_NAV, ...MANAGE_NAV, ...SYSTEM_NAV]

function Brand() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left focus-visible:outline-none"
      aria-label="MoneyTrack home"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-primary-border bg-primary-soft">
        <img
          src="/branding/moneytrack-icon.svg"
          className="h-7 w-7 object-contain"
          alt=""
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.02em] text-text">
          MoneyTrack
        </span>
        <span className="mt-0.5 block text-[11px] font-medium leading-none text-muted">
          Private ledger
        </span>
      </span>
    </button>
  )
}

function NavSection({
  label,
  items,
  smsCount,
}: {
  label: string
  items: NavItem[]
  smsCount: number
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-medium text-muted">{label}</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-primary-soft text-primary'
                : 'text-muted hover:bg-surface-raised hover:text-text',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.to === '/sms-review' && smsCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-contrast">
                  {smsCount > 9 ? '9+' : smsCount}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

function DatabaseStatus() {
  const [state, setState] = useState({ provider: 'sqlite', connected: true })

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await api.databaseHealth()
        if (active) setState({ provider: res.provider || 'sqlite', connected: res.connected })
      } catch {
        try {
          const fallback = await api.health()
          if (active) {
            setState({
              provider: fallback.provider || 'sqlite',
              connected: fallback.database === 'connected',
            })
          }
        } catch {
          if (active) setState({ provider: 'unknown', connected: false })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const label = !state.connected
    ? 'Database offline'
    : state.provider === 'neon'
      ? 'Neon PostgreSQL'
      : state.provider === 'postgresql'
        ? 'PostgreSQL'
        : 'Local SQLite'

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-text">{label}</span>
        <span className="block text-[10px] text-muted">
          {state.connected ? 'Encrypted at rest' : 'Connection lost'}
        </span>
      </span>
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          state.connected ? 'bg-primary' : 'bg-danger',
        )}
        aria-label={state.connected ? 'Connected' : 'Disconnected'}
      />
    </div>
  )
}

function Sidebar({ smsCount }: { smsCount: number }) {
  const { user, logout } = useAuth()
  const { openCreate, openScanReceipt } = useExpenseDialog()
  const navigate = useNavigate()

  const handleLogout = () => {
    const pending = getOfflineQueue(user?.id).length
    if (
      pending > 0 &&
      !window.confirm(
        `You have ${pending} unsynchronised transaction${pending === 1 ? '' : 's'} saved on this device. They stay tied to your account and sync when you sign back in.\n\nSign out now?`,
      )
    ) {
      return
    }
    logout()
  }

  const initials = (user?.full_name || user?.email || 'MT')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-border bg-[var(--sidebar)] px-4 pb-4 pt-5 lg:flex"
      aria-label="Sidebar"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <Brand />
        <button
          type="button"
          onClick={() => openScanReceipt()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
          aria-label="Scan a receipt"
          title="Scan a receipt"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => openCreate()}
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-contrast shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add expense
      </button>

      <nav className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="Main navigation">
        <NavSection label="Main" items={PRIMARY_NAV} smsCount={smsCount} />
        <NavSection label="Manage" items={MANAGE_NAV} smsCount={smsCount} />
        <NavSection label="System" items={SYSTEM_NAV} smsCount={smsCount} />
      </nav>

      <div className="mt-4 space-y-2.5">
        <DatabaseStatus />
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-muted">
            {initials || 'MT'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-text">
              {user?.full_name || 'Your account'}
            </span>
            <span className="block truncate text-[11px] text-muted">{user?.email}</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Privacy-first · local data
        </button>
      </div>
    </aside>
  )
}

function Topbar({
  onOpenSearch,
  unreadCount,
  smsCount,
}: {
  onOpenSearch: () => void
  unreadCount: number
  smsCount: number
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { theme, setTheme, resolvedTheme } = useTheme()

  const current =
    ALL_NAV.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    ) ?? ALL_NAV[0]

  const toggleTheme = () => {
    if (theme === 'system') setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    else setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-bg px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 rounded-lg lg:hidden"
          aria-label="MoneyTrack home"
        >
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md border border-primary-border bg-primary-soft">
            <img src="/branding/moneytrack-icon.svg" className="h-5 w-5 object-contain" alt="" aria-hidden="true" />
          </span>
          <span className="font-display text-sm font-semibold tracking-[-0.02em] text-text">MoneyTrack</span>
        </button>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[11px] font-medium text-muted">MoneyTrack</p>
          <h1 className="truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.02em] text-text">
            {current.label}
          </h1>
        </div>
        <span className="truncate text-sm font-medium text-muted lg:hidden">{current.label}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-muted transition-colors hover:border-border-strong hover:text-text md:inline-flex"
          aria-label="Search transactions and commands"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Search</span>
          <kbd className="ml-1 rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text md:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>

        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium sm:inline-flex',
            online
              ? 'border-primary-border bg-primary-soft text-primary'
              : 'border-warning-border bg-warning-soft text-warning',
          )}
          title={online ? 'Connected' : 'Offline — changes queue locally'}
        >
          {online ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
          {online ? 'Online' : 'Offline'}
        </span>

        {smsCount > 0 ? (
          <Link
            to="/sms-review"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
            aria-label={`${smsCount} payments awaiting review`}
            title={`${smsCount} payments awaiting review`}
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-contrast">
              {smsCount > 9 ? '9+' : smsCount}
            </span>
          </Link>
        ) : null}

        <Link
          to="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-text"
          aria-label="Toggle colour theme"
          title="Toggle colour theme"
        >
          {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}

function MobileNav({
  smsCount,
  unreadCount,
  onMore,
  moreActive,
}: {
  smsCount: number
  unreadCount: number
  onMore: () => void
  moreActive: boolean
}) {
  const { openCreate } = useExpenseDialog()
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
      isActive ? 'text-primary' : 'text-muted',
    )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(62px+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border bg-surface px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Mobile navigation"
    >
      <NavLink to="/" end className={itemClass}>
        <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        <span>Overview</span>
      </NavLink>
      <NavLink to="/transactions" className={itemClass}>
        <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        <span>Ledger</span>
      </NavLink>

      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={() => openCreate()}
          className="absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-bg bg-primary text-primary-contrast shadow-[0_6px_18px_rgba(15,23,42,0.18)] transition-colors hover:bg-primary-hover"
          aria-label="Add expense"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <NavLink to="/sms-review" className={itemClass}>
        <span className="relative">
          <MessageSquareText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          {smsCount > 0 ? (
            <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold text-primary-contrast">
              {smsCount > 9 ? '9+' : smsCount}
            </span>
          ) : null}
        </span>
        <span>Review</span>
      </NavLink>

      <button type="button" onClick={onMore} className={cn('flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium', moreActive ? 'text-primary' : 'text-muted')}>
        <span className="relative">
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
          ) : null}
        </span>
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
  const { user } = useAuth()
  const [offlineCount, setOfflineCount] = useState(() => getOfflineQueue(user?.id).length)
  const [syncingOffline, setSyncingOffline] = useState(false)
  const [smsCount, setSmsCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [commandOpen, setCommandOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const moreActive = ['/income', '/transfers', '/breakdown', '/expense-types', '/trends', '/security', '/sms-review', '/notifications', '/settings'].some(
    (path) => location.pathname.startsWith(path),
  )

  const checkNotifications = useCallback(async () => {
    try {
      const res = await api.getNotifications(true)
      setUnreadCount(res.unread_count)
    } catch {
      /* offline */
    }
  }, [])

  useEffect(() => {
    void checkNotifications()
    const timer = setInterval(() => void checkNotifications(), 15000)
    return () => clearInterval(timer)
  }, [checkNotifications])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      } else if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const checkPendingSms = useCallback(async () => {
    try {
      const res = await SmsPlugin.getPendingTransactions()
      setSmsCount(
        res.items.filter((item) => item.status === 'PENDING_REVIEW' || item.status === 'READY_TO_SYNC').length,
      )
    } catch {
      /* web or plugin unavailable */
    }
  }, [])

  useEffect(() => {
    void checkPendingSms()
    const timer = setInterval(() => void checkPendingSms(), 10000)
    window.addEventListener('moneytrack:sms-changed', checkPendingSms)
    return () => {
      clearInterval(timer)
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
          title: 'Offline transactions synced',
          description: `Saved ${res.synced} transaction${res.synced === 1 ? '' : 's'} to your ledger.`,
        })
        invalidate()
      }
    } catch {
      showToast({ title: 'Sync failed', description: 'Your transactions remain saved on this device.', variant: 'error' })
    } finally {
      setSyncingOffline(false)
    }
  }, [user?.id, showToast, invalidate])

  useEffect(() => {
    if (online && offlineCount > 0 && !syncingOffline) void handleSyncOffline()
  }, [online, offlineCount, syncingOffline, handleSyncOffline])

  useEffect(() => {
    const stop = startKeepAliveService()
    return () => stop()
  }, [])

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="pointer-events-none fixed left-1/2 top-3 z-[100] flex -translate-x-1/2 flex-col items-center gap-1.5">
        <BackendWakingBanner />
        <OfflineBanner />
      </div>

      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-primary px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <Sidebar smsCount={smsCount} />

      <div className="lg:pl-[252px]">
        <Topbar onOpenSearch={() => setCommandOpen(true)} unreadCount={unreadCount} smsCount={smsCount} />

        {!online ? (
          <div className="flex items-center justify-center gap-2 border-b border-warning-border bg-warning-soft px-4 py-2 text-[11px] font-medium text-warning">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            Offline. New transactions are saved on this device and sync automatically.
          </div>
        ) : null}

        {offlineCount > 0 ? (
          <div className="flex items-center justify-between gap-3 border-b border-primary-border bg-primary-soft px-4 py-2 text-[11px] text-primary sm:px-6 lg:px-8">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', syncingOffline && 'animate-spin')} aria-hidden="true" />
              <span className="truncate">
                {offlineCount} transaction{offlineCount === 1 ? '' : 's'} waiting to sync
              </span>
            </span>
            <button
              type="button"
              disabled={syncingOffline || !online}
              onClick={() => void handleSyncOffline()}
              className="shrink-0 rounded-md border border-primary-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-primary disabled:opacity-50"
            >
              {syncingOffline ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        ) : null}

        {smsCount > 0 && location.pathname !== '/sms-review' ? (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-primary-border bg-primary-soft px-4 py-3 sm:mx-6 lg:mx-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary">
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text">
                  {smsCount} payment{smsCount === 1 ? '' : 's'} need review
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  Confirm direction and amount before posting to your ledger.
                </p>
              </div>
            </div>
            <Link
              to="/sms-review"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-contrast"
            >
              Review
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        <main id="main-content" className="pb-[calc(78px+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </main>
      </div>

      <MobileNav
        smsCount={smsCount}
        unreadCount={unreadCount}
        onMore={() => setMoreOpen(true)}
        moreActive={moreActive}
      />

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        description="Every MoneyTrack surface, one tap away."
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { to: '/income', label: 'Income', description: 'Salary and inflows', icon: ArrowDownLeft },
              { to: '/transfers', label: 'Transfers', description: 'Between accounts', icon: ArrowLeftRight },
              { to: '/analytics', label: 'Analytics', description: 'Trends and shares', icon: PieChart },
              { to: '/expense-types', label: 'Categories', description: 'Expense and income types', icon: Tags },
              { to: '/security', label: 'Security', description: 'Alerts and guidance', icon: ShieldCheck },
              { to: '/notifications', label: 'Notifications', description: 'Reports and alerts', icon: Bell },
              { to: '/settings', label: 'Settings', description: 'Preferences and data', icon: Settings },
              { to: '/bank-accounts', label: 'Accounts', description: 'Balances and reconciliation', icon: Building2 },
            ].map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  navigate(item.to)
                }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-raised"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-text">{item.label}</span>
                  <span className="block truncate text-[10px] text-muted">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-center text-[10px] text-muted">
            MoneyTrack stores your ledger on your account. SMS review never posts without confirmation.
          </p>
        </div>
      </Modal>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  )
}
