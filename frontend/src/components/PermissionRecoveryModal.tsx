import React from 'react'
import { AlertTriangle, Bell, Camera, MessageSquare } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  PERMISSION_METADATA,
  type PermissionType,
  requestAppPermission,
} from '@/services/permissions'

interface PermissionRecoveryModalProps {
  open: boolean
  permissionType: PermissionType
  onClose: () => void
  onGranted?: () => void
}

export function PermissionRecoveryModal({
  open,
  permissionType,
  onClose,
  onGranted,
}: PermissionRecoveryModalProps) {
  const [requesting, setRequesting] = React.useState(false)
  const [deniedPermanently, setDeniedPermanently] = React.useState(false)
  const meta = PERMISSION_METADATA[permissionType]

  const getIcon = () => {
    switch (permissionType) {
      case 'notifications':
        return <Bell className="h-6 w-6 text-amber-400" />
      case 'sms':
        return <MessageSquare className="h-6 w-6 text-indigo-400" />
      case 'camera':
        return <Camera className="h-6 w-6 text-emerald-400" />
    }
  }

  const handleRequest = async () => {
    setRequesting(true)
    const success = await requestAppPermission(permissionType)
    setRequesting(false)
    if (success) {
      onGranted?.()
      onClose()
    } else {
      setDeniedPermanently(true)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={meta.title}
      description={meta.rationale}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Not Now
          </Button>
          {!deniedPermanently ? (
            <Button
              variant="primary"
              onClick={handleRequest}
              disabled={requesting}
            >
              {requesting ? 'Requesting...' : 'Grant Access'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Got It
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-2 text-sm text-muted">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-card/60 p-3.5 border border-line/60">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface/80 border border-line">
            {getIcon()}
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-ink">Why MoneyTrack needs this</h4>
            <p className="text-xs leading-5 text-muted">{meta.whyNeeded}</p>
          </div>
        </div>

        {deniedPermanently && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-300 text-xs">
              <AlertTriangle className="h-4 w-4" />
              <span>Permission Denied by System</span>
            </div>
            <p className="text-xs leading-5 text-amber-200/90">{meta.recoveryGuide}</p>
          </div>
        )}

        <div className="rounded-2xl border border-line/40 bg-surface/30 p-3.5">
          <p className="text-xs leading-5 text-muted">
            <span className="font-semibold text-ink">Fallback: </span>
            {meta.fallbackNote}
          </p>
        </div>
      </div>
    </Modal>
  )
}
