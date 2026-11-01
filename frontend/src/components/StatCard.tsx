import type { LucideIcon } from 'lucide-react'
import { isValidElement, type ComponentType, type ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  detail?: ReactNode
  icon?: LucideIcon | ComponentType<{ className?: string }> | ReactNode
  tone?: 'default' | 'primary' | 'warning'
  className?: string
}

export function StatCard({
  label,
  value,
  hint,
  detail,
  icon: Icon,
  className,
}: StatCardProps) {
  const effectiveDetail = detail ?? hint

  const renderIcon = () => {
    if (!Icon) return null
    if (isValidElement(Icon)) {
      return Icon
    }
    if (
      typeof Icon === 'function' ||
      (typeof Icon === 'object' && Icon !== null && ('render' in Icon || '$$typeof' in Icon))
    ) {
      const LucideComp = Icon as ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
      return <LucideComp className="h-4 w-4" aria-hidden="true" />
    }
    return null
  }

  return (
    <article className={cn('stat-card', className)}>
      <div className="stat-label">
        <span>{label}</span>
        {Icon ? <span className="stat-icon">{renderIcon()}</span> : null}
      </div>
      <strong className="stat-value">{value}</strong>
      {effectiveDetail ? <div className="stat-detail">{effectiveDetail}</div> : null}
    </article>
  )
}
