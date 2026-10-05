import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EntryEditor } from './components/EntryEditor'
import { AIQuery } from './components/AIQuery'
import { GeminiSettings } from './components/GeminiSettings'
import { TranslationAlternatives } from './components/TranslationAlternatives'
import { EntryPronunciation } from './components/EntryPronunciation'
import { EntryVersions } from './components/EntryVersions'
import { LibraryUsageFilter } from './components/LibraryUsageFilter'
import {
  LibraryCompactEntry,
  LibraryDisplayOptions,
  readLibraryView,
  rememberLibraryView,
  type LibraryViewMode,
} from './components/LibraryDisplay'
import {
  deriveLibrary,
  isRevisitEntry,
  entryCategory,
  newEntryOperation,
  newReviewOperation,
  type EntryData,
  type EntryOperation,
  type EntryView,
  type RatingValue,
  type EntryCategory,
} from './domain/model'
import { filterLibraryEntries, type UsageFilter } from './domain/search'
import { entryVersions, normalizeSentenceVersions, versionTextKey } from './domain/sentenceVersions'
import { resolveQuery } from './ai/lookup'
import { isDue, nextDueAt } from './domain/review'
import { parseOperations } from './domain/validation'
import {
  addImportedOperations,
  addLocalOperation,
  addLocalOperationOnce,
  bindSubject,
  getBoundSubject,
  getDeviceId,
  getGeminiKey,
  getGeminiModel,
  setGeminiModel as persistGeminiModel,
  getLastSyncedAt,
  getOperations,
  getPendingOperations,
  repairSentenceVersions,
  subscribeToChanges,
} from './data/storage'
import { connectGoogle, prepareGoogle, type GoogleConnection } from './google/auth'
import { syncDrive } from './google/drive'
import { lookupGemini, LOCAL_GEMINI_PROXY } from './ai/client'
import { DEFAULT_GEMINI_MODEL } from './ai/models'
import { createCaptureService } from './capture/service'
import { listenForCapture } from './capture/bridge'
import { Revisit } from './components/Revisit'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
type Page = 'lookup' | 'library' | 'revisit' | 'review' | 'settings'
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

