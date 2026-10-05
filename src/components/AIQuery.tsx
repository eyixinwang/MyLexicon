import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { lookupGemini, LOCAL_GEMINI_PROXY } from '../ai/client'
import { QUERY_LIMIT } from '../ai/gemini'
import { resolveQuery } from '../ai/lookup'
import { getOperations } from '../data/storage'
import { type EntryData, type EntryView } from '../domain/model'
import { EntryEditor } from './EntryEditor'

interface Props {
  apiKey: string
  model: string
  enabled: boolean
  onSave: (data: EntryData) => Promise<EntryView>
  onManual: (text: string) => void
  onSettings: () => void
  renderEntry: (entry: EntryView) => ReactNode
  renderDraft: (data: EntryData) => ReactNode
}

export function AIQuery({
  apiKey,
  model,
  enabled,
  onSave,
  onManual,
  onSettings,
  renderEntry,
  renderDraft,
}: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    query: string
    source: 'saved' | 'related' | 'gemini'
    entries: EntryView[]
  }>()
  const [draft, setDraft] = useState<EntryData>()
  const [editing, setEditing] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  useEffect(() => () => controller.current?.abort(), [])

  async function run(text: string, useAI = false) {
    if (busyRef.current || !enabled) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setResult(undefined)
    setDraft(undefined)
    setEditing(false)
    const abort = new AbortController()
    controller.current = abort
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      setStage('Searching your lexicon…')
      const resolved = await resolveQuery(
        text,
        await getOperations(),
        async () => {
          if (abort.signal.aborted) throw new Error('Query cancelled. Nothing was saved.')
          if (!LOCAL_GEMINI_PROXY && !apiKey)
            throw new Error('Add your Gemini API key in Settings to look up new expressions.')
          if (!navigator.onLine)
            throw new Error(
              'You’re offline. Saved entries are available; reconnect to ask Gemini for something new.',
            )
          setStage('Asking Gemini…')
          timeout = setTimeout(() => abort.abort(), 65000)
          const data = await lookupGemini(text, apiKey, abort.signal, undefined, model)
          clearTimeout(timeout)
          return data
        },
        useAI,
      )
      if (abort.signal.aborted) throw new Error('Query cancelled. Nothing was saved.')
      if (resolved.source !== 'gemini') {
        setResult({ query: text, source: resolved.source, entries: resolved.entries })
        return
      }
      // A generated answer stays transient until the user chooses to save it.
      setDraft(resolved.data)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not complete your query. Please try again.',
      )
    } finally {
      clearTimeout(timeout)
      controller.current = null
      busyRef.current = false
      setBusy(false)
      setStage('')
    }
  }

  async function saveDraft(data: EntryData) {
    if (busyRef.current || !enabled) return
    busyRef.current = true
    setBusy(true)
    setStage('Saving to your lexicon…')
    setError('')
    setDraft(data)
    try {
      const entry = await onSave(data)
      setDraft(undefined)
      setEditing(false)
      setResult({ query: data.source?.query ?? query.trim(), source: 'gemini', entries: [entry] })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save this response. Please try again.',
      )
      throw reason
    } finally {
      busyRef.current = false
      setBusy(false)
      setStage('')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (query.trim()) void run(query.trim())
  }

  return (
    <section className="capture-panel">
      <div className="section-kicker">
        <span className="kicker-symbol">✦</span> YOUR AI LANGUAGE COMPANION
      </div>
      <h2>How would you say it?</h2>
      <form onSubmit={submit}>
        <div className="capture-input ai-input">
          <textarea
            aria-label="Word, phrase, sentence, or Chinese translation query"
            rows={2}
            maxLength={QUERY_LIMIT}
            value={query}
            disabled={busy}
            onChange={(event) => {
              setQuery(event.target.value)
              setResult(undefined)
              setError('')
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (query.trim()) void run(query.trim())
              }
            }}
            placeholder="A word, a phrase, a sentence… or “我想礼貌地说我需要更多时间”"
          />
          <button className="button primary" disabled={busy || !query.trim() || !enabled}>
            {busy ? 'Looking up…' : 'Look up'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
      <div className="query-tools">
        <p className="helper">Saved entries first. Review new answers, then save or edit them.</p>
        <button
          className="text-button"
          disabled={busy || !enabled}
          onClick={() => onManual(query.trim())}
        >
          Add manually
        </button>
      </div>
      {!LOCAL_GEMINI_PROXY && !apiKey && (
        <p className="helper">
          <button className="text-button" onClick={onSettings}>
            Connect Gemini in Settings →
          </button>{' '}
          You can search saved entries now.
        </p>
      )}
      {busy && (
        <div className="query-status" role="status">
          <span>{stage}</span>
          {stage !== 'Saving to your lexicon…' && (
            <button className="text-button" onClick={() => controller.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
      )}
      {error && !editing && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div className="query-results">
          <div className="query-result-heading" role="status">
            <strong>Review your response</strong>
            <span className="muted small">Gemini · Not saved</span>
          </div>
          <p className="helper query-submitted">For “{draft.source?.query ?? query.trim()}”</p>
          <p className="draft-prompt">
            Would you like to save this response or make changes first?
          </p>
          {editing ? (
            <div className="draft-editor">
              <EntryEditor
                initialData={draft}
                onSave={saveDraft}
                onCancel={() => {
                  if (!busy) {
                    setEditing(false)
                    setError('')
                  }
                }}
              />
            </div>
          ) : (
            <>
              {renderDraft(draft)}
              <div className="button-row draft-actions">
                <button
                  className="button primary"
                  disabled={busy || !enabled}
                  onClick={() => void saveDraft(draft).catch(() => undefined)}
                >
                  {busy ? 'Saving…' : 'Save response'}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(true)
                    setError('')
                  }}
                >
                  Edit before saving
                </button>
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={() => {
                    setDraft(undefined)
                    setError('')
                  }}
                >
                  Discard response
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {result && (
        <div className="query-results">
          <div className="query-result-heading" role="status">
            <strong>
              {result.source === 'saved'
                ? 'Already in your lexicon'
                : result.source === 'related'
                  ? 'Related entries in your lexicon'
                  : 'Saved to your lexicon'}
            </strong>
            <span className="muted small">
              {result.source === 'gemini' ? 'Gemini · AI generated' : 'No AI request used'}
            </span>
          </div>
          <p className="helper query-submitted">For “{result.query}”</p>
          {result.source === 'related' && (
            <p className="helper">
              If these don’t answer your query,{' '}
              <button className="text-button" onClick={() => void run(result.query, true)}>
                ask Gemini for this expression →
              </button>
            </p>
          )}
          <div className="entry-grid">
            {result.entries.map((entry) => (
              <div key={entry.id}>{renderEntry(entry)}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
