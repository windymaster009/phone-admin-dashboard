import type { KeyboardEventHandler, ReactNode } from 'react'
import { Search } from 'lucide-react'

type FilterToolbarProps = {
  className?: string
  search: string
  onSearchChange: (value: string) => void
  searchLabel: string
  placeholder: string
  onSearchKeyDown?: KeyboardEventHandler<HTMLInputElement>
  children?: ReactNode
}

export default function FilterToolbar({
  className = '',
  search,
  onSearchChange,
  searchLabel,
  placeholder,
  onSearchKeyDown,
  children,
}: FilterToolbarProps) {
  return (
    <div className={`filter-row ${className}`.trim()}>
      <label className="search-field">
        <Search size={17} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={placeholder}
          aria-label={searchLabel}
          autoComplete="off"
        />
      </label>
      {children}
    </div>
  )
}
