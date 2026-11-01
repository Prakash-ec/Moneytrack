import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock,
  Copy,
  Loader2,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/FormControls'
import { Modal } from '@/components/ui/Modal'
import { TypeConfirmationDialog } from '@/components/TypeConfirmationDialog'
import { api, ApiError } from '@/services/api'
import { enqueueOfflineExpense } from '@/services/offlineQueue'
import { useApiQuery } from '@/hooks/useApiQuery'
import { useTypeLearnings } from '@/hooks/useTypeLearnings'
import { useDataRefresh } from '@/providers/RefreshProvider'
import { useToast } from '@/providers/ToastProvider'
import type {
  Category,
  Expense,
  ExpenseType,
  PaymentMethod,
  ReceiptItem,
  ReceiptParseResult,
} from '@/types/api'
import { formatINR, parseRupeesToPaise, paiseToAmountInput } from '@/utils/currency'
import { formatDate, isValidISODate, todayIST } from '@/utils/dates'
import { formatLineItemsSummary, getConfidenceBadge } from '@/utils/receipt'
import { CATEGORY_OPTIONS, PAYMENT_METHOD_OPTIONS } from '@/utils/typeOptions'

const expenseSchema = z.object({
  expense_type_id: z.string().min(1, 'Choose an expense type.'),
  account_id: z.string().optional(),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount.')
    .refine(
      (value) => parseRupeesToPaise(value) !== null,
      'Enter a valid amount greater than ₹0 with at most 2 decimal places.',
    ),
  expense_date: z
    .string()
    .min(1, 'Choose a date.')
    .refine((value) => isValidISODate(value), 'Choose a valid date.'),
  note: z.string().max(500, 'Keep the note to 500 characters or fewer.'),
  payment_method: z.string(),
  merchant: z.string().max(120, 'Keep the merchant to 120 characters or fewer.'),
})

type ExpenseFormValues = z.infer<typeof expenseSchema>

const QUICK_COLOR = '#0F766E'

// Remember last-used category and payment method in localStorage.
// Only store valid selections; fall back to defaults if the stored value is invalid.
const STORAGE_KEY = 'moneytrack-quick-prefs'

function loadQuickPrefs(): { category: Category; paymentMethod: PaymentMethod } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Validate that stored values are valid
    const validCategories = ['Food', 'Travel', 'Utilities', 'Education', 'Shopping', 'Health', 'Entertainment', 'Housing', 'Other']
    const validPaymentMethods = ['UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other']
    if (validCategories.includes(parsed.category) && validPaymentMethods.includes(parsed.paymentMethod)) {
      return { category: parsed.category, paymentMethod: parsed.paymentMethod }
    }
  } catch {
    // ignore storage errors or invalid JSON
  }
  return null
}

function normalizePaymentMethod(method?: string | null): string {
  if (!method) return ''
  const trimmed = method.trim()
  const found = PAYMENT_METHOD_OPTIONS.find(
    (opt) => opt.toLowerCase() === trimmed.toLowerCase(),
  )
  if (found) return found
  if (trimmed.toLowerCase().includes('card')) return 'Debit Card'
  if (trimmed.toLowerCase().includes('upi')) return 'UPI'
  if (trimmed.toLowerCase().includes('cash')) return 'Cash'
  if (
    trimmed.toLowerCase().includes('bank') ||
    trimmed.toLowerCase().includes('net banking') ||
    trimmed.toLowerCase().includes('neft') ||
    trimmed.toLowerCase().includes('rtgs') ||
    trimmed.toLowerCase().includes('imps')
  ) {
    return 'Bank Transfer'
  }
  return 'Other'
}

function saveQuickPrefs(category: Category, paymentMethod: PaymentMethod): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ category, paymentMethod }))
  } catch {
    // ignore storage errors
  }
}

function scanMethodLabel(method: string): string {
  switch (method) {
    case 'groq':
      return 'Groq AI vision'
    case 'hybrid':
      return 'OCR + Groq AI'
    case 'AI text extraction':
      return 'AI text extraction'
    case 'ocr':
    default:
      return 'Local OCR'
  }
}

