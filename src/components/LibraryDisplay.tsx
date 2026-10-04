import { useState, type ReactNode } from 'react'
import type { EntryView } from '../domain/model'

export type LibraryViewMode = 'list' | 'preview' | 'cards'
const VIEW_STORAGE_KEY = 'mylexicon-library-view'

export function readLibraryView(): LibraryViewMode {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY)
    if (saved === 'list' || saved === 'preview' || saved === 'cards') return saved
  } catch {
    // Browsing still works when a browser blocks preference storage.
  }
  return 'preview'
}

export function rememberLibraryView(value: LibraryViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, value)
  } catch {
    // Keep the chosen view for this session even when it cannot be persisted.
  }
}

function ViewIcon({ mode }: { mode: LibraryViewMode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {mode === 'list' ? (
        <path d="M3 5h14M3 10h14M3 15h14" />
      ) : mode === 'preview' ? (
        <>
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M6 7h8M6 11h6" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M6 7h8M6 10h8M6 13h8" />
        </>
      )}
    </svg>
  )
}

export function LibraryDisplayOptions({
  value,
  onChange,
}: {
  value: LibraryViewMode
  onChange: (value: LibraryViewMode) => void
}) {
  return (
    <div className="library-display-bar">
      <div className="library-display-control">
        <span className="library-display-label">Show as</span>
        <div className="library-view-options" role="group" aria-label="Library display">
          {(
            [
              ['list', 'List'],
              ['preview', 'Preview'],
              ['cards', 'Full cards'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={value === mode}
              className={value === mode ? 'active' : ''}
              onClick={() => onChange(mode)}
            >
              <ViewIcon mode={mode} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {value !== 'cards' && (
        <p className="library-display-hint">Open an item to read everything.</p>
      )}
    </div>
  )
}

export function LibraryCompactEntry({
  entry,
  mode,
  renderFullEntry,
}: {
  entry: EntryView
  mode: 'list' | 'preview'
  renderFullEntry: (entry: EntryView) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const { data } = entry
  const chineseFirst = data.kind === 'sentence' && !!data.meaningZh
  const title = chineseFirst ? data.meaningZh : data.text
  const translation = chineseFirst ? data.text : data.meaningZh
  const preview = data.usage || data.definitionEn || data.notes || data.context

  return (
    <details
      className={`library-item library-item-${mode}`}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span className="library-item-copy">
          <span className="library-item-meta">
            <span className="type-label">{data.kind}</span>
            {data.practiceEnabled && <span className="library-item-practice">In review</span>}
          </span>
          <span className="library-item-title" lang={chineseFirst ? 'zh' : 'en'}>
            {title}
          </span>
          {translation && (
            <span className="library-item-translation" lang={chineseFirst ? 'en' : 'zh'}>
              {translation}
            </span>
          )}
          {mode === 'preview' && preview && <span className="library-item-excerpt">{preview}</span>}
        </span>
        <span className="library-item-toggle">
          <span className="when-closed">View details</span>
          <span className="when-open">Hide details</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
      </summary>
      {expanded && <div className="library-item-details">{renderFullEntry(entry)}</div>}
    </details>
  )
}
