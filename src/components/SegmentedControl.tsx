import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type SegmentedControlOption<T extends string = string> = {
  value: T
  label: ReactNode
  id?: string
  disabled?: boolean
}

export type SegmentedControlProps<T extends string = string> = {
  label: string
  value: T
  options: ReadonlyArray<SegmentedControlOption<T>>
  onChange: (value: T) => void
  ariaControls?: string
  name?: string
  className?: string
  disabled?: boolean
}

export default function SegmentedControl<T extends string = string>({
  label,
  value,
  options,
  onChange,
  ariaControls,
  className = '',
  disabled = false,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (disabled || options.length <= 1) return

    const enabledOptions = options
      .map((opt, idx) => ({ ...opt, originalIndex: idx }))
      .filter((opt) => !opt.disabled)

    if (enabledOptions.length <= 1) return

    const currentEnabledIndex = enabledOptions.findIndex(
      (opt) => opt.originalIndex === currentIndex,
    )

    let nextEnabledIndex = -1

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      nextEnabledIndex = (currentEnabledIndex + 1) % enabledOptions.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      nextEnabledIndex = (currentEnabledIndex - 1 + enabledOptions.length) % enabledOptions.length
    } else if (event.key === 'Home') {
      event.preventDefault()
      nextEnabledIndex = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      nextEnabledIndex = enabledOptions.length - 1
    }

    if (nextEnabledIndex !== -1) {
      const nextOption = enabledOptions[nextEnabledIndex]
      onChange(nextOption.value)

      // Focus the button in DOM
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button')
      if (buttons && buttons[nextOption.originalIndex]) {
        buttons[nextOption.originalIndex].focus()
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={`segmented-control ${className}`.trim()}
      role="tablist"
      aria-label={label}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value
        const isOptionDisabled = disabled || option.disabled

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={option.id}
            aria-selected={isSelected}
            aria-controls={ariaControls}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptionDisabled}
            className={isSelected ? 'active' : ''}
            onClick={() => {
              if (!isOptionDisabled && option.value !== value) {
                onChange(option.value)
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
