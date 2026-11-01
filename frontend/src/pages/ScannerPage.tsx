import {
  AlertCircle,
  Camera,
  Check,
  FlipHorizontal,
  Receipt,
  RefreshCw,
  Scan,
  ScanLine,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { useExpenseDialog } from '@/components/ExpenseDialogProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { api } from '@/services/api'
import { validateReceiptFile } from '@/utils/receipt'
import { cn } from '@/utils/cn'

type TabMode = 'camera' | 'upload' | 'text'

export function ScannerPage() {
  useDocumentTitle('Scan a receipt')
  const navigate = useNavigate()
  const { openWithReceipt } = useExpenseDialog()

  const [mode, setMode] = useState<TabMode>('upload')
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [manualText, setManualText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanStep, setScanStep] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [cameraError, setCameraError] = useState<string | null>(null)

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

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported on this device/browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera could not be started.'
      setCameraError(msg)
    } finally {
      setCameraLoading(false)
    }
  }, [facingMode, stopCamera])

  const handleTabChange = (nextMode: TabMode) => {
    setError(null)
    setMode(nextMode)
    if (nextMode === 'camera') {
      void startCamera()
    } else {
      stopCamera()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateReceiptFile(file)
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file')
      return
    }

    setError(null)
    setImageBlob(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    setCapturing(true)
    try {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context failed')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Failed to capture frame')
        stopCamera()
        setImageBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
      }, 'image/jpeg', 0.92)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture photo')
    } finally {
      setCapturing(false)
    }
  }

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setImageBlob(null)
    setError(null)
    if (mode === 'camera') {
      void startCamera()
    }
  }

  const handleProcess = async () => {
    setError(null)
    setScanning(true)
    try {
      let result = null
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
        setScanStep('Reading receipt image with AI…')
        result = await api.parseReceipt(imageBlob, 'both')
      }

      if (result) {
        navigate('/')
        openWithReceipt(result)
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Could not parse this receipt. Please try another image or enter manually.'
      setError(errorMessage)
    } finally {
      setScanning(false)
      setScanStep('')
    }
  }

  return (
    <div className="narrow-page space-y-5">
      <PageHeader
        eyebrow="SMART CAPTURE"
        title="Scan a receipt"
        description="Extract expense details from an image or receipt text."
        actions={
          <Button variant="ghost" onClick={() => navigate('/')}>
            <X className="h-4 w-4" aria-hidden />
            Close
          </Button>
        }
      />

      <div className="segmented scanner-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'camera'}
          className={mode === 'camera' ? 'active' : ''}
          onClick={() => handleTabChange('camera')}
        >
          Camera
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          className={mode === 'upload' ? 'active' : ''}
          onClick={() => handleTabChange('upload')}
        >
          Upload
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          className={mode === 'text' ? 'active' : ''}
          onClick={() => handleTabChange('text')}
        >
          Paste text
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.05] p-3 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="card p-6 space-y-4 text-center">
          <div className="relative mx-auto max-h-[380px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]">
            <img
              src={previewUrl}
              alt="Receipt preview"
              className={cn('max-h-[360px] w-full object-contain mx-auto', scanning && 'opacity-40 blur-[1px]')}
            />
            {scanning ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 backdrop-blur-sm text-white">
                <ScanLine className="h-8 w-8 animate-spin text-[var(--primary)]" aria-hidden />
                <span className="text-sm font-medium">{scanStep || 'Reading receipt…'}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={handleRetake} disabled={scanning}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Retake / Replace
            </Button>
            <Button onClick={() => void handleProcess()} loading={scanning} disabled={scanning}>
              <ScanLine className="h-4 w-4" aria-hidden />
              Scan & Extract Details
            </Button>
          </div>
        </div>
      ) : (
        <section className="card upload-zone">
          <span className="upload-icon">
            {mode === 'camera' ? (
              <Scan size={28} />
            ) : mode === 'text' ? (
              <Receipt size={28} />
            ) : (
              <Upload size={28} />
            )}
          </span>

          <h2>
            {mode === 'camera'
              ? 'Camera capture'
              : mode === 'text'
                ? 'Paste receipt text'
                : 'Upload a receipt'}
          </h2>

          <p>
            {mode === 'camera'
              ? 'Capture a clear photo of your printed bill or digital screen.'
              : mode === 'text'
                ? 'Copy the text from a digital receipt to extract details.'
                : 'Choose a JPG, PNG, or PDF up to 10 MB.'}
          </p>

          {mode === 'camera' ? (
            cameraError ? (
              <div className="space-y-3">
                <p className="text-xs text-danger">{cameraError}</p>
                <Button variant="secondary" size="sm" onClick={() => handleTabChange('upload')}>
                  Switch to Upload
                </Button>
              </div>
            ) : (
              <div className="space-y-3 w-full max-w-sm">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[var(--border)] bg-black">
                  {cameraLoading ? (
                    <div className="flex h-full items-center justify-center text-white text-xs">
                      Starting camera…
                    </div>
                  ) : (
                    <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="secondary" size="sm" onClick={() => void startCamera(facingMode === 'environment' ? 'user' : 'environment')}>
                    <FlipHorizontal className="h-4 w-4" />
                    Flip
                  </Button>
                  <Button onClick={capturePhoto} disabled={!cameraActive || capturing}>
                    <Camera className="h-4 w-4" />
                    Capture Photo
                  </Button>
                </div>
              </div>
            )
          ) : mode === 'text' ? (
            <div className="w-full flex flex-col items-center">
              <textarea
                placeholder="Paste receipt details here…"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
              <Button
                onClick={() => void handleProcess()}
                disabled={!manualText.trim() || scanning}
                loading={scanning}
              >
                Extract details
              </Button>

              <div className="w-full max-w-lg mt-6 pt-5 border-t border-[var(--border)] text-left">
                <span className="text-xs font-semibold text-[var(--muted)] block mb-2">
                  Or test with a sample receipt:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setManualText(
                        'Cafe Coffee Day\nConnaught Place, New Delhi\nDate: 31-10-2026\n1x Cappuccino ₹180\n1x Choco Brownie ₹120\nTotal: ₹300.00\nPayment: UPI',
                      )
                    }
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--primary-soft)] hover:text-primary transition-colors text-text"
                  >
                    ☕ Cafe Bill (₹300)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setManualText(
                        'Reliance Smart Superstore\nDate: 30-Oct-2026\nProvisions & Groceries\nSubtotal: ₹800.00\nGST: ₹40.00\nGrand Total: ₹840.00\nPayment: UPI',
                      )
                    }
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--primary-soft)] hover:text-primary transition-colors text-text"
                  >
                    🛒 Grocery Invoice (₹840)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setManualText(
                        'Indian Oil Retail Outlet\nDate: 29/10/2026\nPetrol (MS) 4.8L\nTotal: ₹500.00\nTxn ID: IOCL7492104\nPayment: UPI',
                      )
                    }
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--primary-soft)] hover:text-primary transition-colors text-text"
                  >
                    ⛽ Fuel Slip (₹500)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Choose file
              </Button>
            </div>
          )}
        </section>
      )}

      <div className="privacy-note">
        <Check size={16} />
        <span>Receipts are processed locally and aren’t uploaded to the cloud.</span>
      </div>
    </div>
  )
}
