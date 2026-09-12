import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Polyfill crypto.randomUUID if missing in jsdom environment
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => 'mock-uuid-' + Math.random().toString(36).slice(2, 11),
    },
    configurable: true,
  })
}

// Deterministic mock for window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Deterministic mock for ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})

// Deterministic mock for IntersectionObserver
class MockIntersectionObserver {
  root = null
  rootMargin = ''
  thresholds = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn().mockReturnValue([])
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// Deterministic mocks for scrolling
window.scrollTo = vi.fn()
Element.prototype.scrollIntoView = vi.fn()

// Polyfill HTMLDialogElement for jsdom if needed
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || function(this: HTMLDialogElement) {
    this.open = true
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function(this: HTMLDialogElement) {
    this.open = false
    this.removeAttribute('open')
  }
}

// Deterministic mocks for printing and popup windows
window.print = vi.fn()
window.alert = vi.fn()
window.open = vi.fn().mockImplementation(() => {
  const mockDoc = {
    write: vi.fn(),
    close: vi.fn(),
    body: document.createElement('body'),
    head: document.createElement('head'),
  }
  return {
    document: mockDoc,
    print: vi.fn(),
    close: vi.fn(),
    focus: vi.fn(),
    location: { href: '' },
  } as unknown as Window
})

// Deterministic mock for html5-qrcode camera/barcode scanner
vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: class {
      isScanning = false
      start = vi.fn().mockResolvedValue(undefined)
      stop = vi.fn().mockResolvedValue(undefined)
      clear = vi.fn().mockResolvedValue(undefined)
    },
    Html5QrcodeSupportedFormats: {
      CODE_128: 1,
      CODE_39: 2,
      QR_CODE: 3,
      DATA_MATRIX: 4,
    },
  }
})

import { clearInFlightRequests } from '../lib/api'

// Clean up and reset shared state after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
  localStorage.clear()
  sessionStorage.clear()
  clearInFlightRequests()
})
