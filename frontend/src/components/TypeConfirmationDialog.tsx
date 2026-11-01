import { AlertTriangle, Plus, Sparkles } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/services/api'
import { useToast } from '@/providers/ToastProvider'
import type { Category, ReceiptParseResult } from '@/types/api'
import { CATEGORY_OPTIONS } from '@/utils/typeOptions'

interface TypeConfirmationDialogProps {
  open: boolean
  suggestedTypeName: string
  scannedReceipt: ReceiptParseResult | null
  onCreateType: (newTypeId: number) => void
  onChooseExisting: () => void
  onCancel: () => void
}

export function TypeConfirmationDialog({
  open,
  suggestedTypeName,
  scannedReceipt,
  onCreateType,
  onChooseExisting,
  onCancel,
}: TypeConfirmationDialogProps) {
  const { showToast } = useToast()
  const [typeName, setTypeName] = useState(suggestedTypeName)
  const [category, setCategory] = useState<Category>('Other')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracks whether a create request is in flight to prevent duplicate submissions.
  const createRef = useRef(false)

  const handleCreate = useCallback(async () => {
    const name = typeName.trim()
    if (!name) {
      setError('Enter a type name.')
      return
    }
    if (createRef.current) return
    setCreating(true)
    setError(null)
    createRef.current = true
    try {
      const created = await api.createExpenseType({
        name,
        category,
        icon: 'tag',
        color: '#0F766E',
      })
      createRef.current = false
      setCreating(false)
      showToast({
        title: 'Expense type created',
        description: `“${created.name}” is ready to use for this expense.`,
        variant: 'success',
      })
      onCreateType(created.id)
    } catch (err) {
      createRef.current = false
      setCreating(false)
      const message = err instanceof Error ? err.message : 'Could not create the expense type.'
      if ((err as { status?: number }).status === 409) {
        setError('An expense type with this name already exists. Choose it from the list instead.')
      } else {
        setError(message)
      }
    }
  }, [typeName, category, showToast, onCreateType])

  const handleChooseExisting = useCallback(() => {
    createRef.current = false
    onChooseExisting()
  }, [onChooseExisting])

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          New expense type suggested
        </div>
      }
      description={
        <>
          No existing expense type matches this receipt. Create <strong>{typeName}</strong> as a
          new type, or choose an existing one below. The expense itself is not saved until you
          confirm in the next step.
        </>
      }
      size="md"
    >
      <div className="space-y-4">
        <Field
          label="Type name"
          htmlFor="suggested-type-name"
          error={error ?? undefined}
        >
          <Input
            id="suggested-type-name"
            value={typeName}
            onChange={(event) => setTypeName(event.target.value)}
            maxLength={80}
            autoFocus
            disabled={creating}
            aria-invalid={Boolean(error) || undefined}
          />
        </Field>

        <Field label="Category" htmlFor="suggested-type-category" optional>
          <Select
            id="suggested-type-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            disabled={creating}
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </Field>

        {scannedReceipt && scannedReceipt.amount_paise && (
          <div className="rounded-lg border border-line bg-elevated p-3">
            <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
              Expense preview
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">{scannedReceipt.merchant ?? 'Unknown merchant'}</span>
              <span className="tabular text-sm font-semibold text-ink">
                {scannedReceipt.amount_paise !== null ? `${
                  scannedReceipt.currency === 'INR' ? '₹' : ''
                }${
                  (scannedReceipt.amount_paise / 100).toFixed(2)
                }` : '—'}
              </span>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/[0.06] px-3.5 py-3 text-sm text-danger" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <footer>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleChooseExisting}
            disabled={creating}
          >
            Choose existing type
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            loading={creating}
            disabled={creating}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create type &amp; continue
          </Button>
        </div>
      </footer>
    </Modal>
  )
}
