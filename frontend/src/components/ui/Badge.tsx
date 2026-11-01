import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export type BadgeTone = 'neutral' | 'primary' | 'positive' | 'warning' | 'danger' | 'archive'

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  const effectiveTone = tone === 'archive' ? 'neutral' : tone

  return (
    <span className={cn('badge', `badge-${effectiveTone}`, className)}>
      {children}
    </span>
  )
}
