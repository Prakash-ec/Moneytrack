import { zodResolver } from '@hookform/resolvers/zod'
import { Check, CircleAlert, Sparkles } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { TypeIcon, ICON_OPTIONS } from '@/components/TypeIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/services/api'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import type { Category, ExpenseType } from '@/types/api'
import {
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  TYPE_SUGGESTIONS,
  type TypeSuggestion,
} from '@/utils/typeOptions'
import { cn } from '@/utils/cn'

const typeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(80, 'Keep the name to 80 characters or fewer.'),
  description: z.string().max(500, 'Keep the description to 500 characters or fewer.'),
  category: z.string(),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Choose a valid colour.'),
})

type TypeFormValues = z.infer<typeof typeSchema>

interface TypeFormDialogProps {
  open: boolean
  expenseType?: ExpenseType | null
  initialSuggestion?: TypeSuggestion | null
  onClose: () => void
}

export function TypeFormDialog({
  open,
  expenseType = null,
  initialSuggestion = null,
  onClose,
}: TypeFormDialogProps) {
  const formId = `type-form-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const isEditing = Boolean(expenseType)
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const defaults: TypeFormValues = {
    name: expenseType?.name ?? initialSuggestion?.name ?? '',
    description: expenseType?.description ?? '',
    category: expenseType?.category ?? initialSuggestion?.category ?? 'Other',
    icon: expenseType?.icon ?? initialSuggestion?.icon ?? 'wallet',
    color: expenseType?.color ?? initialSuggestion?.color ?? '#0F766E',
  }

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TypeFormValues>({
    resolver: zodResolver(typeSchema),
    defaultValues: defaults,
  })

  useEffect(() => {
    if (open) {
      reset({
        name: expenseType?.name ?? initialSuggestion?.name ?? '',
        description: expenseType?.description ?? '',
        category: expenseType?.category ?? initialSuggestion?.category ?? 'Other',
        icon: expenseType?.icon ?? initialSuggestion?.icon ?? 'wallet',
        color: expenseType?.color ?? initialSuggestion?.color ?? '#0F766E',
      })
      setFormError(null)
    }
  }, [open, expenseType, initialSuggestion, reset])

  const name = watch('name')
  const category = watch('category')
  const icon = watch('icon')
  const color = watch('color')

  const applySuggestion = (suggestion: TypeSuggestion) => {
    setValue('name', suggestion.name, { shouldValidate: true })
    setValue('category', suggestion.category)
    setValue('icon', suggestion.icon)
    setValue('color', suggestion.color)
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    const payload = {
      name: values.name,
      description: values.description.trim() || null,
      category: (values.category || null) as Category | null,
      icon: values.icon,
      color: values.color,
    }
    try {
      if (expenseType) {
        await api.updateExpenseType(expenseType.id, payload)
        showToast({
          title: 'Expense type updated',
          description: 'Historical transactions now show the updated name.',
        })
      } else {
        await api.createExpenseType(payload)
        showToast({
          title: 'Expense type created',
          description: 'You can now record expenses under it.',
        })
      }
      invalidate()
      onClose()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the expense type.')
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit expense type' : 'New expense type'}
      description={
        isEditing
          ? 'Renaming keeps every linked transaction. Archiving hides a type from new expenses.'
          : 'Create a reusable label for a kind of spending.'
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Create expense type'}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <div
            className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/[0.06] px-3.5 py-3 text-sm text-danger"
            role="alert"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated p-3.5">
          <TypeIcon icon={icon} color={color} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {name.trim() || 'Your expense type'}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge>{category || 'No category'}</Badge>
              {expenseType?.is_archived ? <Badge tone="archive">Archived</Badge> : null}
            </div>
          </div>
          <div className="ml-auto hidden items-center gap-1 text-xs text-subtle sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            Live preview
          </div>
        </div>

        {!isEditing && TYPE_SUGGESTIONS.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-subtle">
              Suggestions
            </p>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap">
              {TYPE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.name}
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition',
                    name === suggestion.name
                      ? 'border-primary/40 bg-primary-soft text-primary'
                      : 'border-line bg-surface text-muted hover:border-primary/25 hover:text-ink',
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: suggestion.color }}
                  />
                  {suggestion.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="Type name" htmlFor="type-name" error={errors.name?.message}>
          <Input
            id="type-name"
            placeholder="e.g. Jio Recharge"
            maxLength={80}
            data-autofocus
            aria-invalid={Boolean(errors.name) || undefined}
            {...register('name')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Category"
            htmlFor="type-category"
            optional
            error={errors.category?.message}
          >
            <Select id="type-category" {...register('category')}>
              <option value="">No category</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">A note on names</p>
            <p className="text-xs leading-5 text-muted">
              Names are unique, ignoring case and extra spaces. Renaming a type updates every
              historical transaction that uses it.
            </p>
          </div>
        </div>

        <Field
          label="Description"
          htmlFor="type-description"
          optional
          error={errors.description?.message}
        >
          <Textarea
            id="type-description"
            placeholder="What belongs in this type?"
            maxLength={500}
            rows={2}
            {...register('description')}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Icon</p>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
            {ICON_OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = icon === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('icon', option.value)}
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={selected}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-lg border transition',
                    selected
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-line bg-surface text-muted hover:border-primary/30 hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              )
            })}
          </div>
          {errors.icon ? (
            <p className="mt-1 text-xs text-danger" role="alert">
              {errors.icon.message}
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Colour</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((option) => {
              const selected = color.toUpperCase() === option.toUpperCase()
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setValue('color', option)}
                  aria-label={`Use colour ${option}`}
                  aria-pressed={selected}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition relative',
                    selected
                      ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-surface shadow-sm'
                      : 'border border-black/10 dark:border-white/15 hover:scale-105',
                  )}
                  style={{ backgroundColor: option }}
                >
                  {selected ? <Check className="h-4 w-4 text-white drop-shadow-sm" aria-hidden /> : null}
                </button>
              )
            })}
          </div>
          {errors.color ? (
            <p className="mt-1 text-xs text-danger" role="alert">
              {errors.color.message}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}
