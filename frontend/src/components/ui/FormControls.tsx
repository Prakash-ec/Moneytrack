import { ChevronDown } from 'lucide-react'
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { cn } from '@/utils/cn'

const controlBase =
  'w-full rounded-lg border border-input bg-surface text-base sm:text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          controlBase,
          'h-10 px-3',
          props['aria-invalid'] ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
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
        className={cn(
          controlBase,
          'min-h-20 resize-y px-3 py-2.5',
          props['aria-invalid'] ? 'border-danger focus:border-danger focus:ring-danger/20' : '',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            controlBase,
            'h-10 appearance-none pl-3 pr-9',
            props['aria-invalid']
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : '',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
      </div>
    )
  },
)

export interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  optional?: boolean
  required?: boolean
  children: ReactNode
  className?: string
}

/**
 * Field associates its label, hint and error with the wrapped control.
 * When `htmlFor` is omitted a stable id is generated and injected into the
 * child control, so a label is never orphaned. `aria-describedby` and
 * `aria-invalid` are wired automatically.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  required,
  children,
  className,
}: FieldProps) {
  const autoId = useId()
  const controlId = htmlFor ?? autoId
  const errorId = error ? `${controlId}-error` : undefined
  const hintId = !error && hint ? `${controlId}-hint` : undefined

  let control = children
  if (isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>
    const describedBy = [childProps['aria-describedby'], errorId, hintId]
      .filter(Boolean)
      .join(' ')

    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      id: childProps.id ?? controlId,
      'aria-describedby': describedBy || undefined,
      'aria-invalid': error ? true : childProps['aria-invalid'],
      'aria-required': required || childProps['aria-required'] || undefined,
    })
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={controlId} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {optional ? <span className="text-xs text-subtle">Optional</span> : null}
      </div>
      {control}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export const inputBase = controlBase
