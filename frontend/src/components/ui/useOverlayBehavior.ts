import { useEffect, useRef, type RefObject } from 'react'

const overlayStack: symbol[] = []
let bodyLockCount = 0
let originalBodyOverflow = ''

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface OverlayBehaviorOptions {
  open: boolean
  onClose: () => void
  panelRef: RefObject<HTMLElement | null>
}

/**
 * Shared dialog/drawer behaviour: body scroll lock, focus trap, Escape to
 * close, stacked overlays (only the topmost reacts), and focus restoration.
 * Android hardware back dispatches Escape on `document`, which reaches this
 * listener (see useAndroidBackButton).
 */
export function useOverlayBehavior({ open, onClose, panelRef }: OverlayBehaviorOptions) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const stackId = Symbol('overlay')
    overlayStack.push(stackId)
    if (bodyLockCount === 0) originalBodyOverflow = document.body.style.overflow
    bodyLockCount += 1
    document.body.style.overflow = 'hidden'
    const previousFocus = document.activeElement as HTMLElement | null

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]')
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(preferred ?? firstFocusable ?? panel).focus()
    }, 30)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== stackId) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
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
      const index = overlayStack.indexOf(stackId)
      if (index >= 0) overlayStack.splice(index, 1)
      bodyLockCount = Math.max(0, bodyLockCount - 1)
      if (bodyLockCount === 0) document.body.style.overflow = originalBodyOverflow
      previousFocus?.focus?.()
    }
  }, [open, panelRef])
}
