const SUPPORTED_INPUT_TYPES = new Set(['', 'email', 'number', 'password', 'search', 'tel', 'text', 'url'])

function dispatchEnter(target: HTMLElement) {
  const options = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }
  target.dispatchEvent(new KeyboardEvent('keydown', options))
  target.dispatchEvent(new KeyboardEvent('keypress', options))
  target.dispatchEvent(new KeyboardEvent('keyup', options))
}

/** Types a phone scan into the desktop field that already has focus, like a USB barcode gun. */
export function sendPhoneScanToFocusedInput(rawCode: string) {
  const code = rawCode.replace(/[\r\n\t]/g, '').trim()
  const target = document.activeElement
  if (!code || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false
  if (target.disabled || target.readOnly) return false
  if (target instanceof HTMLInputElement && !SUPPORTED_INPUT_TYPES.has(target.type)) return false

  let start = target.value.length
  let end = start
  try {
    start = target.selectionStart ?? start
    end = target.selectionEnd ?? start
  } catch {
    // Number-like inputs do not expose a selectable text range.
  }
  const nextValue = `${target.value.slice(0, start)}${code}${target.value.slice(end)}`
  const prototype = target instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (!setter) return false

  setter.call(target, nextValue)
  try {
    target.setSelectionRange(start + code.length, start + code.length)
  } catch {
    // The value is still inserted for inputs that do not support selection.
  }
  target.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    data: code,
    inputType: 'insertText',
  }))
  dispatchEnter(target)
  return true
}
