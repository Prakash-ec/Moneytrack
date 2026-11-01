import { ChevronDown } from 'lucide-react'
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/utils/cn'

const controlBase =
  'w-full rounded-[1rem] border border-line bg-surface text-sm text-ink shadow-soft outline-none transition-all placeholder:text-subtle focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          controlBase,
          'h-12 px-3.5',
          props['aria-invalid'] ? 'border-danger/60 focus:border-danger focus:ring-danger/20' : '',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(controlBase, 'min-h-24 resize-y px-3.5 py-3', className)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            controlBase,
            'h-12 appearance-none pl-3.5 pr-10',
            props['aria-invalid']
              ? 'border-danger/70 focus:border-danger focus:ring-danger/10' : '',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
      </div>
    )
  },
)

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  optional?: boolean
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {optional ? <span className="text-xs text-subtle">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputBase = controlBase
