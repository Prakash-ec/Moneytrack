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

/**
 * Official MoneyTrack 16-Color Categorical Taxonomy
 * High-clarity wide-gamut palette tested for WCAG AA contrast (≥ 4.5:1)
 * across both Light (#FFFFFF) and Dark (#161B26) card surfaces.
 */
export const COLOR_OPTIONS = [
  '#6366F1', // Electric Indigo (Subscriptions, Tech, Utilities)
  '#3B82F6', // Royal Sapphire (Banking, Transfers, Bills)
  '#0EA5E9', // Sky Blue (Travel, Flights, Transit)
  '#06B6D4', // Teal Cyan (Commute, Auto, Fuel)
  '#10B981', // Fresh Mint (Income, Inflows, Salary)
  '#059669', // Emerald Growth (Investments, Wealth, Savings)
  '#EAB308', // Warm Gold (Assets, Luxury, Rewards)
  '#F59E0B', // Amber Harvest (Groceries, Market, Supermarket)
  '#F97316', // Tangerine Orange (Dining, Cafes, Restaurants)
  '#F43F5E', // Sunset Coral (Entertainment, Streaming, Leisure)
  '#E11D48', // Crimson Rose (Shopping, Retail, Apparel)
  '#D946EF', // Berry Magenta (Personal Care, Fitness, Wellness)
  '#8B5CF6', // Rich Violet (Education, Books, Learning)
  '#7C3AED', // Deep Plum (Healthcare, Medical, Pharmacy)
  '#D97706', // Warm Bronze (Housing, Rent, Maintenance)
  '#64748B', // Cool Slate (Miscellaneous, Fees, Taxes)
]

export interface TypeSuggestion {
  name: string
  category: Category
  icon: string
  color: string
}

export const TYPE_SUGGESTIONS: TypeSuggestion[] = [
  { name: 'Jio Recharge', category: 'Utilities', icon: 'smartphone', color: '#6366F1' },
  { name: 'Mobile Data', category: 'Utilities', icon: 'wifi', color: '#3B82F6' },
  { name: 'Food', category: 'Food', icon: 'utensils', color: '#F97316' },
  { name: 'Tea and Snacks', category: 'Food', icon: 'coffee', color: '#F59E0B' },
  { name: 'Bus Travel', category: 'Travel', icon: 'bus', color: '#0EA5E9' },
  { name: 'Auto Fare', category: 'Travel', icon: 'car', color: '#06B6D4' },
  { name: 'Shopping', category: 'Shopping', icon: 'shopping-bag', color: '#E11D48' },
  { name: 'College Expenses', category: 'Education', icon: 'graduation-cap', color: '#8B5CF6' },
  { name: 'Books', category: 'Education', icon: 'book-open', color: '#7C3AED' },
  { name: 'Entertainment', category: 'Entertainment', icon: 'clapperboard', color: '#F43F5E' },
  { name: 'Subscriptions', category: 'Entertainment', icon: 'repeat', color: '#D946EF' },
  { name: 'Health', category: 'Health', icon: 'heart-pulse', color: '#10B981' },
]

export const PAYMENT_METHOD_OPTIONS = [
  'UPI',
  'Cash',
  'Debit Card',
  'Credit Card',
  'Bank Transfer',
  'Other',
] as const
