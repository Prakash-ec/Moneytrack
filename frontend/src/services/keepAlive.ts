/**
 * MoneyTrack Client Connection Helper
 *
 * Periodic background keep-alive pings are intentionally disabled so serverless
 * databases (such as Neon Free Tier) can auto-suspend when the user is idle.
 */

import { api } from './api'

let isPinging = false

export async function pingBackend(): Promise<boolean> {
  if (isPinging) return false
  isPinging = true
  try {
    const res = await api.health()
    return res.status === 'ok'
  } catch {
    return false
  } finally {
    isPinging = false
  }
}

export function startKeepAliveService(): () => void {
  // Intentionally disabled: background /health polling prevents serverless DB
  // scale-to-zero and wastes compute quota during idle tabs.
  return () => {}
}
