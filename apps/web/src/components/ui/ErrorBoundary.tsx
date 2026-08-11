import { Component, type ErrorInfo, type ReactNode } from 'react'
import {
  AlertOctagon,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  LifeBuoy,
  RotateCcw,
} from 'lucide-react'

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((props: { error: Error; errorId: string; reset: () => void }) => ReactNode)
  onReset?: () => void
  onError?: (error: Error, errorInfo: ErrorInfo, errorId: string) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorId: string | null
  isDetailsOpen: boolean
  copied: boolean
}

/**
 * React ErrorBoundary Component.
 *
 * Features:
 * - Catches unhandled JavaScript render errors in child component trees.
 * - Generates unique Support Error ID (e.g. ERR-9F4A12B8).
 * - Optional Sentry error reporting integration (detects window.Sentry).
 * - Dark ML Dashboard styled fallback UI with ambient neon glow.
 * - 1-Click Support ID copy tool.
 * - Collapsible technical stack trace details.
 * - Retry/Reset button that re-mounts children cleanly.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorId: null,
    isDetailsOpen: false,
    copied: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorId = `ERR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    this.setState({ errorId })

    // Optional Sentry Error Reporting Integration
    if (typeof window !== 'undefined') {
      const windowWithSentry = window as unknown as {
        Sentry?: {
          captureException: (err: Error, options?: Record<string, unknown>) => void
        }
      }
      if (windowWithSentry.Sentry?.captureException) {
        try {
          windowWithSentry.Sentry.captureException(error, {
            tags: { errorId },
            extra: { componentStack: errorInfo.componentStack },
          })
        } catch {
          // Ignore Sentry dispatch failure
        }
      }
    }

    if (this.props.onError) {
      this.props.onError(error, errorInfo, errorId)
    }
  }

  private handleReset = (): void => {
    if (this.props.onReset) {
      this.props.onReset()
    }
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      isDetailsOpen: false,
      copied: false,
    })
  }

  private copyErrorId = (): void => {
    if (this.state.errorId) {
      navigator.clipboard.writeText(this.state.errorId)
      this.setState({ copied: true })
      setTimeout(() => {
        this.setState({ copied: false })
      }, 2000)
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      const { error, errorId, isDetailsOpen, copied } = this.state
      const { fallback } = this.props

      // Custom fallback function or node
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback({
            error: error || new Error('Unknown Error'),
            errorId: errorId || 'ERR-UNKNOWN',
            reset: this.handleReset,
          })
        }
        return fallback
      }

      // Default Dark ML Dashboard Fallback UI
      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6 bg-[#070E1C]/90 text-slate-100 font-sans antialiased">
          <div className="max-w-xl w-full rounded-2xl border border-[rgba(255,77,77,0.3)] bg-[#0C1A30]/95 p-6 md:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Ambient Red Glow Filter */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-[#FF4D4D]/10 blur-3xl pointer-events-none" />

            {/* Header Icon & Title */}
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-[#1C0B12] border border-[#FF4D4D]/40 flex items-center justify-center text-[#FF4D4D] shrink-0 shadow-[0_0_20px_rgba(255,77,77,0.25)]">
                <AlertOctagon className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">
                    ML Application Error Encountered
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FF4D4D]/15 text-[#FF4D4D] border border-[#FF4D4D]/30">
                    RUNTIME FAULT
                  </span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  An unhandled exception occurred in the ML Playground execution canvas. Diagnostic telemetry has logged this event.
                </p>
              </div>
            </div>

            {/* Support Error ID Bar */}
            <div className="p-3 rounded-xl bg-[#081224] border border-[rgba(0,212,255,0.1)] flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2 min-w-0">
                <LifeBuoy className="w-4 h-4 text-[#00D4FF] shrink-0" />
                <span className="text-xs text-[#64748B]">Support ID:</span>
                <code className="text-xs font-mono font-bold text-[#00D4FF] truncate select-all">
                  {errorId || 'ERR-PENDING'}
                </code>
              </div>

              <button
                onClick={this.copyErrorId}
                className="px-2.5 py-1 rounded-lg bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="Copy Support Error ID"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#00F5A0]" />
                    <span className="text-[#00F5A0]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>

            {/* Collapsible Technical Error Details Accordion */}
            {error && (
              <div className="mb-6 border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden bg-[#050A14]">
                <button
                  onClick={() => this.setState((prev) => ({ isDetailsOpen: !prev.isDetailsOpen }))}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-[#94A3B8] hover:text-slate-200 bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="font-mono text-[11px] flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    Technical Details: {error.name || 'Error'}
                  </span>
                  {isDetailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isDetailsOpen && (
                  <div className="p-4 border-t border-[rgba(255,255,255,0.06)] overflow-x-auto max-h-48">
                    <p className="text-xs font-mono text-rose-300 font-semibold mb-2">{error.message}</p>
                    {error.stack && (
                      <pre className="text-[10px] font-mono text-[#64748B] whitespace-pre-wrap leading-relaxed">
                        {error.stack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#94A3B8] hover:text-slate-100 hover:bg-white/5 border border-transparent transition-all cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>

              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#070E1C] bg-[#00D4FF] hover:bg-[#38E0FF] shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all cursor-pointer flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Canvas</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
