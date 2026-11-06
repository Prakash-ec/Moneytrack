import {
  ArrowRight,
  Bell,
  Calendar,
  Camera,
  LayoutDashboard,
  MessageSquareText,
  Moon,
  PieChart,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Tags,
  TrendingUp,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'

import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { api } from '@/services/api'
import type { Expense } from '@/types/api'
import { cn } from '@/utils/cn'
import { formatINR } from '@/utils/currency'
import { formatDate } from '@/utils/dates'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  category: 'Navigation' | 'Actions' | 'Transactions'
  action: () => void
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [matchingExpenses, setMatchingExpenses] = useState<Expense[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { openCreate, openScanReceipt, openEdit } = useExpenseDialog()
  const { setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Fetch matching expenses if query is >= 2 characters
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setMatchingExpenses([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.listExpenses({ q: query.trim(), page: 1, page_size: 4 })
        setMatchingExpenses(res.items)
      } catch {
        setMatchingExpenses([])
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [open, query])

  const staticCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'action-add',
        title: 'Add new expense',
        subtitle: 'Record an outflow manually',
        icon: Plus,
        category: 'Actions',
        action: () => {
          onClose()
          openCreate()
        },
      },
      {
        id: 'action-scan',
        title: 'Scan receipt',
        subtitle: 'Auto-extract bill with camera or upload',
        icon: Camera,
        category: 'Actions',
        action: () => {
          onClose()
          openScanReceipt()
        },
      },
      {
        id: 'action-theme',
        title: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        subtitle: `Currently in ${resolvedTheme} mode`,
        icon: resolvedTheme === 'dark' ? Sun : Moon,
        category: 'Actions',
        action: () => {
          onClose()
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
        },
      },
      {
        id: 'nav-overview',
        title: 'Overview',
        subtitle: 'Dashboard, stats, daily chart',
        icon: LayoutDashboard,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/')
        },
      },
      {
        id: 'nav-expenses',
        title: 'Expenses ledger',
        subtitle: 'Search, filter and manage transactions',
        icon: Receipt,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/expenses')
        },
      },
      {
        id: 'nav-breakdown',
        title: 'Spending breakdown',
        subtitle: 'Category donut & distribution',
        icon: PieChart,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/breakdown')
        },
      },
      {
        id: 'nav-types',
        title: 'Expense types',
        subtitle: 'Manage categories and custom colors',
        icon: Tags,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/expense-types')
        },
      },
      {
        id: 'nav-trends',
        title: 'Spending trends',
        subtitle: 'Historical velocity & automated insights',
        icon: TrendingUp,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/trends')
        },
      },
      {
        id: 'nav-sms',
        title: 'SMS Review & Authorisation',
        subtitle: 'Approve bank messages into expenses',
        icon: MessageSquareText,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/sms-review')
        },
      },
      {
        id: 'nav-security',
        title: 'Payment Security Centre',
        subtitle: 'Detect suspicious debits & bank fraud guidance',
        icon: ShieldCheck,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/security')
        },
      },
      {
        id: 'nav-weekly-report',
        title: 'Weekly Spending Report',
        subtitle: 'Monday-Sunday digest with cashflow & savings rate',
        icon: Calendar,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/weekly-report')
        },
      },
      {
        id: 'nav-notifications',
        title: 'Notification Centre',
        subtitle: 'History of financial alerts & preferences',
        icon: Bell,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/notifications')
        },
      },
      {
        id: 'nav-settings',
        title: 'Settings',
        subtitle: 'API connectivity, themes, backup & restore',
        icon: Settings,
        category: 'Navigation',
        action: () => {
          onClose()
          navigate('/settings')
        },
      },
    ],
    [navigate, onClose, openCreate, openScanReceipt, resolvedTheme, setTheme],
  )

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list: CommandItem[] = staticCommands

    if (q) {
      list = staticCommands.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
          c.category.toLowerCase().includes(q),
      )
    }

    if (matchingExpenses.length > 0) {
      const expenseItems: CommandItem[] = matchingExpenses.map((exp) => {
        const details = [
          exp.merchant,
          formatDate(exp.expense_date),
          formatINR(exp.amount_paise),
          exp.note ? `Note: "${exp.note}"` : null,
        ]
          .filter(Boolean)
          .join(' · ')

        return {
          id: `exp-${exp.id}`,
          title: exp.expense_type?.name || 'Expense',
          subtitle: details,
          icon: Receipt,
          category: 'Transactions',
          action: () => {
            onClose()
            openEdit(exp)
          },
        }
      })
      return [...list, ...expenseItems]
    }

    return list
  }, [matchingExpenses, openEdit, onClose, query, staticCommands])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands.length])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[var(--surface)] border border-[var(--border-strong)] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)] bg-[var(--surface)]">
          <Search className="h-5 w-5 text-[var(--muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search pages, or find transactions…"
            className="flex-1 bg-transparent border-none text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none focus:ring-0"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--primary-soft)]"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--muted)]">
              No matching commands or transactions found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors',
                    isSelected
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--text)] hover:bg-[var(--primary-soft)]',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0 transition-colors',
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--primary-soft)] text-[var(--primary)]',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold truncate text-[var(--text)]">{item.title}</div>
                      {item.subtitle && (
                        <div
                          className={cn(
                            'text-xs truncate mt-0.5',
                            isSelected ? 'text-white/85' : 'text-[var(--muted)]',
                          )}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={cn(
                        'text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded',
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--border)] text-[var(--muted)]',
                      )}
                    >
                      {item.category}
                    </span>
                    <ArrowRight className={cn('h-3.5 w-3.5', isSelected ? 'text-white' : 'opacity-0')} />
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-raised)] text-xs text-[var(--muted)]">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[10px] font-mono">↑↓</kbd> to navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[10px] font-mono">↵</kbd> to select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[10px] font-mono">esc</kbd> to close
            </span>
          </div>
          <div className="flex items-center gap-1 font-semibold text-[var(--primary)]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>MoneyTrack Quick Command</span>
          </div>
        </div>
      </div>
    </div>
  )
}
