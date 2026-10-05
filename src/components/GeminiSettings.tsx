import { useEffect, useState, type FormEvent } from 'react'
import { loadGeminiModels, LOCAL_GEMINI_PROXY } from '../ai/client'
import { supportsContentGeneration, type GeminiModel } from '../ai/models'
import { setGeminiKey } from '../data/storage'

export function GeminiSettings({
  apiKey,
  model,
  onChange,
  onModelChange,
}: {
  apiKey: string
  model: string
  onChange: (key: string) => void
  onModelChange: (model: string) => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<{ key: string; models: GeminiModel[] }>()
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [reload, setReload] = useState(0)
  const connected = !!apiKey || LOCAL_GEMINI_PROXY
  const models = catalog?.key === apiKey ? catalog.models : []
  const selected = models.find((item) => item.name === model)

  useEffect(() => {
    setCatalog(undefined)
    setModelError('')
    if (!connected) {
      setLoadingModels(false)
      return
    }
    const controller = new AbortController()
    let active = true
    const timeout = setTimeout(() => controller.abort(), 20000)
    setLoadingModels(true)
    void loadGeminiModels(apiKey, controller.signal)
      .then((available) => {
        if (!controller.signal.aborted) setCatalog({ key: apiKey, models: available })
      })
      .catch((reason) => {
        // Unmount/key replacement aborts are ignored; timeouts are shown while mounted.
        if (active)
          setModelError(reason instanceof Error ? reason.message : 'Could not load Gemini models.')
      })
      .finally(() => {
        clearTimeout(timeout)
        if (active) setLoadingModels(false)
      })
    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [apiKey, connected, reload])

  async function selectModel(name: string) {
    if (!models.some((item) => item.name === name && supportsContentGeneration(item))) return
    setSavingModel(true)
    setError('')
    try {
      await onModelChange(name)
      setMessage('Model saved on this device. New queries and browser capture will use it.')
    } catch {
      setError('Could not save the selected model. Please try again.')
    } finally {
      setSavingModel(false)
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    await update(input.trim())
  }
  async function update(key: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await setGeminiKey(key)
      onChange(key)
      setReload((value) => value + 1)
      setInput('')
      setMessage(key ? 'API key saved on this device.' : 'API key removed from this device.')
    } catch {
      setError('Could not update the API key on this device.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="settings-card">
      <span className="eyebrow">AI LOOKUP & TRANSLATION</span>
      <h2>Google Gemini</h2>
      <p>
        Explain English expressions or translate Chinese into natural spoken and written English.
      </p>
      <div className="setting-line">
        <span>Selected model</span>
        <strong>{model}</strong>
      </div>
      <div className="setting-line">
        <span>Status</span>
        <strong>
          {apiKey
            ? 'Key saved on this device'
            : LOCAL_GEMINI_PROXY
              ? 'Private local connection ready'
              : 'API key needed for new queries'}
        </strong>
      </div>
      {LOCAL_GEMINI_PROXY && !apiKey && (
        <p className="helper">
          The local development key is ready. Save a different key below to use its models instead.
        </p>
      )}
      <form onSubmit={save}>
        <label className="field">
          {apiKey ? 'Replace API key' : 'Gemini API key'}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={input}
            maxLength={500}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              apiKey
                ? 'Enter a new key to replace the saved one'
                : 'Paste your Google AI Studio API key'
            }
          />
        </label>
        <div className="button-row">
          <button className="button primary" disabled={busy || !input.trim()}>
            {busy ? 'Saving…' : 'Save key'}
          </button>
          {apiKey && (
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => void update('')}
            >
              Remove key
            </button>
          )}
        </div>
      </form>
      <div className="gemini-model-picker">
        <label className="field">
          AI model
          <select
            value={selected && supportsContentGeneration(selected) ? model : ''}
            disabled={
              busy || loadingModels || savingModel || !models.some(supportsContentGeneration)
            }
            onChange={(event) => void selectModel(event.target.value)}
          >
            <option value="" disabled>
              {loadingModels ? 'Loading available models…' : 'Choose a model'}
            </option>
            {models.map((item) => (
              <option key={item.name} value={item.name} disabled={!supportsContentGeneration(item)}>
                {item.name}
                {!supportsContentGeneration(item) ? ' · No content generation' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="gemini-model-actions">
          <p className="helper" role="status">
            {loadingModels
              ? 'Loading the models available to this key…'
              : savingModel
                ? 'Saving model…'
                : catalog?.key === apiKey
                  ? `${models.length} models loaded · ${models.filter(supportsContentGeneration).length} support generation`
                  : connected
                    ? 'Model list unavailable. Try Refresh models.'
                    : 'Save a key to load its available models.'}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={!connected || busy || loadingModels || savingModel}
            onClick={() => setReload((value) => value + 1)}
          >
            Refresh models
          </button>
        </div>
        {selected?.description && <p className="helper">{selected.description}</p>}
        {catalog?.key === apiKey && !selected && (
          <p className="helper">
            Your saved model was not returned for this key. Choose another model from the list.
          </p>
        )}
        {catalog?.key === apiKey && !models.some(supportsContentGeneration) && (
          <p className="helper">This key has no models that support content generation.</p>
        )}
        {models.length > 0 && (
          <details className="gemini-model-catalog">
            <summary>All {models.length} available models</summary>
            <ul>
              {models.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.supportedGenerationMethods.join(', ') || 'No generation methods listed'}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="helper">
          Choose a model that returns structured text for language queries. Other model types are
          listed too; models without content generation cannot be selected.
        </p>
        <p className="helper">
          Availability does not confirm free usage. Check{' '}
          <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">
            Google’s pricing
          </a>{' '}
          and your{' '}
          <a href="https://aistudio.google.com" target="_blank" rel="noreferrer">
            AI Studio project tier
          </a>{' '}
          before querying. Loading this list does not generate an AI response.
        </p>
        {modelError && (
          <p className="message error" role="alert">
            {modelError}
          </p>
        )}
      </div>
      <p className="helper">
        On the hosted app, your key stays in this browser’s device storage and requests go directly
        to Google. It is accessible to this browser and site code. It is excluded from Drive sync
        and JSON backups; set it separately on each device.
      </p>
      <p className="helper">
        Only submitted new queries go to Gemini. Saved matches work offline. Usage follows your
        Google project’s quota and billing.
      </p>
      {message && (
        <p className="helper" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
