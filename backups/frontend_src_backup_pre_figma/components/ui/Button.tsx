import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-contrast hover:bg-primary/90 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20',
  secondary:
    'border border-line bg-surface text-ink hover:bg-elevated/80 shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20',
  ghost: 'text-muted hover:bg-elevated/70 hover:text-ink',
  danger: 'bg-danger text-danger-contrast hover:bg-danger/90 shadow-sm focus-visible:ring-2 focus-visible:ring-danger/20',
  subtle: 'bg-primary-soft text-primary hover:bg-primary/10',
  outline: 'border border-line bg-transparent text-ink hover:bg-elevated/60',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9.5 px-3.5 text-sm rounded-xl',
  lg: 'h-11 px-5 text-sm font-semibold rounded-xl',
  icon: 'h-9.5 w-9.5 rounded-xl p-0',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
})