export function ExpenseForm({
  expense,
  initialTypeId,
  prefill,
  scannedReceipt,
  onOpenScan,
  onClose,
}: {
  expense: Expense | null
  initialTypeId?: number
  prefill?: {
    initialTypeId?: number
    amount?: string
    merchant?: string
    note?: string
    payment_method?: string
    account_id?: number
  }
  scannedReceipt?: ReceiptParseResult | null
  onOpenScan?: () => void
  onClose: () => void
}) {
  const isEditing = Boolean(expense)
  const isReviewingScan = Boolean(scannedReceipt && !expense)
  const formId = `expense-form-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const { invalidate } = useDataRefresh()
  const { showToast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [createdTypes, setCreatedTypes] = useState<ExpenseType[]>([])
  const [showQuickType, setShowQuickType] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickCategory, setQuickCategory] = useState<Category>('Other')
  const [quickError, setQuickError] = useState<string | null>(null)
  const [quickSaving, setQuickSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showItems, setShowItems] = useState(false)
  const [typeConfirmationOpen, setTypeConfirmationOpen] = useState(false)

  // Remembered category / payment method preferences (restored from localStorage).
  // When editing an existing expense, don't override its values with remembered preferences.
  const [quickPrefs, setQuickPrefs] = useState<{ category: Category; paymentMethod: PaymentMethod } | null>(() => {
    if (isEditing) return null
    return loadQuickPrefs()
  })

  // Type learnings: tracks merchant -> type mappings confirmed by the user,
  // so previously confirmed types are suggested first on future scans.
  const { record: recordLearning } = useTypeLearnings()

  // Remember the user's choices when they explicitly change category or payment method.
  // We do this outside of the form save to avoid persisting on cancel/edit.
  useEffect(() => {
    if (!quickPrefs && !isEditing) {
      const prefs = loadQuickPrefs()
      if (prefs) {
        setQuickPrefs(prefs)
      }
    }
  }, [quickPrefs, isEditing])

  // Auto-open type confirmation when a scanned receipt proposes a brand-new
  // type (fallback if the dialog provider did not intercept it).
  useEffect(() => {
    if (
      !isEditing &&
      scannedReceipt?.suggested_new_type_name &&
      !scannedReceipt?.suggested_expense_type_id &&
      !initialTypeId
    ) {
      setTypeConfirmationOpen(true)
    }
  }, [scannedReceipt, isEditing, initialTypeId])

  const typesQuery = useApiQuery(
    ['expense-types', 'form'],
    () => api.listExpenseTypes({ archived: 'include', page_size: 200 }),
    { enabled: true },
  )

  const accountsQuery = useApiQuery(
    ['bank-accounts', 'expense-form'],
    () => api.listBankAccounts(false),
    { enabled: true },
  )
  const bankAccounts = accountsQuery.data?.items ?? []

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      expense_type_id: expense
        ? String(expense.expense_type_id)
        : scannedReceipt?.suggested_expense_type_id
          ? String(scannedReceipt.suggested_expense_type_id)
          : initialTypeId
            ? String(initialTypeId)
            : prefill?.initialTypeId
              ? String(prefill.initialTypeId)
              : '',
      account_id: expense?.account_id
        ? String(expense.account_id)
        : prefill?.account_id
          ? String(prefill.account_id)
          : '',
      amount: expense
        ? paiseToAmountInput(expense.amount_paise)
        : scannedReceipt?.amount_paise
          ? paiseToAmountInput(scannedReceipt.amount_paise)
          : prefill?.amount ?? '',
      expense_date: expense?.expense_date ?? (scannedReceipt?.expense_date ?? todayIST()),
      note: expense?.note ?? (scannedReceipt?.note ?? prefill?.note ?? ''),
      payment_method: normalizePaymentMethod(
        expense?.payment_method ?? (scannedReceipt?.payment_method ?? prefill?.payment_method ?? ''),
      ),
      merchant: expense?.merchant ?? (scannedReceipt?.merchant ?? prefill?.merchant ?? ''),
    },
  })

  // Pre-fill form when prefill or scanned receipt is provided
  useEffect(() => {
    if (prefill && !expense && !scannedReceipt) {
      if (prefill.initialTypeId) {
        setValue('expense_type_id', String(prefill.initialTypeId), { shouldValidate: true })
      }
      if (prefill.amount) {
        setValue('amount', prefill.amount, { shouldValidate: true })
      }
      if (prefill.merchant) {
        setValue('merchant', prefill.merchant, { shouldValidate: true })
      }
      if (prefill.note) {
        setValue('note', prefill.note, { shouldValidate: true })
      }
      if (prefill.payment_method) {
        setValue('payment_method', normalizePaymentMethod(prefill.payment_method), {
          shouldValidate: true,
        })
      }
      if (prefill.account_id) {
        setValue('account_id', String(prefill.account_id), { shouldValidate: true })
      }
    }
  }, [prefill, expense, scannedReceipt, setValue])

  // Pre-fill form when scanned receipt is provided
  useEffect(() => {
    if (scannedReceipt && !expense) {
      if (scannedReceipt.suggested_expense_type_id) {
        setValue('expense_type_id', String(scannedReceipt.suggested_expense_type_id), {
          shouldValidate: true,
        })
      }
      if (scannedReceipt.amount_paise) {
        setValue('amount', paiseToAmountInput(scannedReceipt.amount_paise), {
          shouldValidate: true,
        })
      }
      if (scannedReceipt.expense_date) {
        setValue('expense_date', scannedReceipt.expense_date, { shouldValidate: true })
      }
      if (scannedReceipt.merchant) {
        setValue('merchant', scannedReceipt.merchant, { shouldValidate: true })
      }
      if (scannedReceipt.payment_method) {
        setValue('payment_method', normalizePaymentMethod(scannedReceipt.payment_method), {
          shouldValidate: true,
        })
      }
      if (scannedReceipt.note) {
        setValue('note', scannedReceipt.note, { shouldValidate: true })
      }
    }
  }, [expense, scannedReceipt, setValue])

  const handleAppendItemsToNote = () => {
    if (!scannedReceipt?.items?.length) return
    const summary = formatLineItemsSummary(scannedReceipt.items)
    const currentNote = watch('note') || ''
    const newNote = currentNote ? `${currentNote.trim()}\nItems: ${summary}` : `Items: ${summary}`
    setValue('note', newNote.slice(0, 500), { shouldDirty: true, shouldValidate: true })
    showToast({
      title: 'Items appended to note',
      description: 'Extracted line items have been included in the note field.',
    })
  }

  const amountValue = watch('amount')
  const selectedTypeId = watch('expense_type_id')
  const parsedAmount = parseRupeesToPaise(amountValue || '')

  const selectableTypes = useMemo(() => {
    const all = [...(typesQuery.data?.items ?? []), ...createdTypes]
    const unique = new Map<number, ExpenseType>()
    all.forEach((type) => unique.set(type.id, type))
    return Array.from(unique.values()).filter(
      (type) => !type.is_archived || type.id === expense?.expense_type_id,
    )
  }, [typesQuery.data, createdTypes, expense?.expense_type_id])

  const activeTypes = selectableTypes.filter((type) => !type.is_archived)
  const selectedType = selectableTypes.find((type) => String(type.id) === selectedTypeId)
  const autoOpenedQuickCreate = useRef(false)

  useEffect(() => {
    if (
      !expense &&
      !typesQuery.loading &&
      !autoOpenedQuickCreate.current &&
      activeTypes.length === 0
    ) {
      autoOpenedQuickCreate.current = true
      setShowQuickType(true)
    }
  }, [activeTypes.length, expense, typesQuery.loading])

  // Auto-match an expense type when prefill is provided and no type is selected yet
  useEffect(() => {
    if (!expense && !scannedReceipt && prefill && selectableTypes.length > 0) {
      const currentTypeId = watch('expense_type_id')
      if (!currentTypeId) {
        const queryTerm = (prefill.merchant || prefill.note || '').toLowerCase()
        if (queryTerm) {
          const match = selectableTypes.find((t) => {
            const tName = t.name.toLowerCase()
            const tCat = (t.category || '').toLowerCase()
            return (
              tName.includes(queryTerm) ||
              queryTerm.includes(tName) ||
              (queryTerm.includes('chai') && (tName.includes('food') || tCat.includes('food'))) ||
              (queryTerm.includes('lunch') && (tName.includes('food') || tCat.includes('food'))) ||
              (queryTerm.includes('fuel') && (tName.includes('fuel') || tName.includes('trans') || tCat.includes('travel'))) ||
              (queryTerm.includes('grocer') && (tName.includes('grocer') || tCat.includes('food') || tCat.includes('shop')))
            )
          })
          if (match) {
            setValue('expense_type_id', String(match.id), { shouldValidate: true })
          } else if (selectableTypes.length > 0) {
            setValue('expense_type_id', String(selectableTypes[0].id), { shouldValidate: true })
          }
        } else if (selectableTypes.length > 0) {
          setValue('expense_type_id', String(selectableTypes[0].id), { shouldValidate: true })
        }
      }
    }
  }, [expense, scannedReceipt, prefill, selectableTypes, setValue, watch])

  const onSubmit = handleSubmit(async (values) => {
    const amountPaise = parseRupeesToPaise(values.amount)
    if (!amountPaise) return
    setFormError(null)

    const payload = {
      expense_type_id: Number(values.expense_type_id),
      account_id: values.account_id && Number(values.account_id) > 0 ? Number(values.account_id) : null,
      amount_paise: amountPaise,
      expense_date: values.expense_date,
      note: values.note ? values.note.trim() || null : null,
      payment_method: (values.payment_method || null) as PaymentMethod | null,
      merchant: values.merchant ? values.merchant.trim() || null : null,
    }

    try {
      if (expense) {
        await api.updateExpense(expense.id, payload)
        showToast({ title: 'Expense updated', description: 'Your dashboard has been refreshed.' })
      } else {
        await api.createExpense(payload)
        showToast({ title: 'Expense saved', description: 'Your dashboard has been refreshed.' })
      }
      invalidate()
      // Remember last-used category and payment method for next time.
      if (!expense && selectedType?.category && values.payment_method) {
        saveQuickPrefs(
          selectedType.category as Category,
          values.payment_method as PaymentMethod,
        )
      }
      // Learn merchant -> type mapping from confirmed scans.
      if (!expense && scannedReceipt?.merchant && values.expense_type_id) {
        const selected = selectableTypes.find((t) => t.id === Number(values.expense_type_id))
        if (selected) {
          recordLearning(
            scannedReceipt.merchant,
            selected.id,
            selected.name,
            selected.category,
          )
        }
      }
      onClose()
    } catch (error) {
      if (!expense && error instanceof ApiError && error.status === 0) {
        enqueueOfflineExpense(payload)
        showToast({
          title: 'Expense queued offline',
          description: 'Saved on your device. It will automatically sync when reconnected.',
          variant: 'info',
        })
        onClose()
        return
      }
      setFormError(error instanceof Error ? error.message : 'Could not save the expense.')
    }
  })

  const handleQuickCreate = async () => {
    const name = quickName.trim()
    if (!name) {
      setQuickError('Enter a name for the new expense type.')
      return
    }
    setQuickSaving(true)
    setQuickError(null)
    try {
      const created = await api.createExpenseType({
        name,
        category: quickCategory,
        icon: 'tag',
        color: QUICK_COLOR,
      })
      setCreatedTypes((current) => [...current, created])
      setValue('expense_type_id', String(created.id), { shouldValidate: true })
      setQuickName('')
      setShowQuickType(false)
      invalidate()
      showToast({
        title: 'Expense type created',
        description: `“${created.name}” is selected for this expense.`,
      })
    } catch (error) {
      setQuickError(
        error instanceof Error ? error.message : 'Could not create the expense type.',
      )
    } finally {
      setQuickSaving(false)
    }
  }

  // Fallback type confirmation rendered inside the form when a scanned receipt
  // proposes a brand-new type that was not already handled by the dialog
  // provider (belt-and-suspenders so the user is always offered to confirm).
  const handleCreateTypeFromForm = useCallback(async (newTypeId: number) => {
    setTypeConfirmationOpen(false)
    setValue('expense_type_id', String(newTypeId), { shouldValidate: true })
    showToast({
      title: 'Expense type created',
      description: 'The new type is selected for this expense.',
      variant: 'success',
    })
    // Submit the form to create the expense with the newly created type
    const amountValue = watch('amount')
    const parsedAmount = parseRupeesToPaise(amountValue || '')
    if (!parsedAmount) return
    handleSubmit(async (values) => {
      const amountPaise = parseRupeesToPaise(values.amount)
      if (!amountPaise) return
      const payload = {
        expense_type_id: Number(values.expense_type_id),
        account_id: values.account_id && Number(values.account_id) > 0 ? Number(values.account_id) : null,
        amount_paise: amountPaise,
        expense_date: values.expense_date,
        note: values.note ? values.note.trim() || null : null,
        payment_method: (values.payment_method || null) as PaymentMethod | null,
        merchant: values.merchant ? values.merchant.trim() || null : null,
      }
      if (expense) {
        await api.updateExpense(expense.id, payload)
        showToast({ title: 'Expense updated', description: 'Your dashboard has been refreshed.' })
      } else {
        await api.createExpense(payload)
        showToast({ title: 'Expense saved', description: 'Your dashboard has been refreshed.' })
      }
    })()
  }, [setTypeConfirmationOpen, setValue, showToast, watch, handleSubmit, parseRupeesToPaise, expense, api])

  const handleChooseExistingFromForm = useCallback(() => {
    setTypeConfirmationOpen(false)
  }, [])

  const handleCancelTypeConfirmation = useCallback(() => {
    setTypeConfirmationOpen(false)
  }, [])

  const handleDelete = async () => {
    if (!expense) return
    setDeleting(true)
    try {
      await api.deleteExpense(expense.id)
      showToast({ title: 'Expense deleted', description: 'The transaction was removed.' })
      invalidate()
      setDeleteOpen(false)
      onClose()
    } catch (error) {
      showToast({
        title: 'Could not delete expense',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={
          <div className="flex items-center justify-between gap-3 pr-2">
            <span>
              {isEditing
                ? 'Edit expense'
                : isReviewingScan
                  ? 'Review scanned receipt'
                  : 'Add expense'}
            </span>
            {!isEditing && onOpenScan ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onOpenScan}
                className="hidden text-xs sm:inline-flex"
              >
                <Camera className="h-3.5 w-3.5 text-primary" aria-hidden />
                {scannedReceipt ? 'Rescan' : 'Scan receipt'}
              </Button>
            ) : null}
          </div>
        }
        description={
          isEditing
            ? 'Changes update all dashboard totals immediately.'
            : isReviewingScan
              ? 'We pre-filled the details extracted from your receipt. Review and make any corrections before saving.'
              : 'Record where your money went. Fields marked optional can stay blank.'
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger hover:bg-danger/10"
                onClick={() => setDeleteOpen(true)}
                disabled={isSubmitting}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={isSubmitting}>
                {isEditing ? 'Save changes' : isReviewingScan ? 'Confirm & save expense' : 'Save expense'}
              </Button>
            </div>
          </div>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
          {!isEditing && onOpenScan ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-elevated p-2.5 sm:hidden">
              <span className="text-xs text-muted">Have a paper or digital receipt?</span>
              <Button type="button" variant="secondary" size="sm" onClick={onOpenScan}>
                <Camera className="h-3.5 w-3.5 text-primary" aria-hidden />
                {scannedReceipt ? 'Rescan' : 'Scan receipt'}
              </Button>
            </div>
          ) : null}

          {scannedReceipt ? (
            <section className="space-y-5 rounded-[2rem] border border-line bg-surface shadow-sm p-6">
              {/* Header strip */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Receipt className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Receipt data extracted</h3>
                    <p className="text-[10px] text-muted uppercase tracking-wider">
                      Review before saving
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const badge = getConfidenceBadge(
                      scannedReceipt.confidence.overall ?? scannedReceipt.confidence.amount ?? 0.5,
                    )
                    return <Badge tone={badge.tone}>{badge.label}</Badge>
                  })()}
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted uppercase tracking-wider">
                    <Clock className="h-3 w-3" aria-hidden />
                    {scanMethodLabel(scannedReceipt.scan_method)}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {scannedReceipt.warnings.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-warning/25 bg-warning/10 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                    <div className="text-xs text-warning">
                      <p className="font-semibold">Please verify before saving</p>
                      {scannedReceipt.warnings.map((warn, i) => (
                        <p key={i} className="mt-0.5 leading-5">
                          • {warn}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Financial breakdown */}
              {(scannedReceipt.subtotal_paise || scannedReceipt.tax_paise || scannedReceipt.amount_paise) && (
                <div className="rounded-xl border border-line bg-elevated p-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider mb-3">
                    Amount breakdown
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {scannedReceipt.subtotal_paise ? (
                      <div className="rounded-lg border border-line bg-surface p-3">
                        <span className="text-[10px] text-muted block">Subtotal</span>
                        <span className="text-sm font-semibold text-ink">
                          {formatINR(scannedReceipt.subtotal_paise)}
                        </span>
                      </div>
                    ) : null}
                    {scannedReceipt.tax_paise ? (
                      <div className="rounded-lg border border-line bg-surface p-3">
                        <span className="text-[10px] text-muted block">Tax</span>
                        <span className="text-sm font-semibold text-ink">
                          {formatINR(scannedReceipt.tax_paise)}
                        </span>
                      </div>
                    ) : null}
                    {scannedReceipt.amount_paise ? (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary-soft p-3">
                        <span className="text-[10px] font-bold text-primary block uppercase tracking-wider">
                          Payable
                        </span>
                        <span className="text-base font-bold text-primary">
                          {formatINR(scannedReceipt.amount_paise)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Detected line items */}
              {scannedReceipt.items && scannedReceipt.items.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowItems((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-ink transition hover:text-primary"
                    >
                      {showItems ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      <span>Detected items ({scannedReceipt.items.length})</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAppendItemsToNote}
                      className="h-8 px-2.5 text-xs text-primary hover:bg-primary-soft"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" aria-hidden />
                      Append to note
                    </Button>
                  </div>

                  {showItems ? (
                    <div className="rounded-xl border border-line bg-surface p-3 divide-y divide-line">
                      {scannedReceipt.items.map((item: ReceiptItem, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 py-2 px-1 hover:bg-elevated rounded-lg transition"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="truncate text-sm text-ink">{item.name}</span>
                            {item.quantity && item.quantity > 1 ? (
                              <p className="text-[10px] text-muted">Qty {item.quantity}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 tabular text-sm font-semibold text-ink">
                            {item.amount_paise ? formatINR(item.amount_paise) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Hint */}
              <p className="text-[10px] text-muted leading-5">
                This expense has not been saved yet. Review the details above, edit any field if
                needed, and click{' '}
                <span className="font-semibold text-ink">Confirm &amp; save expense</span>.
              </p>
            </section>
          ) : null}

          {formError ? (
            <div
              className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/[0.06] px-3.5 py-3 text-sm text-danger"
              role="alert"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{formError}</span>
            </div>
          ) : null}

          {typesQuery.loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-elevated px-3.5 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading expense types…
            </div>
          ) : typesQuery.error ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/25 bg-danger/[0.06] px-3.5 py-3 text-sm text-danger"
              role="alert"
            >
              <span>{typesQuery.error.message}</span>
              <Button type="button" size="sm" variant="secondary" onClick={typesQuery.refetch}>
                Retry
              </Button>
            </div>
          ) : null}

          {!typesQuery.loading && activeTypes.length === 0 && !expense ? (
            <div className="rounded-xl border border-primary/15 bg-primary-soft px-3.5 py-3 text-sm text-ink">
              <p className="font-medium">You need an expense type first.</p>
              <p className="mt-0.5 text-muted">
                Create one below without losing anything you have already typed.
              </p>
            </div>
          ) : null}

          <Field
            label="Expense type"
            htmlFor="expense-type"
            error={errors.expense_type_id?.message}
            hint={
              selectedType?.is_archived
                ? 'This type is archived. Existing expenses can still be edited, but archived types cannot be used for new expenses.'
                : undefined
            }
          >
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  id="expense-type"
                  data-autofocus={selectableTypes.length ? true : undefined}
                  aria-invalid={Boolean(errors.expense_type_id) || undefined}
                  {...register('expense_type_id')}
                >
                  <option value="">Select a type…</option>
                  {selectableTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                      {type.is_archived ? ' (archived)' : ''}
                    </option>
                  ))}
                  {!typesQuery.loading && selectableTypes.length === 0 ? (
                    <option value="" disabled>
                      No expense types yet
                    </option>
                  ) : null}
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => {
                  setShowQuickType((current) => !current)
                  setQuickError(null)
                }}
                aria-label={showQuickType ? 'Hide new type form' : 'Create a new expense type'}
                aria-expanded={showQuickType}
              >
                <Plus className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </Field>

          {showQuickType ? (
            <div
              className="rounded-[2rem] border border-line bg-elevated p-3.5"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleQuickCreate()
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">New expense type</p>
                <Badge tone="primary">Quick create</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                You can add an icon and colour later from Expense Types.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <Input
                  placeholder="e.g. Jio Recharge"
                  value={quickName}
                  onChange={(event) => setQuickName(event.target.value)}
                  maxLength={80}
                  aria-label="New expense type name"
                  aria-invalid={Boolean(quickError) || undefined}
                />
                <Select
                  value={quickCategory}
                  onChange={(event) => setQuickCategory(event.target.value as Category)}
                  aria-label="New expense type category"
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleQuickCreate()}
                  loading={quickSaving}
                >
                  Create type
                </Button>
              </div>
              {quickError ? (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  {quickError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (INR)" htmlFor="amount" error={errors.amount?.message}>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-subtle">
                  ₹
                </span>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="0.00"
                  className="pl-12 text-lg font-semibold"
                  aria-invalid={Boolean(errors.amount) || undefined}
                  {...register('amount')}
                />
              </div>
              <p className="tabular text-xs text-subtle">
                {parsedAmount !== null ? `You are entering ${formatINR(parsedAmount)}.` : 'Stored precisely in paise.'}
              </p>
            </Field>

            <Field label="Expense date" htmlFor="expense-date" error={errors.expense_date?.message}>
              <Input
                id="expense-date"
                type="date"
                aria-invalid={Boolean(errors.expense_date) || undefined}
                {...register('expense_date')}
              />
              <p className="text-xs text-subtle">Defaults to today in Asia/Kolkata.</p>
            </Field>
          </div>

          <Field
            label="Payment method"
            htmlFor="payment-method"
            optional
            error={errors.payment_method?.message}
          >
            <Select id="payment-method" {...register('payment_method')}>
              <option value="">Not specified</option>
              {PAYMENT_METHOD_OPTIONS.map((method) => (
                <option
                  key={method}
                  value={method}
                  {...(quickPrefs?.paymentMethod === method && { selected: true })}
                >
                  {method}
                </option>
              ))}
            </Select>
            <p className="text-xs text-subtle mt-1">
              {quickPrefs?.paymentMethod
                ? `Last used: ${quickPrefs.paymentMethod}`
                : 'Select a payment method'}
            </p>
          </Field>

          {bankAccounts.length > 0 ? (
            <Field
              label="Paid from account"
              htmlFor="expense-account"
              optional
              error={errors.account_id?.message}
            >
              <Select id="expense-account" {...register('account_id')}>
                <option value="">No account linked</option>
                {bankAccounts.map((account) => {
                  const accName = account.name || (account as any).account_name || 'Account'
                  const accMask = account.account_number_mask ? ` (${account.account_number_mask})` : ''
                  return (
                    <option key={account.id} value={String(account.id)}>
                      {accName}{accMask}
                    </option>
                  )
                })}
              </Select>
            </Field>
          ) : null}

          <Field label="Merchant or recipient" htmlFor="merchant" optional error={errors.merchant?.message}>
            <Input
              id="merchant"
              placeholder="e.g. Local cafe, Jio, City Bus"
              maxLength={120}
              aria-invalid={Boolean(errors.merchant) || undefined}
              {...register('merchant')}
            />
          </Field>

          <Field label="Note" htmlFor="note" optional error={errors.note?.message}>
            <Textarea
              id="note"
              placeholder="What was this expense for?"
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(errors.note) || undefined}
              {...register('note')}
            />
            <p className="text-right text-[11px] text-subtle">Up to 500 characters</p>
          </Field>
        </form>
      </Modal>

      {typeConfirmationOpen && scannedReceipt?.suggested_new_type_name ? (
        <TypeConfirmationDialog
          open={typeConfirmationOpen}
          suggestedTypeName={scannedReceipt.suggested_new_type_name}
          scannedReceipt={scannedReceipt}
          onCreateType={handleCreateTypeFromForm}
          onChooseExisting={handleChooseExistingFromForm}
          onCancel={handleCancelTypeConfirmation}
        />
      ) : null}

      {expense ? (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => void handleDelete()}
          loading={deleting}
          title="Delete this expense?"
          confirmLabel="Delete expense"
          description={
            <>
              <strong className="font-semibold text-ink">{formatINR(expense.amount_paise)}</strong>{' '}
              for {expense.expense_type.name} on {formatDate(expense.expense_date)} will be
              permanently removed.
              Dashboard totals and charts will update immediately. This cannot be undone.
            </>
          }
        />
      ) : null}
    </>
  )
}
