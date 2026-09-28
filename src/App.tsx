import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EntryEditor } from './components/EntryEditor'
import {
  deriveLibrary,
  newEntryOperation,
  newReviewOperation,
  type EntryData,
  type EntryOperation,
  type EntryView,
  type RatingValue,
} from './domain/model'
import { isDue, nextDueAt } from './domain/review'
import { parseOperations } from './domain/validation'
import {
  addImportedOperations,
  addLocalOperation,
  bindSubject,
  getBoundSubject,
  getDeviceId,
  getLastSyncedAt,
  getOperations,
  getPendingOperations,
} from './data/storage'
import { connectGoogle, prepareGoogle, type GoogleConnection } from './google/auth'
import { syncDrive } from './google/drive'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
type Page = 'lookup' | 'library' | 'review' | 'settings'
type EditorState = { entry?: EntryView; initialText?: string } | null

function errorText(value: unknown) {
  return value instanceof Error ? value.message : 'Something went wrong. Please try again.'
}
function dateLabel(value?: string | Date | null) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: EntryView
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="entry-card">
      <div className="entry-top">
        <span className="type-label">{entry.data.kind}</span>
        <span className="muted small">{dateLabel(entry.updatedAt)}</span>
      </div>
      <h3>{entry.data.text}</h3>
      {entry.data.meaningZh && <p className="meaning">{entry.data.meaningZh}</p>}
      {entry.data.context && <p className="context">“{entry.data.context}”</p>}
      {(entry.data.usage || entry.data.register || entry.data.toneNotes || entry.data.notes) && (
        <div className="entry-detail">
          {entry.data.usage && (
            <p>
              <b>Usage</b> {entry.data.usage}
            </p>
          )}
          {entry.data.register && (
            <p>
              <b>Setting</b> {entry.data.register}
            </p>
          )}
          {entry.data.toneNotes && (
            <p>
              <b>Tone</b> {entry.data.toneNotes}
            </p>
          )}
          {entry.data.notes && (
            <p>
              <b>Note</b> {entry.data.notes}
            </p>
          )}
        </div>
      )}
      {entry.data.tags.length > 0 && (
        <div className="tags">
          {entry.data.tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="card-actions">
        <button className="text-button" onClick={onEdit}>
          Edit
        </button>
        <button className="text-button danger" onClick={onDelete}>
          Delete
        </button>
        {entry.data.practiceEnabled && <span className="practice-mark">● In review</span>}
      </div>
    </article>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('lookup')
  const [operations, setOperations] = useState<Awaited<ReturnType<typeof getOperations>>>([])
  const [ready, setReady] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [boundSubject, setBoundSubject] = useState<string>()
  const [locked, setLocked] = useState(false)
  const [connection, setConnection] = useState<GoogleConnection | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string>()
  const [pendingCount, setPendingCount] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [capture, setCapture] = useState('')
  const [editor, setEditor] = useState<EditorState>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const syncBusy = useRef(false)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionRef = useRef<GoogleConnection | null>(null)

  const refresh = useCallback(async () => {
    const [all, pending, synced] = await Promise.all([
      getOperations(),
      getPendingOperations(),
      getLastSyncedAt(),
    ])
    setOperations(all)
    setPendingCount(pending.length)
    setLastSynced(synced)
  }, [])

  useEffect(() => {
    if (CLIENT_ID) void prepareGoogle().catch(() => undefined)
    Promise.all([getDeviceId(), getBoundSubject(), refresh()])
      .then(([device, subject]) => {
        setDeviceId(device)
        setBoundSubject(subject)
        setLocked(!!subject)
        setReady(true)
      })
      .catch((reason) => {
        setError(errorText(reason))
        setReady(true)
      })
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [refresh])

  const library = useMemo(() => deriveLibrary(operations), [operations])
  const due = useMemo(
    () =>
      library.entries.filter(
        (entry) => entry.data.practiceEnabled && isDue(entry.id, library.reviews),
      ),
    [library],
  )
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return library.entries
    return library.entries.filter((entry) =>
      [
        entry.data.text,
        entry.data.meaningZh,
        entry.data.definitionEn,
        entry.data.context,
        entry.data.usage,
        entry.data.notes,
        ...entry.data.tags,
      ].some((part) => part.toLocaleLowerCase().includes(term)),
    )
  }, [library.entries, query])
  const currentReview = due[reviewIndex % Math.max(1, due.length)]

  const runSync = useCallback(
    async (target: GoogleConnection) => {
      if (syncBusy.current) return
      syncBusy.current = true
      setSyncing(true)
      setError('')
      try {
        await syncDrive(target)
        await refresh()
        setMessage('Your library is up to date on Google Drive.')
      } catch (reason) {
        setError(errorText(reason))
        await refresh()
      } finally {
        setSyncing(false)
        syncBusy.current = false
      }
    },
    [refresh],
  )

  function queueSync() {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      if (connectionRef.current) void runSync(connectionRef.current)
    }, 1200)
  }

  useEffect(() => {
    const onOnline = () => {
      if (connectionRef.current) void runSync(connectionRef.current)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && connectionRef.current)
        void runSync(connectionRef.current)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [runSync])

  async function saveEntry(value: EntryData, original?: EntryView) {
    const id = original?.id ?? crypto.randomUUID()
    const op = newEntryOperation(id, original ? [original.revision] : [], value, deviceId)
    await addLocalOperation(op)
    await refresh()
    setEditor(null)
    setCapture('')
    setMessage('Saved on this device.')
    queueSync()
  }

  async function removeEntry(entry: EntryView) {
    if (!window.confirm(`Delete “${entry.data.text}” from your library?`)) return
    try {
      await addLocalOperation(newEntryOperation(entry.id, [entry.revision], null, deviceId))
      await refresh()
      setMessage('Entry deleted on this device.')
      queueSync()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function resolveConflict(
    entryId: string,
    versions: EntryOperation[],
    chosen: EntryOperation,
  ) {
    try {
      await addLocalOperation(
        newEntryOperation(
          entryId,
          versions.map((item) => item.id),
          chosen.value,
          deviceId,
        ),
      )
      await refresh()
      setMessage('Conflict resolved on this device.')
      queueSync()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function rateReview(rating: RatingValue) {
    if (!currentReview) return
    try {
      await addLocalOperation(newReviewOperation(currentReview.id, rating, deviceId))
      await refresh()
      setRevealed(false)
      setReviewIndex(0)
      queueSync()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function connect() {
    setConnecting(true)
    setError('')
    try {
      const target = await connectGoogle(CLIENT_ID)
      const existing = await getBoundSubject()
      if (existing && existing !== target.subject) {
        throw new Error(
          'This device contains a library linked to another Google account. Export it before changing accounts.',
        )
      }
      if (
        !existing &&
        operations.length &&
        !window.confirm(
          `Connect this device’s ${operations.length} saved changes to ${target.email}? They will sync to that Google account.`,
        )
      )
        return
      await bindSubject(target.subject)
      setBoundSubject(target.subject)
      connectionRef.current = target
      setConnection(target)
      setLocked(false)
      await runSync(target)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setConnecting(false)
    }
  }

  function disconnect() {
    connectionRef.current = null
    setConnection(null)
    setLocked(true)
    if (syncTimer.current) clearTimeout(syncTimer.current)
    setMessage('Drive disconnected. Local data remains on this device.')
  }

  function exportData() {
    const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), operations }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mylexicon-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('JSON backup downloaded.')
  }

  async function importData(file?: File) {
    if (!file) return
    setError('')
    try {
      if (file.size > 20_000_000)
        throw new Error('This file is too large for a personal library import.')
      const parsed = parseOperations(JSON.parse(await file.text()) as unknown)
      const added = await addImportedOperations(parsed)
      await refresh()
      setMessage(`Imported ${added} new changes. Existing records were preserved.`)
      if (added) queueSync()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (!ready) return <div className="loading">Opening your lexicon…</div>
  if (locked)
    return (
      <main className="lock-screen">
        <div className="lock-card">
          <div className="brand-mark">
            Aa<span>.</span>
          </div>
          <span className="eyebrow">MYLEXICON</span>
          <h1>Your language space</h1>
          <p>
            This device has a saved library. Connect its Google account to sync, or open the local
            copy while offline.
          </p>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary wide"
            onClick={connect}
            disabled={connecting || !CLIENT_ID}
          >
            {connecting ? 'Connecting…' : 'Connect Google Drive'}
          </button>
          <button className="button ghost wide" onClick={() => setLocked(false)}>
            Open local copy
          </button>
          {!CLIENT_ID && (
            <p className="muted small">
              Google sync needs a public OAuth client ID in the app configuration.
            </p>
          )}
          <p className="small muted">
            Opening the local copy is convenient on a personal device. It is not password
            protection; use your device lock to protect downloaded data.
          </p>
        </div>
      </main>
    )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            Aa<span>.</span>
          </div>
          <div>
            <strong>MyLexicon</strong>
            <small>Your personal language space</small>
          </div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {(
            [
              ['lookup', '✦', 'Capture'],
              ['library', '▤', 'Library'],
              ['review', '◷', 'Review'],
              ['settings', '⚙', 'Settings'],
            ] as const
          ).map(([name, icon, label]) => (
            <button
              key={name}
              className={`nav-item ${page === name ? 'active' : ''}`}
              onClick={() => {
                setPage(name)
                setEditor(null)
              }}
              aria-current={page === name ? 'page' : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
              {name === 'review' && due.length > 0 && <em>{due.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`status-dot ${connection ? 'connected' : ''}`} />
          <div>
            <b>{connection ? 'Drive connected' : 'Saved on this device'}</b>
            <small>{connection ? connection.email : 'Connect in Settings to sync'}</small>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            MYLEXICON <span>/</span> {page.toUpperCase()}
          </div>
          <div className="topbar-actions">
            <span className="small muted">
              {pendingCount
                ? `${pendingCount} changes to sync`
                : connection
                  ? 'All changes synced'
                  : 'Local mode'}
            </span>
            <div className="avatar">M</div>
          </div>
        </header>
        {(message || error) && (
          <div
            className={`banner ${error ? 'banner-error' : ''}`}
            role={error ? 'alert' : 'status'}
          >
            <span>{error || message}</span>
            <button
              onClick={() => {
                setMessage('')
                setError('')
              }}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
        <div className="content">
          {page === 'lookup' && (
            <>
              <section className="hero">
                <span className="eyebrow">A QUIETER WAY TO LEARN</span>
                <h1>
                  Words worth
                  <br />
                  <i>keeping.</i>
                </h1>
                <p>
                  Catch the language you meet every day. Add the meaning that matters to you, then
                  revisit it when you’re ready.
                </p>
              </section>
              <section className="capture-panel">
                <div className="section-kicker">
                  <span className="kicker-symbol">✦</span> START HERE
                </div>
                <h2>What would you like to remember?</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (capture.trim()) setEditor({ initialText: capture.trim() })
                  }}
                >
                  <div className="capture-input">
                    <input
                      aria-label="English text to save"
                      value={capture}
                      onChange={(event) => setCapture(event.target.value)}
                      placeholder="Type a word, phrase, or sentence…"
                    />
                    <button className="button primary" disabled={!capture.trim()}>
                      Add entry <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </form>
                <p className="helper">
                  Dictionary lookup is coming later. For now, save your own meaning, context, and
                  notes.
                </p>
              </section>
              <section className="overview">
                <div className="overview-card">
                  <span>YOUR COLLECTION</span>
                  <strong>{library.entries.length}</strong>
                  <p>saved expressions</p>
                </div>
                <div className="overview-card accent">
                  <span>READY TO REVISIT</span>
                  <strong>{due.length}</strong>
                  <p>due for review</p>
                </div>
                <div className="overview-card">
                  <span>LAST SYNC</span>
                  <strong className="date-stat">
                    {lastSynced ? new Date(lastSynced).toLocaleDateString() : '—'}
                  </strong>
                  <p>{connection ? 'with Google Drive' : 'connect to sync devices'}</p>
                </div>
              </section>
              {library.entries.length > 0 && (
                <section className="recent">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
                      <h2>Recently saved</h2>
                    </div>
                    <button className="text-button" onClick={() => setPage('library')}>
                      View library →
                    </button>
                  </div>
                  <div className="entry-grid">
                    {library.entries.slice(0, 3).map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onEdit={() => setEditor({ entry })}
                        onDelete={() => void removeEntry(entry)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {page === 'library' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">YOUR OWN WORDS</span>
                <h1>Library</h1>
                <p>Everything you have chosen to keep, in one place.</p>
              </div>
              <div className="toolbar">
                <input
                  className="search"
                  aria-label="Search library"
                  placeholder="Search English, Chinese, notes, or tags…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="button primary" onClick={() => setEditor({})}>
                  + New entry
                </button>
              </div>
              {library.conflicts.length > 0 && (
                <div className="notice">
                  {library.conflicts.length} entry conflict
                  {library.conflicts.length === 1 ? '' : 's'} need your choice in Settings.
                </div>
              )}
              {filtered.length ? (
                <div className="entry-grid">
                  {filtered.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={() => setEditor({ entry })}
                      onDelete={() => void removeEntry(entry)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">Aa</div>
                  <h2>{query ? 'No matching entries' : 'Your library starts here'}</h2>
                  <p>
                    {query
                      ? 'Try another word or search your notes.'
                      : 'Save a word, phrase, or sentence you want to remember.'}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setPage('lookup')
                      setQuery('')
                    }}
                  >
                    Capture something
                  </button>
                </div>
              )}
            </>
          )}
          {page === 'review' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">A LITTLE AT A TIME</span>
                <h1>Review</h1>
                <p>Try to remember before revealing the answer.</p>
              </div>
              <div className="review-summary">
                <span>Due now</span>
                <strong>{due.length}</strong>
                <span>
                  of {library.entries.filter((entry) => entry.data.practiceEnabled).length} in
                  review
                </span>
              </div>
              {currentReview ? (
                <section className="review-card">
                  <span className="eyebrow">RECALL THE ENGLISH</span>
                  <h2>
                    {currentReview.data.meaningZh ||
                      currentReview.data.context ||
                      'Recall this expression'}
                  </h2>
                  {!revealed ? (
                    <button className="button primary" onClick={() => setRevealed(true)}>
                      Reveal answer
                    </button>
                  ) : (
                    <>
                      <div className="answer">
                        <span>THE EXPRESSION</span>
                        <h3>{currentReview.data.text}</h3>
                        {currentReview.data.context && <p>“{currentReview.data.context}”</p>}
                        {currentReview.data.notes && <p>{currentReview.data.notes}</p>}
                      </div>
                      <p className="muted">How well did you recall it?</p>
                      <div className="rating-buttons">
                        {(
                          [
                            [1, 'Again'],
                            [2, 'Hard'],
                            [3, 'Good'],
                            [4, 'Easy'],
                          ] as const
                        ).map(([rating, label]) => (
                          <button key={rating} onClick={() => void rateReview(rating)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">✓</div>
                  <h2>All caught up</h2>
                  <p>Add an entry to review, or come back when another one is due.</p>
                  <button className="button secondary" onClick={() => setPage('library')}>
                    Browse library
                  </button>
                </div>
              )}
            </>
          )}
          {page === 'settings' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">MAKE IT YOURS</span>
                <h1>Settings</h1>
                <p>
                  Your entries live on this device first. Connect Drive to keep devices in step.
                </p>
              </div>
              <div className="settings-grid">
                <section className="settings-card">
                  <span className="eyebrow">CROSS-DEVICE</span>
                  <h2>Google Drive</h2>
                  <p>
                    Private app storage holds your changes. Connect the same account on each device.
                  </p>
                  <div className="setting-line">
                    <span>Status</span>
                    <strong>
                      {connection ? `Connected as ${connection.email}` : 'Not connected'}
                    </strong>
                  </div>
                  <div className="setting-line">
                    <span>Pending changes</span>
                    <strong>{pendingCount}</strong>
                  </div>
                  <div className="setting-line">
                    <span>Last sync</span>
                    <strong>{dateLabel(lastSynced)}</strong>
                  </div>
                  <div className="button-row">
                    {connection ? (
                      <>
                        <button
                          className="button primary"
                          onClick={() => void runSync(connection)}
                          disabled={syncing}
                        >
                          {syncing ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button className="button ghost" onClick={disconnect}>
                          Disconnect & lock
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary"
                        onClick={connect}
                        disabled={connecting || !CLIENT_ID}
                      >
                        {connecting ? 'Connecting…' : 'Connect Drive'}
                      </button>
                    )}
                  </div>
                  {!CLIENT_ID && (
                    <p className="helper">
                      Set VITE_GOOGLE_CLIENT_ID to enable sync. Local features work without it.
                    </p>
                  )}
                  <p className="helper">
                    Google authorization may need renewal. Edits remain on this device until sync
                    succeeds.
                  </p>
                </section>
                <section className="settings-card">
                  <span className="eyebrow">OWN YOUR DATA</span>
                  <h2>Backup & restore</h2>
                  <p>
                    Download a JSON copy of entries, reviews, and change history. Import merges by
                    change ID.
                  </p>
                  <div className="button-row">
                    <button className="button secondary" onClick={exportData}>
                      Export JSON
                    </button>
                    <button className="button ghost" onClick={() => fileInput.current?.click()}>
                      Import JSON
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={(event) => void importData(event.target.files?.[0])}
                    />
                  </div>
                  <p className="helper">
                    Keep an independent backup. Browser storage can be cleared by the device.
                  </p>
                </section>
              </div>
              <section className="conflicts-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">NEEDS YOUR CHOICE</span>
                    <h2>Conflicts</h2>
                  </div>
                  <span className="muted small">{library.conflicts.length} unresolved</span>
                </div>
                {library.conflicts.length ? (
                  library.conflicts.map((conflict) => (
                    <div className="conflict" key={conflict.entryId}>
                      <p>
                        Two devices changed the same entry. Choose which version to keep; all
                        versions stay in the backup history.
                      </p>
                      <div className="conflict-versions">
                        {conflict.versions.map((version) => (
                          <div className="conflict-version" key={version.id}>
                            <span className="type-label">
                              {version.value ? 'Edited entry' : 'Deleted entry'}
                            </span>
                            <h3>{version.value?.text || 'Deleted'}</h3>
                            <p>{version.value?.meaningZh || 'No Chinese meaning'}</p>
                            <small>{dateLabel(version.at)}</small>
                            <button
                              className="button secondary"
                              onClick={() =>
                                void resolveConflict(conflict.entryId, conflict.versions, version)
                              }
                            >
                              Keep this version
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">No conflicting edits.</p>
                )}
              </section>
              <section className="privacy-note">
                <strong>About privacy</strong>
                <p>
                  The website and its code are public on GitHub Pages. Your personal entries are
                  stored on this device and, when connected, in your authorized Google Drive app
                  storage. The local copy is not encrypted; protect shared devices with your device
                  lock.
                </p>
              </section>
            </>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(
          [
            ['lookup', '✦', 'Capture'],
            ['library', '▤', 'Library'],
            ['review', '◷', 'Review'],
            ['settings', '⚙', 'Settings'],
          ] as const
        ).map(([name, icon, label]) => (
          <button
            key={name}
            className={page === name ? 'active' : ''}
            onClick={() => {
              setPage(name)
              setEditor(null)
            }}
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
      {editor && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null)
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={editor.entry ? 'Edit entry' : 'New entry'}
          >
            <EntryEditor
              entry={editor.entry}
              initialText={editor.initialText}
              onSave={saveEntry}
              onCancel={() => setEditor(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
