import './auto-calculate-toggle.css'

type AutoCalculateToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export default function AutoCalculateToggle({
  checked,
  onChange,
  label = 'Auto calculate',
}: AutoCalculateToggleProps) {
  return (
    <button
      type="button"
      className={`calculation-mode-toggle ${checked ? 'active' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
      <strong aria-hidden="true">{label}</strong>
      <small aria-hidden="true">{checked ? 'On' : 'Off'}</small>
    </button>
  )
}
