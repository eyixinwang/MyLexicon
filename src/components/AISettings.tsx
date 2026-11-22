import { useState, useEffect } from 'react'
import { providers, suggestProvider, type AIProfile, type Provider } from '../ai/providerConfig'
import { canConnect, loadModels } from '../ai/providerClient'
import { readAIProfile, saveAIKey, saveAIModel } from '../data/storage'

export function AISettings({
  profile,
  onChange,
}: {
  profile: AIProfile
  onChange: (profile: AIProfile) => void
}) {
  const [input, setInput] = useState('')
  const [revision, refresh] = useState(0)
  const [models, setModels] = useState<Awaited<ReturnType<typeof loadModels>>>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [message, setMessage] = useState('')
  const { provider, key, model } = profile
  const config = providers[provider]
  const hint = suggestProvider(input)
  const mismatch = hint && hint !== provider
  const connected = canConnect(profile)
  useEffect(() => {
    const abort = new AbortController()
    let active = true
    setModels([])
    setCatalogError('')
    setLoading(connected)
    if (!connected) return
    const timeout = setTimeout(() => abort.abort(), 20000)
    loadModels({ provider, key, model: '' }, abort.signal)
      .then((list) => {
        if (active) setModels(list)
      })
      .catch((reason) => {
        if (active)
          setCatalogError(
            abort.signal.aborted
              ? 'Model discovery timed out. Try refreshing.'
              : reason instanceof Error
                ? reason.message
                : 'Could not load models.',
          )
      })
      .finally(() => {
        clearTimeout(timeout)
        if (active) setLoading(false)
      })
    return () => {
      active = false
      clearTimeout(timeout)
      abort.abort()
    }
  }, [provider, key, connected, revision])

  async function update(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await task()
    } catch {
      setError('Could not update settings on this device.')
    } finally {
      setBusy(false)
    }
  }
  function switchProvider(next: Provider) {
    void update(async () => {
      const nextProfile = await readAIProfile(next)
      setModels([])
      onChange(nextProfile)
    })
  }
  function saveKey(next: string) {
    void update(async () => {
      await saveAIKey(provider, next)
      setModels([])
      onChange({ ...profile, key: next })
      setInput('')
      refresh((n) => n + 1)
      setMessage(next ? 'Key saved on this device.' : 'Key removed from this device.')
    })
  }
  return (
    <section className="settings-card">
      <h2>AI provider</h2>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="field">
          Provider
          <select value={provider} onChange={(e) => switchProvider(e.target.value as Provider)}>
            {Object.entries(providers).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="helper">
          Model discovery, new queries and browser captures use {config.host}.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim() && !mismatch) saveKey(input.trim())
          }}
        >
          <label className="field">
            {key ? 'Replace API key' : 'API key'}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={2000}
              value={input}
              placeholder={
                key ? 'A key is saved for this provider' : 'Paste your provider’s API key'
              }
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          {input.trim() && (
            <p className="helper">
              {hint
                ? 'This key looks like a ' + providers[hint].label + ' key.'
                : 'This key format is ambiguous. Confirm the provider above.'}
              {mismatch && ' Select that provider before saving.'}
            </p>
          )}
          <div className="button-row">
            <button className="button primary" disabled={!input.trim() || !!mismatch}>
              Save key for {config.label}
            </button>
            {key && (
              <button type="button" className="button ghost" onClick={() => saveKey('')}>
                Remove key
              </button>
            )}
          </div>
        </form>
        <div className="gemini-model-picker">
          <label className="field">
            AI model
            <select
              value={model}
              disabled={loading || !models.some((m) => m.selectable)}
              onChange={(e) => {
                const name = e.target.value
                void update(async () => {
                  await saveAIModel(provider, name)
                  onChange({ ...profile, model: name })
                  setMessage('Model saved on this device.')
                })
              }}
            >
              {!models.some((m) => m.name === model) && (
                <option value={model} disabled>
                  {model || 'Choose a model'}
                </option>
              )}
              {models.map((m) => (
                <option key={m.name} value={m.name} disabled={!m.selectable}>
                  {m.name}
                  {m.selectable ? '' : ' · Unsupported for lookup'}
                </option>
              ))}
            </select>
          </label>
          <div className="gemini-model-actions">
            <span role="status">
              {loading
                ? 'Loading models…'
                : !connected
                  ? 'Save a key to load models.'
                  : catalogError
                    ? 'Model list unavailable.'
                    : models.length === 0
                      ? config.label + ' returned an empty model list for this key.'
                      : models.length + ' models listed'}
            </span>
            <button
              className="text-button"
              disabled={!connected || loading}
              onClick={() => refresh((n) => n + 1)}
            >
              Refresh models
            </button>
          </div>
          {connected && !key && <p className="helper">Using the private local development key.</p>}
          {model && models.length > 0 && !models.some((m) => m.name === model && m.selectable) && (
            <p className="helper">Choose an available model for this provider.</p>
          )}
          {models.find((m) => m.name === model)?.description && (
            <p className="helper">{models.find((m) => m.name === model)?.description}</p>
          )}
          {models.length > 0 && (
            <details className="gemini-model-catalog">
              <summary>All {models.length} available models</summary>
              <ul>
                {models.map((m) => (
                  <li key={m.name}>
                    <strong>{m.name}</strong>
                    <span>{m.description}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="helper">
            Choose a model that supports structured text. Check your account tier and{' '}
            <a href={config.pricing} target="_blank" rel="noreferrer">
              provider pricing
            </a>{' '}
            before querying.
          </p>
        </div>
      </fieldset>
      <p className="helper">
        Each provider’s key and model stay in this browser. Saved keys are accessible to site code
        and excluded from Drive sync and backups.
      </p>
      {message && <p role="status">{message}</p>}
      {(error || catalogError) && (
        <p className="message error" role="alert">
          {error || catalogError}
        </p>
      )}
    </section>
  )
}
