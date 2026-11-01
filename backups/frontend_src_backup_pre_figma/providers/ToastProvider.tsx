import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
}

interface ToastItem extends ToastInput {
  id: number
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const MAX_TOASTS = 3

const icons = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

const tones: Record<ToastVariant, string> = {
  success: 'border-positive/30 bg-surface text-ink',
  error: 'border-danger/35 bg-surface text-ink',
  info: 'border-line bg-surface text-ink',
}

const iconTones: Record<ToastVariant, string> = {
  success: 'text-positive',
  error: 'text-danger',
  info: 'text-primary',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({ title, description, variant = 'success' }: ToastInput) => {
      counter.current += 1
      const id = counter.current
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, title, description, variant }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 top-3 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.variant]
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lift animate-slide-up ${tones[toast.variant]}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTones[toast.variant]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-sm text-muted">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-lg p-1 text-subtle transition hover:bg-elevated hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
