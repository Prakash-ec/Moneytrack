import { RefreshCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

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
