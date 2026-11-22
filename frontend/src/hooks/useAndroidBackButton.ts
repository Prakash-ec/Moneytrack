import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

type BackHandler = () => boolean

const backHandlers: BackHandler[] = []

/**
 * Register a handler that gets called when Android hardware back button is pressed.
 * Handlers are called in LIFO order (last registered = highest priority).
 * Return true if the event was handled and should not propagate further.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler)
  return () => {
    const idx = backHandlers.indexOf(handler)
    if (idx !== -1) backHandlers.splice(idx, 1)
  }
}

export function useAndroidBackButton() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Check custom registered handlers (e.g. active sheets/modals)
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        const handled = backHandlers[i]()
        if (handled) return
      }

      // 2. Check if any modal or bottom sheet is open in DOM by simulating Escape key
      const openDialog = document.querySelector('[role="dialog"], [data-sheet-open="true"]')
      if (openDialog) {
        const escapeEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        })
        window.dispatchEvent(escapeEvent)
        return
      }

      // 3. If not at root page, navigate back
      if (location.pathname !== '/' && (canGoBack || window.history.state?.idx > 0)) {
        navigate(-1)
        return
      }

      // 4. On root page, minimize or exit app
      CapApp.exitApp()
    })

    return () => {
      void listenerPromise.then((handle) => handle.remove()).catch(() => {})
    }
  }, [navigate, location])
}
