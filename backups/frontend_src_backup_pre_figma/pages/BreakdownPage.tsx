import { Columns3, ListFilter, Plus, Search, Tags, WalletCards, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ComparisonBadge } from '@/components/ComparisonBadge'
import { PageHeader } from '@/components/PageHeader'
import { PeriodPicker } from '@/components/PeriodPicker'
import { StatCard } from '@/components/StatCard'
import { TypeBreakdownTable } from '@/components/TypeBreakdownTable'
import { TypeBarChart } from '@/components/charts/TypeBarChart'
import { TypeIcon } from '@/components/TypeIcon'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/FormControls'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/ui/States'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePeriod } from '@/hooks/usePeriod'
import { api } from '@/services/api'
import type { TypeBreakdown } from '@/types/api'
import { formatINR, formatPercent } from '@/utils/currency'
import { formatRangeLabel } from '@/utils/periods'

type SortKey = 'total_desc' | 'total_asc' | 'name_asc' | 'count_desc'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'total_desc', label: 'Highest total' },
  { value: 'total_asc', label: 'Lowest total' },
  { value: 'count_desc', label: 'Most transactions' },
  { value: 'name_asc', label: 'Name A–Z' },
]

function sortBreakdown(items: TypeBreakdown[], sort: SortKey): TypeBreakdown[] {
  const copy = [...items]
  switch (sort) {
    case 'total_asc':
      return copy.sort((a, b) => a.total_paise - b.total_paise || a.name.localeCompare(b.name))
    case 'name_asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    case 'count_desc':
      return copy.sort(
        (a, b) => b.transaction_count - a.transaction_count || b.total_paise - a.total_paise,
      )
    case 'total_desc':
    default:
      return copy.sort((a, b) => b.total_paise - a.total_paise || a.name.localeCompare(b.name))
  }
}

export function BreakdownPage() {
  useDocumentTitle('Breakdown')
  const period = usePeriod()
  const { openCreate } = useExpenseDialog()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('total_desc')
  const { start, end } = period.range

  const summaryQuery = useApiQuery(['summary', start, end], () =>
    api.analyticsSummary({ start_date: start, end_date: end }),
  )
  const byTypeQuery = useApiQuery(['by-type', start, end], () =>
    api.analyticsByType({ start_date: start, end_date: end }),
  )

  const summary = summaryQuery.data
  const allItems = byTypeQuery.data?.items ?? []
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matches = term
      ? allItems.filter(
          (item) =>
            item.name.toLowerCase().includes(term) ||
            (item.is_archived && 'archived'.includes(term)),
        )
      : allItems
    return sortBreakdown(matches, sort)
  }, [allItems, search, sort])

  const loading = (summaryQuery.loading && !summary) || (byTypeQuery.loading && !byTypeQuery.data)
  const error = summaryQuery.error ?? byTypeQuery.error
  const hasExpenses = Boolean(summary && summary.transaction_count > 0)
  const topType = allItems[0]
  const topThreeShare = allItems
    .slice(0, 3)
    .reduce((total, item) => total + item.share_percent, 0)

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow="Allocation"
        title="Spending breakdown"
        description={`Every type, its share, and its transaction profile for ${formatRangeLabel(period.range)}.`}
        actions={
          <>
            <Link to={`/expenses?${period.periodSearch}`} className={buttonClasses('secondary', 'md')}>
              <WalletCards className="h-4 w-4" aria-hidden />
              Expenses
            </Link>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" aria-hidden />
              Add expense
            </Button>
          </>
        }
      />

      <PeriodPicker
        preset={period.preset}
        range={period.range}
        onPresetChange={period.setPreset}
        onCustomChange={period.setCustomRange}
      />

      {loading ? (
        <PageSkeleton />
      ) : error ? (
        <ErrorState
          title="Could not load the breakdown"
          description={error.message}
          onRetry={() => {
            summaryQuery.refetch()
            byTypeQuery.refetch()
          }}
        />
      ) : !summary || !hasExpenses ? (
        <Card>
          <EmptyState
            icon={Columns3}
            title="Nothing to break down yet"
            description="Add an expense and its type allocation will appear here automatically."
            action={
              <Button onClick={() => openCreate()}>
                <Plus className="h-4 w-4" aria-hidden />
                Add expense
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Total spent"
              value={formatINR(summary.total_paise)}
              hint={
                <ComparisonBadge
                  direction={summary.comparison.direction}
                  changePercent={summary.comparison.change_percent}
                  changePaise={summary.comparison.change_paise}
                />
              }
              icon={WalletCards}
              tone="primary"
            />
            <StatCard
              label="Active types"
              value={allItems.filter((item) => !item.is_archived).length.toString()}
              hint={`${allItems.length} types with spending`}
              icon={Tags}
            />
            <StatCard
              label="Transactions"
              value={summary.transaction_count.toLocaleString('en-IN')}
              hint={`Average ${formatINR(summary.average_paise)}`}
              icon={ListFilter}
            />
            <StatCard
              label="Top type"
              value={topType ? `${formatPercent(topType.share_percent)}%` : '—'}
              hint={topType ? topType.name : 'No type spending'}
              icon={Columns3}
              tone="warning"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <CardHeader
                title="Type comparison"
                description={
                  topType
                    ? `${topType.name} accounts for ${formatPercent(topType.share_percent)}% of spending. Top three types make up ${formatPercent(topThreeShare)}%.`
                    : 'Compare spending across expense types.'
                }
                action={
                  topType ? (
                    <div className="flex items-center gap-2 rounded-xl border border-line bg-elevated px-2.5 py-1.5">
                      <TypeIcon icon={topType.icon} color={topType.color} size="sm" />
                      <span className="text-xs font-semibold text-ink">{topType.name}</span>
                    </div>
                  ) : null
                }
              />
            </div>
            <div className="px-2 py-3 sm:px-4">
              <TypeBarChart items={allItems} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardHeader
                  title="Full breakdown"
                  description={`${allItems.length} ${
                    allItems.length === 1 ? 'expense type' : 'expense types'
                  } with spending in this period.`}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                      aria-hidden
                    />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a type…"
                      className="!h-9 pl-9 pr-8 text-sm sm:w-52"
                      aria-label="Search breakdown"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-ink"
                        aria-label="Clear breakdown search"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <Select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="!h-9 text-sm sm:w-44"
                    aria-label="Sort breakdown"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching expense type"
                description={`Nothing in this period matches “${search}”.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <TypeBreakdownTable items={filteredItems} periodSearch={period.periodSearch} />
            )}
          </Card>

          <p className="px-1 text-[11px] leading-5 text-subtle">
            Shares use the full period total, even while this table is searched or re-sorted.
            Archived types remain visible because their historical expenses still count.
          </p>
        </>
      )}
    </div>
  )
}
