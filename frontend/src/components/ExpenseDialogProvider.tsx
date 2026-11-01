import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { Expense, ReceiptParseResult } from '@/types/api'

const ExpenseForm = lazy(() =>
  import('@/components/ExpenseForm').then((module) => ({ default: module.ExpenseForm })),
)
const ReceiptScannerModal = lazy(() =>
  import('@/components/ReceiptScannerModal').then((module) => ({
    default: module.ReceiptScannerModal,
  })),
)
const TypeConfirmationDialog = lazy(() =>
  import('@/components/TypeConfirmationDialog').then((module) => ({
    default: module.TypeConfirmationDialog,
  })),
)

export interface InitialExpensePrefill {
  initialTypeId?: number
  amount?: string
  merchant?: string
  note?: string
  payment_method?: string
}

interface ExpenseDialogContextValue {
  openCreate: (initialPrefill?: number | InitialExpensePrefill) => void
  openEdit: (expense: Expense) => void
  openScanReceipt: () => void
  openWithReceipt: (result: ReceiptParseResult) => void
}

interface DialogState {
  key: number
  expense: Expense | null
  initialTypeId?: number
  prefill?: InitialExpensePrefill
  scannedReceipt?: ReceiptParseResult | null
}

interface TypeConfirmationState {
  scannedReceipt: ReceiptParseResult
  suggestedTypeName: string
}

const ExpenseDialogContext = createContext<ExpenseDialogContextValue | null>(null)

export function ExpenseDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [typeConfirmation, setTypeConfirmation] = useState<TypeConfirmationState | null>(null)

  const openCreate = useCallback((initialPrefill?: number | InitialExpensePrefill) => {
    if (typeof initialPrefill === 'number') {
      setDialog({ key: Date.now(), expense: null, initialTypeId: initialPrefill })
    } else if (initialPrefill) {
      setDialog({
        key: Date.now(),
        expense: null,
        initialTypeId: initialPrefill.initialTypeId,
        prefill: initialPrefill,
      })
    } else {
      setDialog({ key: Date.now(), expense: null })
    }
  }, [])

  const openEdit = useCallback((expense: Expense) => {
    setDialog({ key: Date.now(), expense })
  }, [])

  const openScanReceipt = useCallback(() => {
    setScannerOpen(true)
  }, [])

  const closeDialog = useCallback(() => setDialog(null), [])
  const closeScanner = useCallback(() => setScannerOpen(false), [])

  const handleReceiptParsed = useCallback((result: ReceiptParseResult | null) => {
    // If the parser proposes a brand-new type and no existing type matches,
    // ask the user to confirm creation before opening the expense form.
    if (result && result.suggested_new_type_name && !result.suggested_expense_type_id) {
      setScannerOpen(false)
      setTypeConfirmation({
        scannedReceipt: result,
        suggestedTypeName: result.suggested_new_type_name,
      })
      return
    }
    setScannerOpen(false)
    setDialog({
      key: Date.now(),
      expense: null,
      scannedReceipt: result,
      initialTypeId: result?.suggested_expense_type_id ?? undefined,
    })
  }, [])

  const handleCreateType = useCallback(
    async (newTypeId: number) => {
      const scannedReceipt = typeConfirmation?.scannedReceipt
      setTypeConfirmation(null)
      setDialog({
        key: Date.now(),
        expense: null,
        // Mark the newly created type as the suggested one so the review form
        // does not re-prompt for type creation.
        scannedReceipt: scannedReceipt
          ? {
              ...scannedReceipt,
              suggested_expense_type_id: newTypeId,
              suggested_expense_type_name: null,
              suggested_new_type_name: null,
            }
          : null,
        initialTypeId: newTypeId,
      })
    },
    [typeConfirmation?.scannedReceipt],
  )

  const handleChooseExisting = useCallback(() => {
    setTypeConfirmation(null)
    setDialog({
      key: Date.now(),
      expense: null,
      scannedReceipt: typeConfirmation?.scannedReceipt ?? null,
      initialTypeId: undefined,
    })
  }, [typeConfirmation?.scannedReceipt])

  const value = useMemo(
    () => ({ openCreate, openEdit, openScanReceipt, openWithReceipt: handleReceiptParsed }),
    [openCreate, openEdit, openScanReceipt, handleReceiptParsed],
  )

  return (
    <ExpenseDialogContext.Provider value={value}>
      {children}

      {typeConfirmation ? (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
              aria-busy="true"
              aria-label="Opening expense type confirmation"
            >
              <div className="absolute inset-0 bg-navy/55 backdrop-blur-[2px]" />
              <div className="relative w-full rounded-t-3xl border border-line bg-surface p-6 text-center shadow-lift sm:max-w-lg sm:rounded-2xl">
                <p className="text-sm font-medium text-muted">Preparing expense type…</p>
              </div>
            </div>
          }
        >
          <TypeConfirmationDialog
            open={Boolean(typeConfirmation)}
            suggestedTypeName={typeConfirmation.suggestedTypeName}
            scannedReceipt={typeConfirmation.scannedReceipt}
            onCreateType={handleCreateType}
            onChooseExisting={handleChooseExisting}
            onCancel={() => {
              setTypeConfirmation(null)
              closeScanner()
            }}
          />
        </Suspense>
      ) : null}

      {dialog ? (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
              aria-busy="true"
              aria-label="Opening expense form"
            >
              <div className="absolute inset-0 bg-navy/55 backdrop-blur-[2px]" />
              <div className="relative w-full rounded-t-3xl border border-line bg-surface p-6 text-center shadow-lift sm:max-w-lg sm:rounded-2xl">
                <p className="text-sm font-medium text-muted">Opening expense form…</p>
              </div>
            </div>
          }
        >
          <ExpenseForm
            key={dialog.key}
            expense={dialog.expense}
            initialTypeId={dialog.initialTypeId}
            scannedReceipt={dialog.scannedReceipt}
            onOpenScan={openScanReceipt}
            onClose={closeDialog}
          />
        </Suspense>
      ) : null}

      {!typeConfirmation && scannerOpen ? (
        <Suspense fallback={null}>
          <ReceiptScannerModal
            open={scannerOpen}
            onClose={closeScanner}
            onParsed={handleReceiptParsed}
          />
        </Suspense>
      ) : null}
    </ExpenseDialogContext.Provider>
  )
}

export function useExpenseDialog(): ExpenseDialogContextValue {
  const value = useContext(ExpenseDialogContext)
  if (!value) throw new Error('useExpenseDialog must be used inside ExpenseDialogProvider')
  return value
}
