import type { Category } from '@/types/api'

export const CATEGORY_OPTIONS: Category[] = [
  'Food',
  'Travel',
  'Utilities',
  'Education',
  'Shopping',
  'Health',
  'Entertainment',
  'Housing',
  'Other',
]

export const COLOR_OPTIONS = [
  '#0F766E',
  '#0D9488',
  '#1E3A8A',
  '#1D4ED8',
  '#2563EB',
  '#BE185D',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#10B981',
  '#475569',
  '#1F2937',
]

export interface TypeSuggestion {
  name: string
  category: Category
  icon: string
  color: string
}

export const TYPE_SUGGESTIONS: TypeSuggestion[] = [
  { name: 'Jio Recharge', category: 'Utilities', icon: 'smartphone', color: '#1D4ED8' },
  { name: 'Mobile Data', category: 'Utilities', icon: 'wifi', color: '#1E40AF' },
  { name: 'Food', category: 'Food', icon: 'utensils', color: '#EA580C' },
  { name: 'Tea and Snacks', category: 'Food', icon: 'coffee', color: '#CA8A04' },
  { name: 'Bus Travel', category: 'Travel', icon: 'bus', color: '#1D4ED8' },
  { name: 'Auto Fare', category: 'Travel', icon: 'car', color: '#2563EB' },
  { name: 'Shopping', category: 'Shopping', icon: 'shopping-bag', color: '#BE185D' },
  { name: 'College Expenses', category: 'Education', icon: 'graduation-cap', color: '#0D9488' },
  { name: 'Books', category: 'Education', icon: 'book-open', color: '#475569' },
  { name: 'Entertainment', category: 'Entertainment', icon: 'clapperboard', color: '#DC2626' },
  { name: 'Subscriptions', category: 'Entertainment', icon: 'repeat', color: '#1E3A8A' },
  { name: 'Health', category: 'Health', icon: 'heart-pulse', color: '#DC2626' },
]

export const PAYMENT_METHOD_OPTIONS = [
  'UPI',
  'Cash',
  'Debit Card',
  'Credit Card',
  'Bank Transfer',
  'Other',
] as const
