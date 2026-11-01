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
    <header className={cn('page-header', className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {effectiveAction ? <div className="page-actions">{effectiveAction}</div> : null}
    </header>
  )
}
