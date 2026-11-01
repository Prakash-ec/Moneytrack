import { Capacitor } from '@capacitor/core'
import { SmsPlugin } from '@/services/sms'

export type PermissionType = 'notifications' | 'sms' | 'camera'

export type PermissionStateResult = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface PermissionDetails {
  type: PermissionType
  title: string
  rationale: string
  whyNeeded: string
  recoveryGuide: string
  fallbackNote: string
}

export const PERMISSION_METADATA: Record<PermissionType, PermissionDetails> = {
  notifications: {
    type: 'notifications',
    title: 'Notification Access',
    rationale: 'Receive instant payment security alerts and your scheduled Monday weekly spending reports.',
    whyNeeded:
      'Without notifications, you will not receive real-time warnings if an unusual or unfamiliar debit occurs on your bank account.',
    recoveryGuide:
      'If permanently denied, open Android Settings > Apps > MoneyTrack > Permissions / Notifications and toggle Allow Notifications.',
    fallbackNote:
      'You can still view all alerts anytime in the in-app Notification Centre.',
  },
  sms: {
    type: 'sms',
    title: 'SMS Detection Access',
    rationale: 'Read bank transaction SMS in the background to automatically log expenses and detect suspicious debits.',
    whyNeeded:
      'MoneyTrack runs completely on your device and only scans bank transaction notifications to save you manual typing.',
    recoveryGuide:
      'Open Android Settings > Apps > MoneyTrack > Permissions > SMS and select "Allow".',
    fallbackNote:
      'You can always record transactions manually with 1-Tap Quick Log chips or the expense form.',
  },
  camera: {
    type: 'camera',
    title: 'Camera Access',
    rationale: 'Scan paper receipts and bills directly with your camera for automatic OCR extraction.',
    whyNeeded:
      'Camera access lets you snap receipts on the go instead of typing out line items.',
    recoveryGuide:
      'Enable Camera in Android Settings > Apps > MoneyTrack > Permissions > Camera, or in your browser site permissions.',
    fallbackNote:
      'You can upload a receipt photo from your gallery or paste the receipt text manually.',
  },
}

export async function checkAppPermission(type: PermissionType): Promise<PermissionStateResult> {
  if (type === 'notifications') {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await SmsPlugin.checkPermissions()
        return status.postNotifications === 'granted' ? 'granted' : 'denied'
      } catch {
        return 'prompt'
      }
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return 'granted'
      if (Notification.permission === 'denied') return 'denied'
      return 'prompt'
    }
    return 'unsupported'
  }

  if (type === 'sms') {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await SmsPlugin.checkPermissions()
        return status.receiveSms === 'granted' ? 'granted' : 'denied'
      } catch {
        return 'prompt'
      }
    }
    return 'unsupported'
  }

  if (type === 'camera') {
    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      try {
        const result = await navigator.permissions?.query?.({ name: 'camera' as any })
        if (result) {
          if (result.state === 'granted') return 'granted'
          if (result.state === 'denied') return 'denied'
          return 'prompt'
        }
      } catch {
        // query not supported, assume prompt
      }
      return 'prompt'
    }
    return 'unsupported'
  }

  return 'prompt'
}

export async function requestAppPermission(type: PermissionType): Promise<boolean> {
  if (type === 'notifications') {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await SmsPlugin.requestPermissions()
        return status.postNotifications === 'granted'
      } catch {
        return false
      }
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission()
      return result === 'granted'
    }
    return false
  }

  if (type === 'sms') {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await SmsPlugin.requestPermissions()
        return status.receiveSms === 'granted'
      } catch {
        return false
      }
    }
    return false
  }

  if (type === 'camera') {
    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        stream.getTracks().forEach((track) => track.stop())
        return true
      } catch {
        return false
      }
    }
    return false
  }

  return false
}
