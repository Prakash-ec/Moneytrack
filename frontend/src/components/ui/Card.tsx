import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

export interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('card-header', className)}>
      <div className="min-w-0">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
