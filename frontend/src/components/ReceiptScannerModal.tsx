import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileText,
  FlipHorizontal,
  Image as ImageIcon,
  RefreshCw,
  Receipt,
  ScanLine,
  Sparkles,
  Upload,
  Zap,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/services/api'
import type { ReceiptParseResult } from '@/types/api'
import { cn } from '@/utils/cn'
import { validateReceiptFile } from '@/utils/receipt'

type Mode = 'camera' | 'upload' | 'text'
type ScanMode = 'ocr' | 'groq' | 'both'

interface ReceiptScannerModalProps {
  open: boolean
  onClose: () => void
  onParsed: (result: ReceiptParseResult | null) => void
}

interface ModeTab {
  id: Mode
  label: string
  icon: React.ElementType
}

const MODE_TABS: ModeTab[] = [
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'text', label: 'Paste Text', icon: FileText },
]

const SCAN_MODES: ScanMode[] = ['ocr', 'groq', 'both']

const scanModeLabels: Record<ScanMode, { label: string; desc: string }> = {
  ocr: { label: 'OCR', desc: 'Local text extraction' },
  groq: { label: 'Groq AI', desc: 'AI vision parsing' },
  both: { label: 'Both', desc: 'OCR + AI vision' },
}

export function ReceiptScannerModal({ open, onClose, onParsed }: ReceiptScannerModalProps) {
  const [mode, setMode] = useState<Mode>('upload')
  const [scanMode, setScanMode] = useState<ScanMode>('both')
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [manualText, setManualText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanStep, setScanStep] = useState<string>('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const isSecureContext = typeof window !== 'undefined' && window.isSecureContext
  const hasGetUserMedia =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setCameraLoading(false)
    setCameraError(null)
  }, [])

  const startCamera = useCallback(async (nextFacing?: 'environment' | 'user') => {
    const facing = nextFacing ?? facingMode
    if (nextFacing) setFacingMode(nextFacing)
    stopCamera()
    setCameraError(null)
    setCameraLoading(true)
    setTorchSupported(false)
    setTorchOn(false)

    if (!isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setCameraError(
        'Browsers require an HTTPS connection to access the camera directly. ' +
          'Please use the Upload tab to take a photo using your device’s native camera.',
      )
      setCameraLoading(false)
      return
    }

    if (!hasGetUserMedia) {
      setCameraError('Camera access is not supported by this browser. Please use the Upload tab.')
      setCameraLoading(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorchSupported(Boolean(caps.torch))
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err) {
      let msg = 'Could not access the camera.'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Camera permission was denied. Please allow camera access or upload an image.'
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'No camera found on this device. Please upload an image instead.'
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = 'The camera is in use by another application.'
        }
      }
      setCameraError(msg)
      setCameraActive(false)
    } finally {
      setCameraLoading(false)
    }
  }, [facingMode, hasGetUserMedia, isSecureContext, stopCamera])

  useEffect(() => {
    return () => {
      stopCamera()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl, stopCamera])

  const handleClose = () => {
    stopCamera()
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setImageBlob(null)
    setManualText('')
    setError(null)
    onClose()
  }

  const handleModeChange = (newMode: Mode) => {
    if (newMode === mode) return
    setMode(newMode)
    setError(null)
    setImageBlob(null)
    setPreviewUrl(null)
    setManualText('')
    if (newMode === 'camera') {
      void startCamera()
    } else {
      stopCamera()
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || capturing) return
    const video = videoRef.current
    if (!video.videoWidth || !video.videoHeight) return
    setCapturing(true)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setCapturing(false)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        setCapturing(false)
        if (blob) {
          stopCamera()
          setImageBlob(blob)
          setPreviewUrl(URL.createObjectURL(blob))
        }
      },
      'image/jpeg',
      0.95,
    )
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const validation = validateReceiptFile(file)
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid receipt image.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setError(null)
    setImageBlob(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageBlob(null)
    setPreviewUrl(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (mode === 'camera') {
      void startCamera()
    }
  }

  const handleProcess = async () => {
    setScanning(true)
    setError(null)

    if (mode === 'text') {
      setScanStep('Parsing receipt text…')
    } else if (scanMode === 'ocr') {
      setScanStep('Running local OCR…')
    } else if (scanMode === 'groq') {
      setScanStep('Consulting Groq AI vision…')
    } else {
      setScanStep('Running OCR + Groq AI…')
    }

    try {
      let result: ReceiptParseResult | null = null
      if (mode === 'text') {
        const textToParse = manualText.trim()
        if (!textToParse) {
          setError('Please paste or type the receipt text first.')
          setScanning(false)
          return
        }
        setScanStep('Extracting expense details…')
        result = await api.parseReceiptText(textToParse)
      } else {
        if (!imageBlob) {
          setError('Please take a photo or upload an image first.')
          setScanning(false)
          return
        }
        result = await api.parseReceipt(imageBlob, scanMode)
      }

      // Only proceed if we have a valid result
      if (result) {
        handleClose()
        onParsed(result)
      }
    } catch (err) {
      // Ensure we always set a valid error message
      const errorMessage = err instanceof Error ? err.message : 'Could not parse this receipt. Please try another image or enter manually.'
      setError(errorMessage)
      // Re-throw to allow ErrorBoundary to catch if needed, but only if not already handled
    } finally {
      setScanning(false)
      setScanStep('')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Scan Receipt"
      description="Capture or upload a receipt to automatically extract merchant, date, amount, and category."
      size="md"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={scanning}>
            Cancel
          </Button>

          {(previewUrl || (mode === 'text' && manualText.trim())) ? (
            <Button
              type="button"
              onClick={() => void handleProcess()}
              loading={scanning}
              disabled={scanning}
              className="w-full sm:w-auto"
            >
              {scanning ? (
                <>
                  <ScanLine className="h-4 w-4 animate-spin" aria-hidden />
                  Reading receipt…
                </>
              ) : (
                <>
                  <ScanLine className="h-4 w-4" aria-hidden />
                  {mode === 'text' ? 'Extract Expense Details' : 'Scan & Extract'}
                </>
              )}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ===== AI SCAN MODE (applies to Camera, Upload, and Paste Text) ===== */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
              AI scan mode
            </span>
            <span className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">
              Applies to all input modes
            </span>
          </div>
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {SCAN_MODES.map((sm) => {
              const active = scanMode === sm
              const { label, desc } = scanModeLabels[sm]
              return (
                <button
                  key={sm}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setScanMode(sm)}
                  className={cn(
                    'flex-1 flex flex-col items-center justify-center rounded-md py-2 px-1.5 text-xs font-semibold transition',
                    active
                      ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)]',
                  )}
                >
                  <span className="mb-0.5 font-bold">{label}</span>
                  <span className="text-[9px] text-[var(--muted)] leading-none">{desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== MODE SWITCHER (Camera / Upload / Paste Text) ===== */}
        {!previewUrl ? (
          <div className="segmented scanner-tabs w-full flex" role="tablist">
            {MODE_TABS.map((tab) => {
              const active = mode === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleModeChange(tab.id)}
                  className={cn('flex-1 text-xs font-semibold py-1.5', active ? 'active' : '')}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        ) : null}

        {/* ===== ERROR BANNER ===== */}
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.05] p-3 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {/* ===== PREVIEW STATE (after capture/upload) ===== */}
        {previewUrl ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <img
                src={previewUrl}
                alt="Captured receipt"
                className={cn('max-h-[360px] w-full object-contain transition', scanning && 'opacity-40 blur-[1px]')}
              />
              {scanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/35 backdrop-blur-md rounded-2xl">
                  <div className="relative h-12 w-12">
                    <ScanLine className="h-10 w-10 animate-spin text-primary" aria-hidden />
                    <div className="absolute -inset-px rounded-full border-2 border-primary/40 animate-ping" />
                  </div>
                  <span className="text-sm font-medium text-white">{scanStep || 'Reading receipt…'}</span>
                  <span className="text-xs text-white/70">This can take a few seconds</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleRetake}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/80"
                aria-label="Remove and retake image"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-positive" aria-hidden />
                Image ready to scan
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={handleRetake} disabled={scanning}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Retake / Replace
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ===== CAMERA MODE ===== */}
            {mode === 'camera' ? (
              <div className="space-y-3">
                {cameraError ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/[0.08] p-4 text-xs text-warning space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      <div>
                        <p className="font-semibold text-ink">Camera not available</p>
                        <p className="leading-5 text-muted">{cameraError}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleModeChange('upload')}
                      className="mt-3 w-full"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden />
                      Switch to file upload
                    </Button>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-line bg-navy/95 text-white">
                    {cameraLoading ? (
                      <div className="flex aspect-[3/4] w-full items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
                          <span className="text-sm text-white/80">Starting camera…</span>
                        </div>
                      </div>
                    ) : (
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="aspect-[3/4] w-full object-cover"
                      />
                    )}

                    {!cameraLoading ? (
                      <div className="pointer-events-none absolute inset-4 md:inset-8 rounded-[28px] border-2 border-dashed border-white/40 bg-black/10">
                        <div className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white text-[10px] font-bold tracking-wider uppercase">
                          SCAN
                        </div>
                        <div className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white text-[10px] font-bold tracking-wider uppercase">
                          RECEIPT
                        </div>
                        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-white/60" />
                        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-white/60" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-white/60" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-white/60" />
                      </div>
                    ) : null}

                    <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-6 px-4 z-20">
                      <button
                        type="button"
                        onClick={() => {
                          const next = facingMode === 'environment' ? 'user' : 'environment'
                          void startCamera(next)
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30"
                        title="Flip camera"
                        aria-label="Flip camera"
                        disabled={cameraLoading || !cameraActive}
                      >
                        <FlipHorizontal className="h-5 w-5" aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={capturePhoto}
                        disabled={!cameraActive || capturing || cameraLoading}
                        className="relative flex h-18 w-18 items-center justify-center rounded-full border-5 border-white bg-primary text-white shadow-lift transition hover:scale-105 active:scale-95 disabled:opacity-50"
                        aria-label="Take receipt photo"
                      >
                        <div className="absolute inset-0 rounded-full border-4 border-white/40 animate-ping" />
                        {capturing ? (
                          <div className="h-8 w-8 animate-spin rounded-full border-3 border-white/30 border-t-white" />
                        ) : (
                          <Camera className="h-8 w-8" aria-hidden />
                        )}
                      </button>

                      {torchSupported ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const track = streamRef.current?.getVideoTracks()[0]
                            if (!track) return
                            const next = !torchOn
                            try {
                              await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
                              setTorchOn(next)
                            } catch {
                              /* ignore */
                            }
                          }}
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition',
                            torchOn ? 'bg-amber-400/90 text-navy' : 'bg-white/20 text-white hover:bg-white/30',
                          )}
                          title={torchOn ? 'Turn flash off' : 'Turn flash on'}
                          aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
                          disabled={cameraLoading || !cameraActive}
                        >
                          <Zap className="h-5 w-5" aria-hidden />
                        </button>
                      ) : (
                        <div className="w-10" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* ===== UPLOAD MODE ===== */}
            {mode === 'upload' ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface p-10 text-center transition hover:border-primary/60 hover:bg-primary-soft/50 cursor-pointer"
                >
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <ImageIcon className="h-8 w-8" aria-hidden />
                    <div className="absolute -inset-px rounded-2xl border border-primary/30 animate-ping" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">Choose a receipt image</p>
                    <p className="mt-1 text-xs text-muted">JPEG, PNG, or WebP up to 10MB</p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" className="mt-2 pointer-events-none">
                    <Upload className="h-4 w-4" aria-hidden />
                    Select from device
                  </Button>
                </div>
              </div>
            ) : null}

            {/* ===== PASTE TEXT MODE (Scan Receipt Text with AI) ===== */}
            {mode === 'text' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-sm font-semibold text-ink">Scan Receipt Text with AI</span>
                </div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted" aria-hidden />
                  <label htmlFor="receipt-manual-text" className="text-xs font-medium text-ink">
                    Paste receipt text
                  </label>
                </div>
                <textarea
                  id="receipt-manual-text"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="e.g.\nBUS SERVICE\nDate: 20-10-2026\nTOTAL RS: 12\nRoute: REDHILLS TO RASIPURAM\n149600"
                  rows={8}
                  className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <p className="text-[11px] text-muted">
                  Paste text copied from a receipt, invoice, or printed bill. Groq AI extracts the
                  merchant, date, amount, category, and payment method; nothing is saved until you
                  confirm in the review form.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}
