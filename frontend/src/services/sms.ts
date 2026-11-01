import { Capacitor, registerPlugin } from '@capacitor/core'

export interface PendingTransaction {
  id: string
  status: string
  reason: string
  createdAtMs: number
  amount: string | null
  merchant: string
  reference: string
  date: string
  category: string
  note: string
  sender: string
  error: string
  retryCount: number
  notified: boolean
}

export interface SmsSettings {
  smsAutomationEnabled: boolean
  backendUrl: string
  notificationsEnabled: boolean
}

export interface PermissionStatus {
  receiveSms: string
  readSms?: string
  postNotifications: string
  automationEnabled: boolean
  notificationsEnabled: boolean
  granted: boolean
}

interface SmsPluginWeb {
  checkPermissions(): Promise<PermissionStatus>
  requestPermissions(): Promise<PermissionStatus>
  setAutomationEnabled(options: { enabled: boolean }): Promise<void>
  setBackendUrl(options: { url: string }): Promise<void>
  getSettings(): Promise<SmsSettings>
  getPendingTransactions(): Promise<{ items: PendingTransaction[] }>
  confirmTransaction(options: { id: string }): Promise<void>
  rejectTransaction(options: { id: string }): Promise<void>
  dismissTransaction(options: { id: string }): Promise<void>
  clearPendingQueue(): Promise<{ cleared: boolean }>
  updateTransaction(options: {
    id: string
    amount?: string | null
    merchant?: string | null
    date?: string | null
    note?: string | null
    type?: string | null
  }): Promise<void>
  syncNow(): Promise<void>
  getLaunchUrl(): Promise<{ url: string | null }>
}

const SmsPlugin = registerPlugin<SmsPluginWeb>('SmsPlugin', {
  web: () =>
    Promise.resolve(
      new class SmsPluginWebImpl implements SmsPluginWeb {
        async checkPermissions(): Promise<PermissionStatus> {
          return {
            receiveSms: 'unsupported',
            readSms: 'unsupported',
            postNotifications: 'unsupported',
            automationEnabled: false,
            notificationsEnabled: true,
            granted: false,
          }
        }
        async requestPermissions(): Promise<PermissionStatus> {
          return {
            receiveSms: 'unsupported',
            readSms: 'unsupported',
            postNotifications: 'unsupported',
            automationEnabled: false,
            notificationsEnabled: true,
            granted: false,
          }
        }
        async setAutomationEnabled(): Promise<void> {
          return
        }
        async setBackendUrl(): Promise<void> {
          return
        }
        async getSettings(): Promise<SmsSettings> {
          return { smsAutomationEnabled: false, backendUrl: '', notificationsEnabled: true }
        }
        async getPendingTransactions(): Promise<{ items: PendingTransaction[] }> {
          return { items: [] }
        }
        async confirmTransaction(): Promise<void> {
          return
        }
        async rejectTransaction(): Promise<void> {
          return
        }
        async dismissTransaction(): Promise<void> {
          return
        }
        async clearPendingQueue(): Promise<{ cleared: boolean }> {
          return { cleared: true }
        }
        async updateTransaction(): Promise<void> {
          return
        }
        async syncNow(): Promise<void> {
          return
        }
        async getLaunchUrl(): Promise<{ url: string | null }> {
          return { url: null }
        }
      }(),
    ),
})

export const getSmsLaunchUrl = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const res = await SmsPlugin.getLaunchUrl()
    return res.url || null
  } catch {
    return null
  }
}

export const addSmsReviewListener = (callback: (url: string) => void): (() => void) => {
  if (!Capacitor.isNativePlatform()) return () => {}
  try {
    const handle = (SmsPlugin as unknown as {
      addListener: (
        event: string,
        cb: (data: { url: string }) => void,
      ) => Promise<{ remove: () => Promise<void> }>
    }).addListener('smsReviewRequested', (data: { url: string }) => {
      if (data?.url) callback(data.url)
    })
    return () => {
      void handle.then((h) => h.remove()).catch(() => {})
    }
  } catch {
    return () => {}
  }
}

export { SmsPlugin }
