import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-line/80 bg-surface shadow-card', className)}
      {...props}
    />
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
