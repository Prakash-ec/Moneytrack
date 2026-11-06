/**
 * MoneyTrack Client Keep-Alive and Connection Management Service
 *
 * Keeps Render free-tier backend awake and connection hot:
 * 1. Warmup ping on app load.
 * 2. Regular heartbeat ping every 10 minutes while the app is open.
 * 3. Immediate ping on tab visibility change (when user returns to the tab).
 * 4. Immediate ping when network comes back online.
 */

import { api } from './api'

let heartbeatTimer: any = null
let lastPingTime = 0
let isPinging = false

export async function pingBackend(): Promise<boolean> {
  if (isPinging) return false
  isPinging = true
  try {
    const res = await api.health()
    lastPingTime = Date.now()
    return res.status === 'ok'
  } catch {
    return false
  } finally {
    isPinging = false
  }
}

export function startKeepAliveService(): () => void {
  if (typeof window === 'undefined') return () => {}

  // 1. Warmup ping on startup
  void pingBackend()

  // 2. Periodic heartbeat every 10 minutes (600,000 ms)
  // Render Free tier sleeps after 15 min; 10 min keeps it consistently warm
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    void pingBackend()
  }, 10 * 60 * 1000)

  // 3. Tab visibility change handler
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const elapsedMs = Date.now() - lastPingTime
      // If more than 3 minutes have passed since last active ping, warm up the connection immediately
      if (elapsedMs > 3 * 60 * 1000) {
        void pingBackend()
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 4. Online event handler
  const handleOnline = () => {
    void pingBackend()
  }
  window.addEventListener('online', handleOnline)

  return () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', handleOnline)
  }
}
