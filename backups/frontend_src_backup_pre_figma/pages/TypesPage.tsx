import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tags,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/FormControls'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { PageHeader } from '@/components/PageHeader'
import { TypeFormDialog } from '@/components/TypeFormDialog'
import { TypeIcon } from '@/components/TypeIcon'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { ArchivedFilter, ExpenseType } from '@/types/api'
import { formatINR } from '@/utils/currency'
import { TYPE_SUGGESTIONS, type TypeSuggestion } from '@/utils/typeOptions'
import { cn } from '@/utils/cn'

const TABS: Array<{ value: ArchivedFilter; label: string }> = [
  { value: 'exclude', label: 'Active' },
  { value: 'only', label: 'Archived' },
  { value: 'include', label: 'All' },
]

interface TypeDialogState {
  open: boolean
  expenseType: ExpenseType | null
  suggestion: TypeSuggestion | null
}

const CLOSED_DIALOG: TypeDialogState = { open: false, expenseType: null, suggestion: null }

export function TypesPage() {
  useDocumentTitle('Expense types')
  const [searchParams, setSearchParams] = useSearchParams()
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const debouncedSearch = useDebouncedValue(searchInput, 300)
  const rawArchived = searchParams.get('archived')
  const archived: ArchivedFilter =
    rawArchived === 'only' || rawArchived === 'include' ? rawArchived : 'exclude'
  const [dialog, setDialog] = useState<TypeDialogState>(CLOSED_DIALOG)
  const [archiveTarget, setArchiveTarget] = useState<{
    expenseType: ExpenseType
    action: 'archive' | 'unarchive'
  } | null>(null)
  const [archiving, setArchiving] = useState(false)

  const typesQuery = useApiQuery(
    ['expense-types', 'catalog', archived, debouncedSearch],
    () =>
      api.listExpenseTypes({
        archived,
        search: debouncedSearch || undefined,
        page_size: 200,
      }),
  )

  const setArchivedFilter = (value: ArchivedFilter) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'exclude') next.delete('archived')
    else next.set('archived', value)
    setSearchParams(next, { replace: true })
  }

  const clearSearch = () => {
    setSearchInput('')
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const openCreate = (suggestion?: TypeSuggestion) =>
    setDialog({ open: true, expenseType: null, suggestion: suggestion ?? null })

  const openEdit = (expenseType: ExpenseType) =>
    setDialog({ open: true, expenseType, suggestion: null })

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      if (archiveTarget.action === 'archive') {
        await api.archiveExpenseType(archiveTarget.expenseType.id)
        showToast({
          title: 'Expense type archived',
          description: 'Existing expenses are unchanged. It is hidden from new expense forms.',
        })
      } else {
        await api.unarchiveExpenseType(archiveTarget.expenseType.id)
        showToast({
          title: 'Expense type restored',
          description: 'It can be selected again when adding expenses.',
        })
      }
      invalidate()
      setArchiveTarget(null)
    } catch (error) {
      showToast({
        title: 'Could not update expense type',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setArchiving(false)
    }
  }

  const items = typesQuery.data?.items ?? []
  const hasSearch = Boolean(debouncedSearch)
  const showSuggestions =
    !hasSearch && archived === 'exclude' && items.length === 0 && !typesQuery.loading

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Expense types"
        description="Reusable labels that keep your spending organised and comparable."
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" aria-hidden />
            New type
          </Button>
        }
      />

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex w-full rounded-xl border border-line bg-elevated p-1 sm:w-auto"
            role="group"
            aria-label="Filter expense types"
          >
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setArchivedFilter(tab.value)}
                aria-pressed={archived === tab.value}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none',
                  archived === tab.value
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search types…"
              className="pl-10 pr-9"
              aria-label="Search expense types"
              type="search"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear type search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </Card>

      {showSuggestions ? (
        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-line bg-elevated/40 px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">Start with a suggestion</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Pick a common type to prefill the form, or create your own from scratch.
              </p>
            </div>
            <Button size="sm" variant="secondary" className="ml-auto hidden sm:inline-flex" onClick={() => openCreate()}>
              Custom type
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
            {TYPE_SUGGESTIONS.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                onClick={() => openCreate(suggestion)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition hover:border-primary/30 hover:bg-elevated"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: suggestion.color }}
                  aria-hidden
                />
                {suggestion.name}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {typesQuery.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
              <div className="mt-5 flex justify-between border-t border-line pt-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : typesQuery.error ? (
        <ErrorState
          title="Could not load expense types"
          description={typesQuery.error.message}
          onRetry={typesQuery.refetch}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tags}
            title={
              hasSearch
                ? 'No types match your search'
                : archived === 'only'
                  ? 'No archived types'
                  : archived === 'include'
                    ? 'No expense types yet'
                    : 'No active expense types'
            }
            description={
              hasSearch
                ? 'Try a different name, or clear the search to see all types.'
                : archived === 'only'
                  ? 'Archived types stay here with their history and can be restored at any time.'
                  : 'Create a type such as Food, Rent, or Bus Travel to start recording expenses.'
            }
            action={
              hasSearch ? (
                <Button variant="secondary" onClick={clearSearch}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Create expense type
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between px-0.5">
            <p className="text-xs font-medium text-muted">
              {typesQuery.data?.total ?? items.length}{' '}
              {(typesQuery.data?.total ?? items.length) === 1 ? 'type' : 'types'}
              {hasSearch ? ` matching “${debouncedSearch}”` : ''}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-subtle">
              <Archive className="h-3 w-3" aria-hidden />
              Totals are all-time
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((type) => (
              <Card
                key={type.id}
                className="group flex flex-col p-4 transition hover:border-primary/25 hover:shadow-lift"
              >
                <div className="flex items-start gap-3">
                  <TypeIcon icon={type.icon} color={type.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/expense-types/${type.id}`}
                        className="truncate text-sm font-semibold text-ink hover:text-primary"
                      >
                        {type.name}
                      </Link>
                      {type.is_archived ? <Badge tone="archive">Archived</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {type.category ?? 'Uncategorised'}
                    </p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-muted">
                  {type.description ?? 'No description yet.'}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                      All-time spend
                    </p>
                    <p className="tabular mt-0.5 text-sm font-semibold text-ink">
                      {formatINR(type.total_paise)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                      Transactions
                    </p>
                    <p className="tabular mt-0.5 text-sm font-semibold text-ink">
                      {type.transaction_count.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <Link
                    to={`/expense-types/${type.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View details
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEdit(type)}
                      className="rounded-lg p-2 text-subtle transition hover:bg-elevated hover:text-primary"
                      aria-label={`Edit ${type.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setArchiveTarget({
                          expenseType: type,
                          action: type.is_archived ? 'unarchive' : 'archive',
                        })
                      }
                      className={cn(
                        'rounded-lg p-2 text-subtle transition hover:bg-elevated',
                        type.is_archived ? 'hover:text-positive' : 'hover:text-warning',
                      )}
                      aria-label={`${type.is_archived ? 'Restore' : 'Archive'} ${type.name}`}
                    >
                      {type.is_archived ? (
                        <ArchiveRestore className="h-4 w-4" aria-hidden />
                      ) : (
                        <Archive className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <TypeFormDialog
        open={dialog.open}
        expenseType={dialog.expenseType}
        initialSuggestion={dialog.suggestion}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => void handleArchiveToggle()}
        loading={archiving}
        tone={archiveTarget?.action === 'unarchive' ? 'primary' : 'danger'}
        title={
          archiveTarget?.action === 'unarchive' ? 'Restore this type?' : 'Archive this type?'
        }
        confirmLabel={archiveTarget?.action === 'unarchive' ? 'Restore type' : 'Archive type'}
        description={
          archiveTarget ? (
            archiveTarget.action === 'archive' ? (
              <>
                <strong className="font-semibold text-ink">{archiveTarget.expenseType.name}</strong>{' '}
                will be hidden from new expense forms. All {archiveTarget.expenseType.transaction_count}{' '}
                existing{' '}
                {archiveTarget.expenseType.transaction_count === 1 ? 'expense' : 'expenses'} and
                historical reports stay intact. You can restore it later.
              </>
            ) : (
              <>
                <strong className="font-semibold text-ink">{archiveTarget.expenseType.name}</strong>{' '}
                will appear again in expense forms and active type lists. Its history is unchanged.
              </>
            )
          ) : null
        }
      />
    </div>
  )
}
