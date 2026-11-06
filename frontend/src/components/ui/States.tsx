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
    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-amber-300 border border-amber-500/30 shadow-lg">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
      <span>Offline mode</span>
    </div>
  )
}

export function SlowNetworkBanner() {
  return null
}

export function BackendWakingBanner() {
  const [waking, setWaking] = React.useState(false)
  const [recovered, setRecovered] = React.useState(false)

  React.useEffect(() => {
    let timer: any
    const handleWaking = (e: Event) => {
      const customEvent = e as CustomEvent<{ waking?: boolean; recovered?: boolean; attempt?: number }>
      const detail = customEvent.detail || {}
      if (detail.waking) {
        setWaking(true)
        setRecovered(false)
      } else if (detail.recovered) {
        setWaking(false)
        setRecovered(true)
        clearTimeout(timer)
        timer = setTimeout(() => setRecovered(false), 2000)
      } else {
        setWaking(false)
      }
    }

    window.addEventListener('moneytrack:backend-waking', handleWaking)
    return () => {
      window.removeEventListener('moneytrack:backend-waking', handleWaking)
      clearTimeout(timer)
    }
  }, [])

  if (recovered) {
    return (
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-emerald-300 border border-emerald-500/30 shadow-lg transition-all animate-fade-in">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>Connected</span>
      </div>
    )
  }

  if (!waking) return null

  return (
    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-md px-3.5 py-1.5 text-xs font-medium text-amber-300 border border-amber-500/30 shadow-lg animate-pulse">
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
      <span>Connecting to server...</span>
    </div>
  )
}
