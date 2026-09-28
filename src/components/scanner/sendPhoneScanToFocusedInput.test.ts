import { createElement, useState, type ChangeEvent } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sendPhoneScanToFocusedInput } from './sendPhoneScanToFocusedInput'

describe('phone gun scanner input', () => {
  it('types at the focused selection and sends Enter', () => {
    const input = document.createElement('input')
    input.value = 'PF--OLD'
    document.body.append(input)
    input.focus()
    input.setSelectionRange(3, 3)
    const events: string[] = []
    input.addEventListener('input', () => events.push('input'))
    input.addEventListener('keydown', (event) => events.push(`down:${event.key}`))
    input.addEventListener('keyup', (event) => events.push(`up:${event.key}`))

    expect(sendPhoneScanToFocusedInput('  123\r\n')).toBe(true)
    expect(input.value).toBe('PF-123-OLD')
    expect(events).toEqual(['input', 'down:Enter', 'up:Enter'])
    input.remove()
  })

  it('notifies React-style input listeners through the native value setter', () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const listener = vi.fn()
    input.addEventListener('input', listener)
    expect(sendPhoneScanToFocusedInput('SKU-9')).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(input.value).toBe('SKU-9')
    input.remove()
  })

  it('updates a controlled React input before sending Enter', () => {
    function ControlledInput() {
      const [value, setValue] = useState('')
      return createElement('input', {
        'aria-label': 'Barcode',
        value,
        onChange: (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
      })
    }
    const view = render(createElement(ControlledInput))
    const input = view.getByLabelText('Barcode') as HTMLInputElement
    input.focus()
    act(() => { expect(sendPhoneScanToFocusedInput('PF-100')).toBe(true) })
    expect(input.value).toBe('PF-100')
    view.unmount()
  })

  it('supports focused number fields that do not expose a text selection', () => {
    const input = document.createElement('input')
    input.type = 'number'
    input.value = '12'
    document.body.append(input)
    input.focus()
    expect(sendPhoneScanToFocusedInput('34')).toBe(true)
    expect(input.value).toBe('1234')
    input.remove()
  })

  it('keeps the scan queued when no editable text field is focused', () => {
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    expect(sendPhoneScanToFocusedInput('SKU-9')).toBe(false)
    button.remove()
  })
})
