import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

/**
 * Shared page container. Keeps horizontal rhythm identical across every route.
 * Use `narrow` for single-column reading pages (security, settings sub-pages).
 */
export function AppPage({
  children,
  className,
  narrow = false,
}: {
  children: ReactNode
  className?: string
  narrow?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-5 sm:px-6 sm:py-7 lg:px-8',
        narrow ? 'max-w-[920px]' : 'max-w-[1440px]',
        className,
      )}
    >
      {children}
    </div>
  )
}
