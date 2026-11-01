import {
  Camera,
  LayoutDashboard,
  MessageSquareText,
  PieChart,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  Tags,
  TrendingUp,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { flushOfflineQueue, getOfflineQueue } from '@/services/offlineQueue'
import { cn } from '@/utils/cn'

const SIDEBAR_NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Ledger', icon: ReceiptText, end: false },
  { to: '/expense-types', label: 'Types', icon: Tags, end: false },
  { to: '/breakdown', label: 'Breakdown', icon: PieChart, end: false },
  { to: '/trends', label: 'Trends', icon: TrendingUp, end: false },
  { to: '/sms-review', label: 'SMS review', icon: MessageSquareText, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

const BOTTOM_NAV_ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Ledger', icon: ReceiptText, end: false },
  { to: '/expense-types', label: 'Types', icon: Tags, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5" aria-label="MoneyTrack home">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-2xl font-display text-lg font-semibold',
          inverted
            ? 'bg-primary-contrast/12 text-primary-contrast'
            : 'bg-primary text-primary-contrast shadow-soft',
        )}
      >
        ₹
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block font-display text-[1.05rem] font-semibold leading-none tracking-tight',
            inverted ? 'text-primary-contrast' : 'text-ink',
          )}
        >
          MoneyTrack
        </span>
        <span
          className={cn(
            'mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em]',
            inverted ? 'text-primary-contrast/55' : 'text-subtle',
          )}
        >
          Private ledger
        </span>
      </span>
    </NavLink>
  )
}

function Sidebar() {
  const { openCreate, openScanReceipt } = useExpenseDialog()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] flex-col bg-navy text-primary-contrast lg:flex">
      <div className="flex h-[4.75rem] items-center px-5">
        <Brand inverted />
      </div>

      <div className="space-y-2 px-4">
        <button
          type="button"
          onClick={() => openCreate()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-contrast shadow-soft transition hover:brightness-[1.08]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add expense
        </button>
        <button
          type="button"
          onClick={() => openScanReceipt()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-xs font-semibold text-primary-contrast/90 transition hover:bg-white/10"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
          Scan receipt
        </button>
      </div>

      <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Primary">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-contrast/40">
          Navigate
        </p>
        {SIDEBAR_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-primary-contrast/12 text-primary-contrast'
                  : 'text-primary-contrast/65 hover:bg-white/5 hover:text-primary-contrast',
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-positive" />
          <p className="text-xs font-semibold text-primary-contrast">Kept on this machine</p>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-primary-contrast/60">
          Records stay in a local SQLite database. No analytics or third-party tracking.
        </p>
      </div>
    </aside>
  )
}

function MobileHeader() {
  const { openScanReceipt } = useExpenseDialog()
  return (
    <header className="safe-top sticky top-0 z-30 flex h-[3.75rem] items-center justify-between border-b border-line/80 bg-canvas/88 px-4 backdrop-blur-md sm:px-6 lg:hidden">
      <Brand />
      <button
        type="button"
        onClick={() => openScanReceipt()}
        className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 text-xs font-semibold text-ink shadow-soft"
        aria-label="Scan receipt"
      >
        <Camera className="h-4 w-4 text-primary" aria-hidden />
        Scan
      </button>
    </header>
  )
}

function BottomNav() {
  const { openCreate } = useExpenseDialog()
  const left = BOTTOM_NAV_ITEMS.slice(0, 2)
  const right = BOTTOM_NAV_ITEMS.slice(2)

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/95 backdrop-blur-md lg:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 items-end">
        {left.map((item) => (
          <MobileNavLink key={item.to} {...item} />
        ))}
        <div className="flex min-h-[4rem] items-center justify-center">
          <button
            type="button"
            onClick={() => openCreate()}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-contrast shadow-lift transition active:scale-95"
            aria-label="Add expense"
          >
            <Plus className="h-6 w-6" aria-hidden />
          </button>
        </div>
        {right.map((item) => (
          <MobileNavLink key={item.to} {...item} />
        ))}
      </div>
    </nav>
  )
}

function MobileNavLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-[4rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold transition',
          isActive ? 'text-primary' : 'text-subtle hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-10 items-center justify-center rounded-xl transition',
              isActive ? 'bg-primary-soft' : '',
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function AppLayout() {
  const online = useOnlineStatus()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [offlineCount, setOfflineCount] = useState(() => getOfflineQueue().length)
  const [syncingOffline, setSyncingOffline] = useState(false)

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
          description: `Successfully synced ${res.synced} offline transaction${res.synced === 1 ? '' : 's'}.`,
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
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-primary px-3 py-2 text-primary-contrast focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-[16.5rem]">
        <MobileHeader />
        {!online ? (
          <div className="flex items-center justify-center gap-2 border-b border-warning/25 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            You are offline. Any new expenses will be saved locally and synced once reconnected.
          </div>
        ) : null}
        {offlineCount > 0 ? (
          <div className="flex items-center justify-between border-b border-primary/20 bg-primary-soft px-4 py-2 text-xs text-primary sm:px-6">
            <span className="flex items-center gap-2 font-medium">
              <RefreshCw className={`h-3.5 w-3.5 ${syncingOffline ? 'animate-spin' : ''}`} aria-hidden />
              {offlineCount} expense{offlineCount === 1 ? '' : 's'} stored offline awaiting sync
            </span>
            <button
              type="button"
              disabled={syncingOffline || !online}
              onClick={handleSyncOffline}
              className="rounded-xl bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-contrast shadow-soft transition hover:brightness-105 disabled:opacity-50"
            >
              {syncingOffline ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        ) : null}
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
