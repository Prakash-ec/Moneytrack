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

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { PageHeader } from '@/components/PageHeader'
import { TypeFormDialog } from '@/components/TypeFormDialog'
import { TypeIcon } from '@/components/TypeIcon'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import { api } from '@/services/api'
import type { ArchivedFilter, ExpenseType } from '@/types/api'
import { formatINR } from '@/utils/currency'
import { TYPE_SUGGESTIONS, type TypeSuggestion } from '@/utils/typeOptions'

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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Categories"
        title="Expense types"
        description="Create and manage categories for your spending."
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" aria-hidden />
            New expense type
          </Button>
        }
      />

      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} aria-hidden />
          <input
            type="search"
            placeholder="Search expense types…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search expense types"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="icon-button"
              style={{ width: 24, height: 24 }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </label>
        <div className="segmented inline" role="group" aria-label="Filter expense types">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setArchivedFilter(tab.value)}
              className={archived === tab.value ? 'active' : ''}
              aria-pressed={archived === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {showSuggestions ? (
        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Start with a suggestion</h2>
              <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
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
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
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
        <div className="type-grid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card type-card">
              <Skeleton className="h-10 w-10 rounded-xl mb-3" />
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3 w-20 mb-4" />
              <Skeleton className="h-6 w-24" />
            </div>
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
          <div className="flex items-center justify-between px-0.5 text-xs text-[var(--muted)]">
            <p>
              {typesQuery.data?.total ?? items.length}{' '}
              {(typesQuery.data?.total ?? items.length) === 1 ? 'type' : 'types'}
              {hasSearch ? ` matching “${debouncedSearch}”` : ''}
            </p>
            <p className="flex items-center gap-1.5 text-[11px]">
              <Archive className="h-3 w-3" aria-hidden />
              Totals are all-time
            </p>
          </div>

          <section className="type-grid">
            {items.map((type) => (
              <article key={type.id} className="card type-card">
                <div className="type-top">
                  <TypeIcon icon={type.icon} color={type.color} size="md" />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(type)}
                      className="icon-button"
                      aria-label={`Edit ${type.name}`}
                      title="Edit"
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
                      className="icon-button"
                      aria-label={`${type.is_archived ? 'Restore' : 'Archive'} ${type.name}`}
                      title={type.is_archived ? 'Restore' : 'Archive'}
                    >
                      {type.is_archived ? (
                        <ArchiveRestore className="h-4 w-4 text-positive" aria-hidden />
                      ) : (
                        <Archive className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/expense-types/${type.id}`} className="hover:underline">
                    <h2>{type.name}</h2>
                  </Link>
                  {type.is_archived && <Badge tone="archive">Archived</Badge>}
                </div>
                <p>
                  {type.transaction_count}{' '}
                  {type.transaction_count === 1 ? 'transaction' : 'transactions'} this month
                </p>

                <div className="type-metric">
                  <strong>{formatINR(type.total_paise)}</strong>
                  <span>{type.category ?? 'Uncategorised'}</span>
                </div>

                <div className="mt-auto border-t border-[var(--border)] pt-3 flex items-center justify-between text-xs">
                  <Link
                    to={`/expense-types/${type.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline"
                  >
                    View details
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <span className="text-[11px] text-[var(--muted)]">All-time</span>
                </div>
              </article>
            ))}
          </section>
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
                <strong className="font-semibold text-[var(--text)]">{archiveTarget.expenseType.name}</strong>{' '}
                will be hidden from new expense forms. All {archiveTarget.expenseType.transaction_count}{' '}
                existing{' '}
                {archiveTarget.expenseType.transaction_count === 1 ? 'expense' : 'expenses'} and
                historical reports stay intact. You can restore it later.
              </>
            ) : (
              <>
                <strong className="font-semibold text-[var(--text)]">{archiveTarget.expenseType.name}</strong>{' '}
                will appear again in expense forms and active type lists. Its history is unchanged.
              </>
            )
          ) : null
        }
      />
    </div>
  )
}