export function EntryCard({
  entry,
  onEdit,
  onDelete,
  draft = false,
}: {
  entry: { data: EntryData; updatedAt?: string }
  onEdit?: () => void
  onDelete?: () => void
  draft?: boolean
}) {
  const data = normalizeSentenceVersions(entry.data)
  const canonicalInVersions = entryVersions(data).some(
    (version) => versionTextKey(version.text) === versionTextKey(data.text),
  )
  const canonicalInAlternatives = (data.alternatives ?? []).some(
    (option) => versionTextKey(option.en) === versionTextKey(data.text),
  )
  return (
    <article className="entry-card">
      <div className="entry-top">
        <span className="type-label">
          {entry.data.kind}
          {isRevisitEntry(entry.data) ? ' · Revisit' : ''}
        </span>
        <span className="muted small">{draft ? 'Not saved' : dateLabel(entry.updatedAt)}</span>
      </div>
      {entry.data.kind === 'sentence' && entry.data.meaningZh ? (
        <>
          <h3 lang="zh">{entry.data.meaningZh}</h3>
          {!canonicalInVersions && !canonicalInAlternatives && (
            <p className="sentence-english" lang="en">
              {entry.data.text}
            </p>
          )}
        </>
      ) : (
        <h3 lang="en">{entry.data.text}</h3>
      )}
      {entry.data.partOfSpeech && <p className="lexical-meta">{entry.data.partOfSpeech}</p>}
      <EntryPronunciation data={entry.data} />
      {entry.data.kind !== 'sentence' && entry.data.meaningZh && (
        <p className="meaning" lang="zh">
          {entry.data.meaningZh}
        </p>
      )}
      {entry.data.definitionEn && <p className="definition">{entry.data.definitionEn}</p>}
      <TranslationAlternatives alternatives={data.alternatives} />
      <EntryVersions
        data={data}
        canonicalAlreadyVisible={data.kind !== 'sentence' || !data.meaningZh}
      />
      {entry.data.context && <p className="context">“{entry.data.context}”</p>}
      {entry.data.capture && (
        <p className="capture-source">
          From{' '}
          <a href={entry.data.capture.url} target="_blank" rel="noopener noreferrer">
            {entry.data.capture.title || new URL(entry.data.capture.url).hostname}
          </a>
        </p>
      )}
      {(entry.data.usage ||
        entry.data.register ||
        entry.data.toneNotes ||
        entry.data.notes ||
        entry.data.medium ||
        entry.data.domain) && (
        <div className="entry-detail">
          {entry.data.medium && (
            <p>
              <b>Used in</b>{' '}
              {entry.data.medium === 'both'
                ? 'Speaking & writing'
                : entry.data.medium === 'spoken'
                  ? 'Speaking'
                  : 'Writing'}
            </p>
          )}
          {entry.data.domain && (
            <p>
              <b>Domain</b> {entry.data.domain}
            </p>
          )}
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
      {!!entry.data.examples?.length && (
        <div className="entry-examples">
          <b>Examples</b>
          {entry.data.examples.map((example, index) => (
            <div key={index}>
              {entry.data.kind === 'sentence' && example.zh && <p lang="zh">{example.zh}</p>}
              <p lang="en">{example.en}</p>
              {entry.data.kind !== 'sentence' && example.zh && <p lang="zh">{example.zh}</p>}
            </div>
          ))}
        </div>
      )}
      {entry.data.source && (
        <details className="entry-source">
          <summary>AI generated · Gemini</summary>
          <p>Original query: {entry.data.source.query}</p>
          <p>
            {entry.data.source.model} · {dateLabel(entry.data.source.generatedAt)}
          </p>
        </details>
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
      {!draft && (
        <div className="card-actions">
          {onEdit && (
            <button className="text-button" onClick={onEdit}>
              Edit
            </button>
          )}
          {onDelete && (
            <button className="text-button danger" onClick={onDelete}>
              Delete
            </button>
          )}
          {entry.data.practiceEnabled && <span className="practice-mark">● In review</span>}
        </div>
      )}
    </article>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    new URLSearchParams(window.location.search).get('view') === 'revisit' ? 'revisit' : 'lookup',
  )
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
  const [category, setCategory] = useState<EntryCategory>('expressions')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [libraryView, setLibraryView] = useState<LibraryViewMode>(readLibraryView)
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL)
  const [editor, setEditor] = useState<EditorState>(null)
  const [revealed, setRevealed] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const syncBusy = useRef(false)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionRef = useRef<GoogleConnection | null>(null)
  const captureState = useRef({ ready, locked, deviceId })
  captureState.current = { ready, locked, deviceId }
  const captureChanged = useRef<() => Promise<void>>(async () => {})
  const afterSentenceRepair = useRef<() => void>(() => {})

  const refresh = useCallback(async () => {
    const repaired = await repairSentenceVersions()
    const [all, pending, synced] = await Promise.all([
      getOperations(),
      getPendingOperations(),
      getLastSyncedAt(),
    ])
    setOperations(all)
    setPendingCount(pending.length)
    setLastSynced(synced)
    if (repaired) {
      setMessage(
        `Combined identical spoken and written versions in ${repaired} saved sentence${repaired === 1 ? '' : 's'}.`,
      )
      afterSentenceRepair.current()
    }
  }, [])

  useEffect(() => {
    if (CLIENT_ID) void prepareGoogle().catch(() => undefined)
    Promise.all([getDeviceId(), getBoundSubject(), getGeminiKey(), getGeminiModel(), refresh()])
      .then(([device, subject, key, model]) => {
        setDeviceId(device)
        setBoundSubject(subject)
        setGeminiKey(key)
        setGeminiModel(model)
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

  const changeGeminiModel = useCallback(async (model: string) => {
    await persistGeminiModel(model)
    setGeminiModel(model)
  }, [])

  const library = useMemo(() => deriveLibrary(operations), [operations])
  const libraryEntries = useMemo(
    () => library.entries.filter((entry) => !isRevisitEntry(entry.data)),
    [library],
  )
  const revisitEntries = library.entries.filter((entry) => isRevisitEntry(entry.data))
  const due = useMemo(
    () =>
      libraryEntries.filter(
        (entry) => entry.data.practiceEnabled && isDue(entry.id, library.reviews),
      ),
    [library, libraryEntries],
  )
  const filtered = useMemo(
    () => filterLibraryEntries(libraryEntries, query, usageFilter),
    [libraryEntries, query, usageFilter],
  )
  const categoryEntries = filtered.filter((entry) => entryCategory(entry.data.kind) === category)
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
  afterSentenceRepair.current = queueSync

  captureChanged.current = async () => {
    await refresh()
    queueSync()
  }
  useEffect(() => {
    const service = createCaptureService({
      state: () => captureState.current,
      operations: getOperations,
      generate: async (input, signal) => {
        const key = await getGeminiKey()
        const model = await getGeminiModel()
        if (!LOCAL_GEMINI_PROXY && !key)
          throw new Error('Add your Gemini API key in MyLexicon Settings first.')
        if (!navigator.onLine)
          throw new Error('You are offline. This contextual explanation needs Gemini.')
        return lookupGemini(input.text, key, signal, { context: input.context }, model)
      },
      persist: addLocalOperationOnce,
      changed: () => captureChanged.current(),
    })
    const stop = listenForCapture(service.handle)
    return () => {
      stop()
      service.dispose()
    }
  }, [])

  useEffect(
    () =>
      subscribeToChanges(() => {
        void refresh().catch((reason) => setError(errorText(reason)))
      }),
    [refresh],
  )

  useEffect(() => {
    const onOnline = () => {
      if (connectionRef.current) void runSync(connectionRef.current)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (connectionRef.current) void runSync(connectionRef.current)
      else void refresh().catch((reason) => setError(errorText(reason)))
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [runSync, refresh])

  async function saveEntry(value: EntryData, original?: EntryView) {
    if (!deviceId) throw new Error('Device storage is not ready. Reload before saving.')
    const id = original?.id ?? crypto.randomUUID()
    const normalized = normalizeSentenceVersions(value)
    const op = newEntryOperation(id, original ? [original.revision] : [], normalized, deviceId)
    await addLocalOperation(op)
    await refresh()
    setEditor(null)
    setMessage('Saved on this device.')
    queueSync()
    return { id, revision: op.id, updatedAt: op.at, data: normalized }
  }

  async function saveGeneratedEntry(value: EntryData): Promise<EntryView> {
    // Re-read after the network request: another save or sync may have added it.
    const current = await getOperations()
    const byQuery = await resolveQuery(
      value.source?.query ?? value.text,
      current,
      async () => value,
      true,
    )
    if (byQuery.source === 'saved') return byQuery.entries[0]
    const byText = await resolveQuery(value.text, current, async () => value, true)
    if (byText.source === 'saved') return byText.entries[0]
    return saveEntry(value)
  }

  async function removeEntry(entry: EntryView) {
    if (
      !window.confirm(
        `Delete “${entry.data.text}” from ${isRevisitEntry(entry.data) ? 'Revisit' : 'your library'}?`,
      )
    )
      return
    try {
      await addLocalOperation(newEntryOperation(entry.id, [entry.revision], null, deviceId))
      await refresh()
      setMessage('Entry deleted on this device.')
      queueSync()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function finishRevisit(entry: EntryView, practice: boolean) {
    try {
      await saveEntry({ ...entry.data, collection: 'library', practiceEnabled: practice }, entry)
      setMessage(practice ? 'Moved to Library and added to practice.' : 'Moved to Library.')
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
              ['lookup', '✦', 'Home'],
              ['library', '▤', 'Library'],
              ['revisit', '↺', 'Revisit'],
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
              {name === 'revisit' && revisitEntries.length > 0 && <em>{revisitEntries.length}</em>}
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
                  English worth
                  <br />
                  <i>keeping growing.</i>
                </h1>
                <p>
                  Find the right expression. Explore its meaning, or turn a Chinese thought into
                  natural English. Keep it here for next time.
                </p>
              </section>
              <AIQuery
                apiKey={geminiKey}
                model={geminiModel}
                enabled={!!deviceId}
                onSave={saveGeneratedEntry}
                onManual={(text) => setEditor({ initialText: text })}
                onSettings={() => setPage('settings')}
                renderDraft={(data) => <EntryCard entry={{ data }} draft />}
                renderEntry={(result) => {
                  const entry = library.entries.find((item) => item.id === result.id)
                  return entry ? (
                    <EntryCard
                      entry={entry}
                      onEdit={() => setEditor({ entry })}
                      onDelete={() => void removeEntry(entry)}
                    />
                  ) : (
                    <p className="helper">This entry is no longer in the library.</p>
                  )
                }}
              />
              <section className="overview">
                <div className="overview-card">
                  <span>YOUR COLLECTION</span>
                  <strong>{library.entries.length}</strong>
                  <p>saved expressions</p>
                </div>
                <div className="overview-card accent">
                  <span>READY TO PRACTISE</span>
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
              {libraryEntries.length > 0 && (
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
                    {libraryEntries.slice(0, 3).map((entry) => (
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
              <div className="library-filters">
                <div className="category-tabs" role="group" aria-label="Library category">
                  {(
                    [
                      ['expressions', 'Words & phrases'],
                      ['sentences', 'Sentences'],
                    ] as const
                  ).map(([name, label]) => (
                    <button
                      key={name}
                      className={category === name ? 'active' : ''}
                      aria-pressed={category === name}
                      onClick={() => setCategory(name)}
                    >
                      {label}
                      <span>
                        {filtered.filter((entry) => entryCategory(entry.data.kind) === name).length}
                      </span>
                    </button>
                  ))}
                </div>
                <LibraryUsageFilter value={usageFilter} onChange={setUsageFilter} />
              </div>
              <LibraryDisplayOptions
                value={libraryView}
                onChange={(value) => {
                  setLibraryView(value)
                  rememberLibraryView(value)
                }}
              />
              {library.conflicts.length > 0 && (
                <div className="notice">
                  {library.conflicts.length} entry conflict
                  {library.conflicts.length === 1 ? '' : 's'} need your choice in Settings.
                </div>
              )}
              {categoryEntries.length ? (
                <div
                  className={
                    libraryView === 'list'
                      ? 'library-entry-list'
                      : libraryView === 'preview'
                        ? 'entry-grid library-preview-grid'
                        : 'entry-grid'
                  }
                >
                  {categoryEntries.map((entry) =>
                    libraryView === 'cards' ? (
                      <EntryCard
                        key={`${libraryView}-${entry.id}`}
                        entry={entry}
                        onEdit={() => setEditor({ entry })}
                        onDelete={() => void removeEntry(entry)}
                      />
                    ) : (
                      <LibraryCompactEntry
                        key={`${libraryView}-${entry.id}`}
                        entry={entry}
                        mode={libraryView}
                        renderFullEntry={(item) => (
                          <EntryCard
                            entry={item}
                            onEdit={() => setEditor({ entry: item })}
                            onDelete={() => void removeEntry(item)}
                          />
                        )}
                      />
                    ),
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">Aa</div>
                  <h2>
                    {query.trim() || usageFilter !== 'all'
                      ? 'No entries match these filters'
                      : category === 'sentences'
                        ? 'Your sentences start here'
                        : 'Your words & phrases start here'}
                  </h2>
                  <p>
                    {query.trim() || usageFilter !== 'all'
                      ? 'Try another search, usage filter, or category.'
                      : 'Look up something new on the homepage, or add an entry manually.'}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery('')
                      setUsageFilter('all')
                      if (!query.trim() && usageFilter === 'all') setPage('lookup')
                    }}
                  >
                    {query.trim() || usageFilter !== 'all' ? 'Clear filters' : 'Look up something'}
                  </button>
                </div>
              )}
            </>
          )}
          {page === 'revisit' && (
            <Revisit
              entries={revisitEntries}
              onEdit={(entry) => setEditor({ entry })}
              onDelete={(entry) => void removeEntry(entry)}
              onFinish={finishRevisit}
              renderDetails={(entry) => <EntryCard entry={entry} />}
              onSettings={() => setPage('settings')}
            />
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
                  of {libraryEntries.filter((entry) => entry.data.practiceEnabled).length} in review
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
                <GeminiSettings
                  apiKey={geminiKey}
                  model={geminiModel}
                  onChange={setGeminiKey}
                  onModelChange={changeGeminiModel}
                />
                <section className="settings-card">
                  <span className="eyebrow">KEEP YOUR READING FLOW</span>
                  <h2>Browser capture</h2>
                  <p>
                    Select a word, phrase, or sentence in Chrome or Edge, then use MyLexicon Capture
                    to see its meaning in Chinese. Keep interesting expressions in Revisit.
                  </p>
                  <a
                    className="button secondary"
                    href={`${import.meta.env.BASE_URL}mylexicon-capture.zip`}
                    download
                  >
                    Download extension
                  </a>
                  <p className="helper">
                    Unzip the download. In your browser’s Extensions page, enable Developer mode and
                    choose Load unpacked, selecting the unzipped folder. Open the extension’s
                    Options and set this service address:
                  </p>
                  <code className="service-address">
                    {window.location.origin}
                    {import.meta.env.BASE_URL}
                  </code>
                  <p className="helper">
                    Use your existing Gemini setup. The service must be open and unlocked in the
                    same browser profile; capture can open a background service tab. New
                    explanations send only your selection and a short surrounding passage to Gemini.
                  </p>
                </section>
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
            ['lookup', '✦', 'Home'],
            ['library', '▤', 'Library'],
            ['revisit', '↺', 'Revisit'],
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
