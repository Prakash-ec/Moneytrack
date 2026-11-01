export interface QuickExpenseChip {
  id: string
  label: string
  amount: string
  merchant?: string
  note?: string
  payment_method?: string
}

export const DEFAULT_QUICK_CHIPS: QuickExpenseChip[] = [
  { id: '1', label: '☕ Chai ₹40', amount: '40', merchant: 'Tea Stall', note: 'Chai / Coffee', payment_method: 'UPI' },
  { id: '2', label: '🍽️ Lunch ₹150', amount: '150', merchant: 'Restaurant', note: 'Lunch meal', payment_method: 'UPI' },
  { id: '3', label: '⛽ Fuel ₹300', amount: '300', merchant: 'Fuel Station', note: 'Petrol / Fuel', payment_method: 'UPI' },
  { id: '4', label: '🛒 Groceries ₹500', amount: '500', merchant: 'Supermarket', note: 'Groceries', payment_method: 'UPI' },
  { id: '5', label: '⚡ Quick ₹100', amount: '100', merchant: 'Daily expense', note: 'Outflow', payment_method: 'UPI' },
]

export const QUICK_CHIPS_STORAGE_KEY = 'moneytrack_quick_expense_chips'

export function getStoredQuickChips(): QuickExpenseChip[] {
  if (typeof localStorage === 'undefined') return DEFAULT_QUICK_CHIPS
  try {
    const raw = localStorage.getItem(QUICK_CHIPS_STORAGE_KEY)
    if (!raw) return DEFAULT_QUICK_CHIPS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
  } catch {
    // fallback
  }
  return DEFAULT_QUICK_CHIPS
}

export function saveStoredQuickChips(chips: QuickExpenseChip[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(QUICK_CHIPS_STORAGE_KEY, JSON.stringify(chips))
    window.dispatchEvent(new CustomEvent('moneytrack:quick-chips-changed', { detail: chips }))
  } catch {
    // ignore
  }
}
