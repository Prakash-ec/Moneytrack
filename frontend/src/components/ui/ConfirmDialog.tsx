import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
            tone === 'danger'
              ? 'border-danger/25 bg-danger-soft/60 text-danger'
              : 'border-primary/20 bg-primary-soft/60 text-primary'
          }`}
        >
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </div>
        <div className="text-sm leading-7 text-muted">{description}</div>
      </div>
    </Modal>
  )
}
