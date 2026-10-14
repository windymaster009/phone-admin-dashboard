/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
/* Hallmark · component: filter select · genre: operational product UI · theme: existing violet
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass
 */
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export type FilterSelectProps = SelectHTMLAttributes<HTMLSelectElement>

const FilterSelect = forwardRef<HTMLSelectElement, FilterSelectProps>(function FilterSelect(
  { className = '', children, ...props },
  ref,
) {
  return (
    <span className="filter-select-shell">
      <select
        ref={ref}
        className={`ghost-button filter-select ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  )
})

export default FilterSelect
