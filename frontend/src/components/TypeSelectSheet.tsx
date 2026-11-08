import {
  Check,
  ChevronDown,
  Layers,
  Plus,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

import { TypeIcon } from '@/components/TypeIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

export interface TypeOptionItem {
  id: number | string
  name: string
  category?: string | null
  icon?: string
  color?: string
  is_archived?: boolean
  transaction_count?: number
}

export interface TypeSelectSheetProps {
  id?: string
  label?: string
  value: number | string | '' | undefined
  onChange: (value: number | string, item?: TypeOptionItem) => void
  options: TypeOptionItem[]
  placeholder?: string
  disabled?: boolean
  error?: string
  hint?: string
  autoFocus?: boolean
  /** Quick suggestions rendered above/inside the picker for 1-tap selection */
  suggestions?: TypeOptionItem[]
  /** Callback to trigger quick create mode */
  onCreateNew?: () => void
  createButtonLabel?: string
  className?: string
  ariaLabel?: string
}

export function TypeSelectSheet({
  id: explicitId,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select expense type…',
  disabled = false,
  error,
  hint,
  suggestions = [],
  onCreateNew,
  createButtonLabel = 'Create new type',
  className,
  ariaLabel,
}: TypeSelectSheetProps) {
  const generatedId = useId()
  const componentId = explicitId || generatedId
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  // Current selected item
  const selectedItem = useMemo(() => {
    if (value === undefined || value === '') return null
    return options.find((opt) => String(opt.id) === String(value)) ?? null
  }, [options, value])

  // Filtered options based on search query (matches name or category)
  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => {
      const matchName = opt.name.toLowerCase().includes(q)
      const matchCategory = opt.category ? opt.category.toLowerCase().includes(q) : false
      return matchName || matchCategory
    })
  }, [options, search])

  // Group filtered options by Category
  const groupedOptions = useMemo(() => {
    const groups: Record<string, TypeOptionItem[]> = {}
    filteredOptions.forEach((opt) => {
      const cat = opt.category?.trim() || 'General / Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(opt)
    })
    return groups
  }, [filteredOptions])

  // Flat list for keyboard navigation
  const flatVisibleOptions = useMemo(() => {
    return Object.values(groupedOptions).flat()
  }, [groupedOptions])

  // Open drawer
  const handleOpen = useCallback(() => {
    if (disabled) return
    setSearch('')
    setFocusedIndex(-1)
    setIsOpen(true)
  }, [disabled])

  // Close drawer
  const handleClose = useCallback(() => {
    setIsOpen(false)
    setSearch('')
    setFocusedIndex(-1)
    // Return focus to trigger button
    triggerRef.current?.focus()
  }, [])

  // Select item
  const handleSelect = useCallback(
    (item: TypeOptionItem) => {
      onChange(item.id, item)
      handleClose()
    },
    [onChange, handleClose],
  )

  // Focus search input when sheet opens
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 40)

    // Lock body scroll while open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClose])

  // Keyboard navigation within the options list
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (flatVisibleOptions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = prev < flatVisibleOptions.length - 1 ? prev + 1 : 0
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : flatVisibleOptions.length - 1
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && focusedIndex < flatVisibleOptions.length) {
        handleSelect(flatVisibleOptions[focusedIndex])
      }
    }
  }

  const scrollItemIntoView = (index: number) => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll<HTMLButtonElement>('[data-type-item]')
    items[index]?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label
          htmlFor={componentId}
          className="block text-sm font-semibold text-ink"
        >
          {label}
        </label>
      ) : null}

      {/* Main Trigger Button */}
      <div className="relative">
        <button
          ref={triggerRef}
          id={componentId}
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={ariaLabel || label || 'Choose expense type'}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-2.5 text-left transition-colors outline-none',
            'min-h-[48px] sm:min-h-[44px]',
            error
              ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger/25'
              : 'border-line hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/25',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {selectedItem ? (
              <>
                <TypeIcon
                  icon={selectedItem.icon || 'tag'}
                  color={selectedItem.color || 'var(--primary)'}
                  size="sm"
                  className="shrink-0 aspect-square"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-base sm:text-sm font-semibold text-ink">
                      {selectedItem.name}
                    </span>
                    {selectedItem.is_archived ? (
                      <Badge tone="archive" className="text-[10px] px-1.5 py-0">
                        Archived
                      </Badge>
                    ) : null}
                  </div>
                  {selectedItem.category ? (
                    <span className="block truncate text-xs text-muted">
                      {selectedItem.category}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <span className="flex h-9 w-9 shrink-0 aspect-square items-center justify-center rounded-xl border border-line bg-elevated text-subtle">
                  <Tag className="h-4 w-4" aria-hidden />
                </span>
                <span className="truncate text-base sm:text-sm text-subtle">
                  {placeholder}
                </span>
              </>
            )}
          </div>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted transition-transform duration-200',
              isOpen && 'rotate-180 text-primary',
            )}
            aria-hidden
          />
        </button>
      </div>

      {/* Quick Suggestions Strip (Option 1 integrated) */}
      {suggestions.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <span className="text-[11px] font-medium text-subtle shrink-0 flex items-center gap-1 mr-1">
              <Sparkles className="h-3 w-3 text-primary" aria-hidden />
              Quick:
            </span>
            {suggestions.slice(0, 4).map((sug) => {
              const isSelected = String(sug.id) === String(value)
              return (
                <button
                  key={sug.id}
                  type="button"
                  onClick={() => onChange(sug.id, sug)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition',
                    isSelected
                      ? 'border-primary bg-primary-soft text-primary font-semibold shadow-xs'
                      : 'border-line bg-surface text-muted hover:border-primary/30 hover:text-ink active:scale-95',
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full aspect-square"
                    style={{ backgroundColor: sug.color || 'var(--primary)' }}
                  />
                  <span className="truncate max-w-[120px]">{sug.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}

      {/* Slide-Down / Bottom Sheet Modal */}
      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col justify-end sm:items-center sm:justify-center"
            role="dialog"
            aria-modal="true"
            data-sheet-open="true"
            aria-label={label || 'Select type'}
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-navy/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
              onClick={handleClose}
              aria-hidden="true"
            />

            {/* Sheet Panel */}
            <div
              className={cn(
                'relative z-10 flex w-full flex-col bg-surface border border-line shadow-2xl transition-all',
                // Mobile: Bottom sheet sliding up
                'rounded-t-[28px] max-h-[85vh] sm:rounded-2xl sm:max-h-[75vh] sm:max-w-md sm:border',
                'animate-in slide-in-from-bottom duration-250 ease-out',
                'pb-[max(16px,env(safe-area-inset-bottom))]',
              )}
              onKeyDown={handleKeyDown}
            >
              {/* Drag Indicator for Mobile */}
              <div className="pt-3 pb-1 sm:hidden flex justify-center">
                <span className="h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
              </div>

              {/* Sheet Header */}
              <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Layers className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      {label ? `Select ${label}` : 'Select Expense Type'}
                    </h3>
                    <p className="text-[11px] text-muted">
                      {options.length} categories available
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close picker"
                  className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-ink transition-colors"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              {/* Search Field (guaranteed 16px font-size to prevent mobile browser zoom) */}
              <div className="px-5 pt-3 pb-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setFocusedIndex(-1)
                    }}
                    placeholder="Search by name or category…"
                    aria-label="Search expense types"
                    className="w-full rounded-xl border border-line bg-elevated pl-9 pr-8 py-2 text-base sm:text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/25"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search text"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Options List */}
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-4 min-h-[160px] max-h-[50vh]"
                role="listbox"
                aria-label={label || 'Expense Types'}
              >
                {flatVisibleOptions.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <p className="text-sm font-medium text-ink">
                      No matching types found
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      No type matched “{search}”.
                    </p>
                    {onCreateNew ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          handleClose()
                          onCreateNew()
                        }}
                        className="mt-4 inline-flex items-center gap-1.5"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        <span>Create “{search.trim()}”</span>
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  Object.entries(groupedOptions).map(([category, items]) => (
                    <div key={category} className="space-y-1">
                      <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-subtle flex items-center justify-between">
                        <span>{category}</span>
                        <span className="text-[10px] font-normal">{items.length}</span>
                      </div>
                      <div className="space-y-1">
                        {items.map((item) => {
                          const isSelected = String(item.id) === String(value)
                          return (
                            <button
                              key={item.id}
                              data-type-item
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelect(item)}
                              className={cn(
                                'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                                isSelected
                                  ? 'bg-primary-soft/70 border border-primary/30 text-ink shadow-xs'
                                  : 'hover:bg-elevated border border-transparent text-ink/90 active:scale-[0.99]',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <TypeIcon
                                  icon={item.icon || 'tag'}
                                  color={item.color || 'var(--primary)'}
                                  size="sm"
                                  className="shrink-0 aspect-square"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={cn(
                                        'truncate text-base sm:text-sm',
                                        isSelected ? 'font-bold text-primary' : 'font-medium',
                                      )}
                                    >
                                      {item.name}
                                    </span>
                                    {item.is_archived ? (
                                      <Badge tone="archive" className="text-[9px] px-1 py-0">
                                        Archived
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {item.category ? (
                                    <span className="block truncate text-xs text-muted">
                                      {item.category}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {isSelected ? (
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                  <Check className="h-3.5 w-3.5" aria-hidden strokeWidth={2.5} />
                                </div>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Sheet Footer with inline Quick Create */}
              {onCreateNew && (
                <div className="px-4 py-3 border-t border-line bg-surface flex items-center justify-between">
                  <span className="text-xs text-muted">Missing a spending type?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      handleClose()
                      onCreateNew()
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary" aria-hidden />
                    <span>{createButtonLabel}</span>
                  </Button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
