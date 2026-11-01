import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  // Map subtle/outline to secondary/ghost if needed
  const effectiveVariant = variant === 'subtle' ? 'secondary' : variant === 'outline' ? 'secondary' : variant

  const variantClass = `button-${effectiveVariant}`
  const sizeClass = size === 'sm' ? 'button-sm' : size === 'icon' ? 'button-icon' : size === 'lg' ? 'h-11 px-5 text-sm font-semibold' : ''

  return cn('button', variantClass, sizeClass, className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
