export type NormalizedError = {
  name: string
  message: string
  stack?: string
  status?: number
  requestId?: string
  isChunkError?: boolean
}

export type FrontendErrorReport = {
  operation: string
  pathname: string
  timestamp: string
  error: NormalizedError
  context?: Record<string, unknown>
}

const MAX_STORED_ERRORS = 30
const recentErrors: FrontendErrorReport[] = []

/**
 * Checks whether an error represents a chunk load failure
 * (e.g. after a deployment or during intermittent connectivity).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as Record<string, unknown>
  const name = String(err.name || '')
  const message = String(err.message || '')
  return (
    name === 'ChunkLoadError'
    || /loading (chunk|css chunk)/i.test(message)
    || /failed to fetch dynamically imported module/i.test(message)
    || /error loading dynamically imported module/i.test(message)
  )
}

/**
 * Strips sensitive keys and values to ensure no tokens, passwords, customer
 * identity, request bodies, or environment secrets are exposed in logs.
 */
function sanitizeContext(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined

  const sensitivePattern = /token|password|auth|secret|credential|cookie|key|imei|phone|email|identity|body/i
  const sanitized: Record<string, unknown> = {}

  for (const [key, val] of Object.entries(data)) {
    if (sensitivePattern.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof val === 'string' && val.length > 200) {
      sanitized[key] = `${val.slice(0, 197)}...`
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeContext(val as Record<string, unknown>)
    } else {
      sanitized[key] = val
    }
  }

  return sanitized
}

/**
 * Normalizes any caught value into a clean, safe error structure.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const isChunk = isChunkLoadError(error)
    const err = error as Error & { status?: number; requestId?: string }
    return {
      name: err.name || 'Error',
      message: err.message || 'An unexpected error occurred',
      stack: import.meta.env.DEV ? err.stack : undefined,
      status: typeof err.status === 'number' ? err.status : undefined,
      requestId: typeof err.requestId === 'string' ? err.requestId : undefined,
      isChunkError: isChunk,
    }
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      isChunkError: false,
    }
  }

  return {
    name: 'UnknownError',
    message: 'An unknown error occurred',
    isChunkError: false,
  }
}

/**
 * Records a frontend error with operation, pathname, timestamp, and sanitized details.
 * Does not transmit data to external services.
 */
export function reportFrontendError(
  error: unknown,
  details: {
    operation: string
    componentStack?: string
    context?: Record<string, unknown>
  },
): FrontendErrorReport {
  const normalized = normalizeError(error)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const timestamp = new Date().toISOString()

  const safeContext = sanitizeContext({
    ...details.context,
    ...(details.componentStack ? { componentStack: details.componentStack } : {}),
  })

  const report: FrontendErrorReport = {
    operation: details.operation,
    pathname,
    timestamp,
    error: normalized,
    context: safeContext,
  }

  recentErrors.unshift(report)
  if (recentErrors.length > MAX_STORED_ERRORS) {
    recentErrors.pop()
  }

  // Useful console context without leaking private information
  if (typeof console !== 'undefined' && console.error) {
    console.error(`[PhoneFlow:${details.operation}]`, normalized.message, {
      pathname,
      status: normalized.status,
      requestId: normalized.requestId,
      isChunkError: normalized.isChunkError,
      stack: normalized.stack,
      context: safeContext,
    })
  }

  return report
}

export function getRecentFrontendErrors(): readonly FrontendErrorReport[] {
  return recentErrors
}
