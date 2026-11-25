import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface PageHeaderProps {
  title: string
  description?: ReactNode
  eyebrow?: string
  actions?: ReactNode
  action?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  action,
  className,
}: PageHeaderProps) {
  const effectiveAction = actions ?? action

  return (
    <header
      className={cn(
        'mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-medium leading-none text-muted">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[26px]">
          {title}
        </h1>
        {description ? (
          <div className="mt-1 text-[13px] leading-5 text-muted">{description}</div>
        ) : null}
      </div>
      {effectiveAction ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{effectiveAction}</div>
      ) : null}
    </header>
  )
}
