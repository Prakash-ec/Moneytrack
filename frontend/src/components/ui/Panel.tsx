import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

/**
 * Quiet surface used for every grouped block of content.
 * Token-only: surface, hairline border, card radius, no glow.
 */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-border bg-surface', className)}
      {...props}
    />
  )
}

export interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function PanelHeader({ title, description, action, className }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center justify-between gap-4 border-b border-border px-5 py-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold leading-tight text-text">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-5 text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}
