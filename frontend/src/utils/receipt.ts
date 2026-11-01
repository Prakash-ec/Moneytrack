import type { ReceiptItem } from '@/types/api'
import { formatINR } from '@/utils/currency'

export const MAX_RECEIPT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])

export function validateReceiptFile(file: { size: number; type: string }): {
  valid: boolean
  error?: string
} {
  if (file.size > MAX_RECEIPT_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed receipt size is 10MB.`,
    }
  }
  if (file.type && !ALLOWED_RECEIPT_MIME_TYPES.has(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Please choose a JPEG, PNG, or WebP image.',
    }
  }
  return { valid: true }
}

export function getConfidenceBadge(score: number): {
  label: string
  tone: 'positive' | 'warning' | 'neutral'
} {
  if (score >= 0.8) {
    return { label: 'High confidence', tone: 'positive' }
  }
  if (score >= 0.5) {
    return { label: 'Review recommended', tone: 'warning' }
  }
  return { label: 'Low confidence', tone: 'neutral' }
}

export function formatLineItemsSummary(items: ReceiptItem[]): string {
  if (!items || items.length === 0) return ''
  return items
    .map((item) => {
      const parts = [item.name]
      if (item.quantity && item.quantity > 1) parts.push(`x${item.quantity}`)
      if (item.amount_paise) parts.push(`(${formatINR(item.amount_paise)})`)
      return parts.join(' ')
    })
    .join(', ')
}
