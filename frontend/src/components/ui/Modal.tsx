import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/utils/cn'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-[570px]',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-[640px]',
}

const modalStack: symbol[] = []
let bodyLockCount = 0
let originalBodyOverflow = ''

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  closeOnBackdrop?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const stackId = Symbol('modal')
    modalStack.push(stackId)
    if (bodyLockCount === 0) originalBodyOverflow = document.body.style.overflow
    bodyLockCount += 1
    document.body.style.overflow = 'hidden'
    const previousFocus = document.activeElement as HTMLElement | null

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]')
      const firstFocusable = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      ;(preferred ?? firstFocusable ?? panel).focus()
    }, 30)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== stackId) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      const index = modalStack.indexOf(stackId)
      if (index >= 0) modalStack.splice(index, 1)
      bodyLockCount = Math.max(0, bodyLockCount - 1)
      if (bodyLockCount === 0) document.body.style.overflow = originalBodyOverflow
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn('modal', sizeClasses[size])}
      >
        <div className="modal-header">
          <div className="min-w-0">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="button button-ghost button-icon h-8 w-8 text-muted hover:text-text"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>

        {footer ? (
          <div className="modal-actions">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
