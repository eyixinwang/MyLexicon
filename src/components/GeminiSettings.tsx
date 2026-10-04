import { useState, type FormEvent } from 'react'
import { LOCAL_GEMINI_PROXY } from '../ai/client'
import { GEMINI_MODEL } from '../ai/gemini'
import { setGeminiKey } from '../data/storage'

export function GeminiSettings({
  apiKey,
  onChange,
}: {
  apiKey: string
  onChange: (key: string) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault()
    await update(input.trim())
  }
  async function update(key: string) {
    setBusy(true)
    setError('')
    try {
      await setGeminiKey(key)
      onChange(key)
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
        <span>Model</span>
        <strong>{GEMINI_MODEL}</strong>
      </div>
      <div className="setting-line">
        <span>Status</span>
        <strong>
          {LOCAL_GEMINI_PROXY
            ? 'Private local connection ready'
            : apiKey
              ? 'Key saved on this device'
              : 'API key needed for new queries'}
        </strong>
      </div>
      {LOCAL_GEMINI_PROXY ? (
        <p className="helper">
          Local development uses the private key in .env.local through the local server. The key is
          excluded from the built website.
        </p>
      ) : (
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
      )}
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
