import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCcw, RotateCw, WifiOff } from 'lucide-react'
import { isChunkLoadError, reportFrontendError } from '../lib/errorReporting'

export interface ErrorBoundaryProps {
  children: ReactNode
  boundaryName?: string
  fallbackTitle?: string
  fallbackMessage?: string
  compact?: boolean
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  componentStack: string | null
  isChunk: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      isChunk: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      isChunk: isChunkLoadError(error),
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null })

    // Log the original error and component stack with useful context
    reportFrontendError(error, {
      operation: 'error_boundary_catch',
      componentStack: errorInfo.componentStack || undefined,
      context: {
        boundaryName: this.props.boundaryName || 'UnnamedBoundary',
        isChunkLoad: isChunkLoadError(error),
      },
    })
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      isChunk: false,
    })
    this.props.onReset?.()
  }

  handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { compact, boundaryName, fallbackTitle, fallbackMessage } = this.props
      const { error, componentStack, isChunk } = this.state

      const isDev = Boolean(import.meta.env?.DEV)

      const title = fallbackTitle || (isChunk ? 'Failed to load component' : 'Something went wrong')
      const message = fallbackMessage || (
        isChunk
          ? 'A network interruption or updated version prevented this feature from loading. Try again to resume.'
          : 'An unexpected problem occurred while rendering this section.'
      )

      const Icon = isChunk ? WifiOff : AlertTriangle

      return (
        <div
          className={`error-boundary-container ${compact ? 'compact' : ''}`}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          data-boundary={boundaryName}
        >
          <div className="error-boundary-icon" aria-hidden="true">
            <Icon size={compact ? 18 : 26} />
          </div>

          <h2 className="error-boundary-heading">{title}</h2>
          <p className="error-boundary-message">{message}</p>

          <div className="error-boundary-actions">
            <button
              type="button"
              className="error-boundary-retry-btn"
              onClick={this.handleReset}
              aria-label="Try rendering this component again"
            >
              <RotateCw size={compact ? 13 : 15} aria-hidden="true" />
              <span>Try again</span>
            </button>

            <button
              type="button"
              className="error-boundary-reload-btn"
              onClick={this.handleReload}
              aria-label="Reload the application"
            >
              <RefreshCcw size={compact ? 13 : 15} aria-hidden="true" />
              <span>Reload application</span>
            </button>
          </div>

          {isDev && error && (
            <details className="error-boundary-details">
              <summary>Technical details (Development only)</summary>
              <pre>{error.toString()}</pre>
              {componentStack && <pre>{componentStack}</pre>}
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
