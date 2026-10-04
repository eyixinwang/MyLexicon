import { useState, type ReactNode } from 'react'
import { filterLibraryEntries } from '../domain/search'
import type { EntryView } from '../domain/model'

export function Revisit({
  entries,
  onEdit,
  onDelete,
  onFinish,
  renderDetails,
  onSettings,
}: {
  entries: EntryView[]
  onEdit: (entry: EntryView) => void
  onDelete: (entry: EntryView) => void
  onFinish: (entry: EntryView, practice: boolean) => Promise<void>
  renderDetails: (entry: EntryView) => ReactNode
  onSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string>()
  const filtered = filterLibraryEntries(entries, query, 'all')
  async function finish(entry: EntryView, practice: boolean) {
    setBusy(entry.id)
    try {
      await onFinish(entry, practice)
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">WHEN YOU HAVE A MOMENT</span>
        <h1>Revisit</h1>
        <p>Expressions that caught your attention. Explore them here, then choose what to learn.</p>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search Revisit"
          placeholder="Search your captures…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="muted small">{entries.length} waiting</span>
      </div>
      {filtered.length ? (
        <div className="revisit-list">
          {filtered.map((entry) => (
            <article className="revisit-card" key={entry.id}>
              <div className="entry-top">
                <span className="type-label">{entry.data.kind}</span>
                <span className="muted small">Saved for later</span>
              </div>
              {entry.data.kind === 'sentence' && entry.data.meaningZh ? (
                <>
                  <h2 lang="zh">{entry.data.meaningZh}</h2>
                  <p className="sentence-english" lang="en">
                    {entry.data.text}
                  </p>
                </>
              ) : (
                <>
                  <h2 lang="en">{entry.data.text}</h2>
                  <p className="meaning" lang="zh">
                    {entry.data.meaningZh}
                  </p>
                </>
              )}
              {entry.data.context && <blockquote>{entry.data.context}</blockquote>}
              {entry.data.capture && (
                <p className="capture-source">
                  <a href={entry.data.capture.url} target="_blank" rel="noopener noreferrer">
                    {entry.data.capture.title || new URL(entry.data.capture.url).hostname} ↗
                  </a>
                </p>
              )}
              <details className="revisit-details">
                <summary>Learn this expression</summary>
                {renderDetails(entry)}
              </details>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => void finish(entry, true)}
                >
                  {busy === entry.id ? 'Saving…' : 'Start practice'}
                </button>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void finish(entry, false)}
                >
                  Move to Library
                </button>
                <button className="text-button" disabled={!!busy} onClick={() => onEdit(entry)}>
                  Edit
                </button>
                <button
                  className="text-button danger"
                  disabled={!!busy}
                  onClick={() => onDelete(entry)}
                >
                  Discard
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">↺</div>
          <h2>{query ? 'No matching captures' : 'Keep reading. Learn later.'}</h2>
          <p>
            {query
              ? 'Try a different expression or Chinese meaning.'
              : 'Select text on a webpage, see its Chinese explanation, and choose Add to Revisit when it interests you.'}
          </p>
          <button className="button secondary" onClick={query ? () => setQuery('') : onSettings}>
            {query ? 'Clear search' : 'Set up browser capture'}
          </button>
        </div>
      )}
    </>
  )
}
