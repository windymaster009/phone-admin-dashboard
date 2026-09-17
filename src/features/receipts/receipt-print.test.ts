import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitReceiptPrintPage, printReceiptWindow, writeReceiptPrintDocument } from './receipt-print'

function printDocument(layout: 'THERMAL' | 'A4' = 'THERMAL', height = 400) {
  const doc = document.implementation.createHTMLDocument()
  writeReceiptPrintDocument(doc, {
    markup: `<article class="receipt-paper receipt-paper-${layout.toLowerCase()}">Receipt totals and barcode</article>`,
    layout,
  })
  const paper = doc.querySelector<HTMLElement>('article')!
  vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect)
  return { doc, paper }
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('shared receipt print sizing', () => {
  it('measures the styled print document, not the page preview or a fixed minimum', async () => {
    const { doc } = printDocument()
    document.body.innerHTML = '<article class="receipt-paper-thermal">unrelated mobile preview</article>'
    Object.defineProperty(document.body.firstChild, 'scrollHeight', { value: 4000 })
    await fitReceiptPrintPage(doc, 'THERMAL')
    expect(doc.getElementById('receipt-page-size')?.textContent).toBe('@page{size:80mm 108mm;margin:0}')
    expect(doc.head.textContent).toContain('width:80mm')
  })

  it('retains all of a long receipt without the old 1200 mm clamp', async () => {
    const { doc, paper } = printDocument('THERMAL', 400)
    Object.defineProperty(paper, 'scrollHeight', { value: 6000 })
    await fitReceiptPrintPage(doc, 'THERMAL')
    expect(doc.getElementById('receipt-page-size')?.textContent).toContain('80mm 1590mm')
  })

  it('keeps A4 page size unchanged', async () => {
    const { doc } = printDocument('A4')
    await fitReceiptPrintPage(doc, 'A4')
    expect(doc.getElementById('receipt-page-size')?.textContent).toBe('@page{size:A4;margin:0}')
  })

  it('waits for font metrics before measuring', async () => {
    const { doc, paper } = printDocument()
    let ready!: () => void
    Object.defineProperty(doc, 'fonts', { value: { ready: new Promise<void>((resolve) => { ready = resolve }) } })
    const fitting = fitReceiptPrintPage(doc, 'THERMAL')
    expect(paper.getBoundingClientRect).not.toHaveBeenCalled()
    vi.mocked(paper.getBoundingClientRect).mockReturnValue({ height: 800 } as DOMRect)
    ready()
    await fitting
    expect(doc.getElementById('receipt-page-size')?.textContent).toContain('80mm 214mm')
  })

  it('bounds an unavailable image wait and still measures the receipt', async () => {
    vi.useFakeTimers()
    const { doc } = printDocument()
    const image = doc.createElement('img')
    image.decode = () => new Promise(() => {})
    doc.body.append(image)
    const fitting = fitReceiptPrintPage(doc, 'THERMAL')
    await vi.advanceTimersByTimeAsync(2000)
    await fitting
    expect(doc.getElementById('receipt-page-size')?.textContent).toContain('80mm 108mm')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels preparation without changing the page or leaving timers', async () => {
    vi.useFakeTimers()
    const { doc } = printDocument()
    Object.defineProperty(doc, 'fonts', { value: { ready: new Promise(() => {}) } })
    const controller = new AbortController()
    const fitting = fitReceiptPrintPage(doc, 'THERMAL', controller.signal)
    controller.abort()
    await fitting
    expect(doc.getElementById('receipt-page-size')?.textContent).toBe('@page{margin:0}')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails visibly if no measurable thermal receipt exists', async () => {
    const { doc } = printDocument('THERMAL', 0)
    await expect(fitReceiptPrintPage(doc, 'THERMAL')).rejects.toThrow('Unable to measure')
    doc.body.innerHTML = ''
    await expect(fitReceiptPrintPage(doc, 'THERMAL')).rejects.toThrow('layout is unavailable')
  })

  it('sets titles as text, not executable HTML', () => {
    const doc = document.implementation.createHTMLDocument()
    writeReceiptPrintDocument(doc, { markup: '<article>test</article>', layout: 'A4', title: '</title><script>bad()</script>' })
    expect(doc.title).toBe('</title><script>bad()</script>')
    expect(doc.querySelector('script')).toBeNull()
  })

  it('reports blocked windows without invoking print', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(await printReceiptWindow({ markup: '<article>test</article>', layout: 'A4' })).toBe(false)
  })

  it('closes a failed print window and reports the error', async () => {
    const { doc } = printDocument('A4')
    const popup = { document: doc, focus: vi.fn(), print: vi.fn(() => { throw new Error('Printer unavailable') }), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    await expect(printReceiptWindow({ markup: '<article>test</article>', layout: 'A4' })).rejects.toThrow('Printer unavailable')
    expect(popup.close).toHaveBeenCalledOnce()
    expect(popup.print).toHaveBeenCalledOnce()
  })
})
