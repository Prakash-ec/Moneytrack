import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/Button'

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Intentionally avoid logging financial data or transaction notes.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
            <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              The screen could not be displayed. Your saved records are not affected. Reload to
              try again.
            </p>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Reload MoneyTrack
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
