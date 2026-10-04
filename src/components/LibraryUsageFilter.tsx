import { useId } from 'react'
import type { UsageFilter } from '../domain/search'

export function LibraryUsageFilter({
  value,
  onChange,
}: {
  value: UsageFilter
  onChange: (value: UsageFilter) => void
}) {
  const id = useId()
  return (
    <div className="field usage-filter">
      <label htmlFor={id}>Used in</label>
      <select
        id={id}
        aria-describedby={`${id}-hint`}
        value={value}
        onChange={(event) => onChange(event.target.value as UsageFilter)}
      >
        <option value="all">All usage</option>
        <option value="spoken">Speaking</option>
        <option value="written">Writing</option>
        <option value="both">Speaking & writing (both)</option>
        <option value="unclassified">Not classified</option>
      </select>
      <span id={`${id}-hint`} className="field-hint">
        Speaking and Writing include entries used in both.
      </span>
    </div>
  )
}
