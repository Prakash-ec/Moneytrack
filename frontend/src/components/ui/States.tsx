import * as React from 'react'
import type { ReactNode } from 'react'
import { RefreshCw, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-line/50', className)} aria-hidden />
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-[1.25rem] border border-line bg-surface p-6 shadow-soft', className)}>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="mt-4 h-9 w-2/3" />
      <Skeleton className="mt-3 h-6 w-1/2" />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center sm:py-20',
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-[1rem] border border-primary/20 bg-primary-soft text-primary">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-7 text-muted">{description}</p>
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[1.25rem] border border-danger/25 bg-danger-soft/60 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger">
        <RefreshCw className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-7 text-muted">
        {description ?? 'The request could not be completed. Check the backend and try again.'}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="md" className="mt-7" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-3/4 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-[1.25rem]" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <Skeleton className="h-80 w-full rounded-[1.25rem]" />
    </div>
  )
}

export function RowSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line/60 rounded-[1.25rem] border border-line bg-surface overflow-hidden', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-3 w-12 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 'h-72', className }: { height?: string; className?: string }) {
  return (
    <div className={cn('rounded-[1.25rem] border border-line bg-surface p-6 shadow-soft', className)}>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className={cn('flex items-end justify-between gap-3 pt-6', height)}>
        <Skeleton className="h-[40%] flex-1 rounded-t-md" />
        <Skeleton className="h-[65%] flex-1 rounded-t-md" />
        <Skeleton className="h-[30%] flex-1 rounded-t-md" />
        <Skeleton className="h-[85%] flex-1 rounded-t-md" />
        <Skeleton className="h-[55%] flex-1 rounded-t-md" />
        <Skeleton className="h-[70%] flex-1 rounded-t-md" />
        <Skeleton className="h-[90%] flex-1 rounded-t-md" />
      </div>
    </div>
  )
}

export function ProgressIndicator({
  status,
  completed,
  total,
  className,
}: {
  status: string
  completed?: number
  total?: number
  className?: string
}) {
  const isMeasurable = completed !== undefined && total !== undefined && total > 0
  const percentage = isMeasurable ? Math.min(100, Math.round((completed / total) * 100)) : null

  return (
    <div className={cn('rounded-[1.25rem] border border-line bg-surface p-5 space-y-3', className)}>
      <div className="flex items-center justify-between text-xs font-semibold text-ink">
        <span>{status}</span>
        {isMeasurable ? (
          <span className="text-primary font-mono">{completed} / {total} ({percentage}%)</span>
        ) : (
          <span className="text-muted animate-pulse">Processing...</span>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-line/60">
        {isMeasurable ? (
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300 rounded-full"
            style={{ width: `${percentage}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-primary animate-[indeterminate_1.5s_infinite_linear] rounded-full" />
        )}
      </div>
    </div>
  )
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine)

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-amber-500/95 px-4 py-2.5 text-xs font-medium text-slate-950 backdrop-blur-md shadow-md">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-slate-950 animate-ping" />
        <span>Working Offline: Transactions will queue and sync when connection restores.</span>
      </div>
    </div>
  )
}

export function SlowNetworkBanner() {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    let timer: any
    const handleSlow = () => {
      setShow(true)
      clearTimeout(timer)
      timer = setTimeout(() => setShow(false), 6000)
    }
    window.addEventListener('moneytrack:slow-network', handleSlow)
    return () => {
      window.removeEventListener('moneytrack:slow-network', handleSlow)
      clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-sky-600/95 px-4 py-2 text-xs font-medium text-white backdrop-blur-md shadow-md transition-all">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-sky-200 animate-pulse" />
        <span>Slow network detected. MoneyTrack is retrying with timeout safeguards.</span>
      </div>
      <button
        onClick={() => setShow(false)}
        className="text-white/80 hover:text-white px-2 py-0.5 text-xs font-bold"
      >
        Dismiss
      </button>
    </div>
  )
}
