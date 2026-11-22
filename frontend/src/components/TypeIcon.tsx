import {
  Baby,
  BookOpen,
  Bus,
  Car,
  CircleDollarSign,
  Clapperboard,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  Plane,
  ReceiptText,
  Repeat,
  Scissors,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  TrainFront,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/utils/cn'

export const ICON_OPTIONS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'wallet', label: 'Wallet', icon: Wallet },
  { value: 'smartphone', label: 'Phone', icon: Smartphone },
  { value: 'utensils', label: 'Food', icon: Utensils },
  { value: 'coffee', label: 'Tea & snacks', icon: Coffee },
  { value: 'bus', label: 'Bus', icon: Bus },
  { value: 'car', label: 'Car', icon: Car },
  { value: 'train', label: 'Train', icon: TrainFront },
  { value: 'fuel', label: 'Fuel', icon: Fuel },
  { value: 'shopping-bag', label: 'Shopping', icon: ShoppingBag },
  { value: 'graduation-cap', label: 'Education', icon: GraduationCap },
  { value: 'book-open', label: 'Books', icon: BookOpen },
  { value: 'clapperboard', label: 'Movies', icon: Clapperboard },
  { value: 'repeat', label: 'Subscription', icon: Repeat },
  { value: 'heart-pulse', label: 'Health', icon: HeartPulse },
  { value: 'stethoscope', label: 'Medical', icon: Stethoscope },
  { value: 'home', label: 'Home', icon: Home },
  { value: 'zap', label: 'Electricity', icon: Zap },
  { value: 'droplets', label: 'Water', icon: Droplets },
  { value: 'wifi', label: 'Internet', icon: Wifi },
  { value: 'shirt', label: 'Clothing', icon: Shirt },
  { value: 'gift', label: 'Gifts', icon: Gift },
  { value: 'plane', label: 'Travel', icon: Plane },
  { value: 'receipt', label: 'Bills', icon: ReceiptText },
  { value: 'credit-card', label: 'Card', icon: CreditCard },
  { value: 'landmark', label: 'Bank', icon: Landmark },
  { value: 'scissors', label: 'Personal care', icon: Scissors },
  { value: 'wrench', label: 'Repairs', icon: Wrench },
  { value: 'music', label: 'Music', icon: Music },
  { value: 'film', label: 'Film', icon: Film },
  { value: 'gamepad', label: 'Games', icon: Gamepad2 },
  { value: 'dumbbell', label: 'Fitness', icon: Dumbbell },
  { value: 'paw-print', label: 'Pets', icon: PawPrint },
  { value: 'baby', label: 'Family', icon: Baby },
  { value: 'dollar-sign', label: 'Money', icon: CircleDollarSign },
  { value: 'sparkles', label: 'Other', icon: Sparkles },
  { value: 'tag', label: 'Tag', icon: Tag },
]

const ICONS: Record<string, LucideIcon> = Object.fromEntries(
  ICON_OPTIONS.map((option) => [option.value, option.icon]),
)

const sizes = {
  xs: { wrapper: 'h-7 w-7 rounded-lg', icon: 'h-3.5 w-3.5' },
  sm: { wrapper: 'h-8 w-8 rounded-xl', icon: 'h-4 w-4' },
  md: { wrapper: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5' },
  lg: { wrapper: 'h-12 w-12 rounded-xl', icon: 'h-5 w-5' },
}

export function TypeIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string
  color: string
  size?: keyof typeof sizes
  className?: string
}) {
  const Icon = ICONS[icon] ?? Wallet
  const classes = sizes[size]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 aspect-square items-center justify-center border',
        classes.wrapper,
        className,
      )}
      style={{
        backgroundColor: `${color}17`,
        borderColor: `${color}2A`,
        color,
      }}
      aria-hidden
    >
      <Icon className={classes.icon} strokeWidth={1.9} />
    </span>
  )
}
