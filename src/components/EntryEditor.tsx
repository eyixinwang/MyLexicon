import { useState, type FormEvent } from 'react'
import { emptyEntry, type EntryData, type EntryView } from '../domain/model'

interface Props {
  entry?: EntryView
  initialText?: string
  onSave: (value: EntryData, original?: EntryView) => Promise<void>
  onCancel: () => void
}

export function EntryEditor({ entry, initialText = '', onSave, onCancel }: Props) {
  const [data, setData] = useState<EntryData>(
    () =>
      entry?.data ?? {
        ...emptyEntry(),
        text: initialText,
        kind: /[.!?]$/.test(initialText.trim())
          ? 'sentence'
          : /\s/.test(initialText.trim())
            ? 'phrase'
            : 'word',
      },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = <K extends keyof EntryData>(key: K, value: EntryData[K]) =>
    setData((current) => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!data.text.trim()) return setError('Add the English text first.')
    setSaving(true)
    setError('')
    try {
      await onSave(
        {
          ...data,
          text: data.text.trim(),
          tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
        },
        entry,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this entry.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <form className="editor" onSubmit={submit}>
      <div className="editor-heading">
        <div>
          <span className="eyebrow">YOUR COLLECTION</span>
          <h2>{entry ? 'Edit this entry' : 'A new entry'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Close editor">
          ×
        </button>
      </div>
      <div className="form-grid">
        <label className="field full">
          English word, phrase, or sentence
          <input
            autoFocus
            maxLength={5000}
            value={data.text}
            onChange={(e) => update('text', e.target.value)}
            placeholder="e.g. get around to"
            required
          />
        </label>
        <label className="field">
          Type
          <select
            value={data.kind}
            onChange={(e) => update('kind', e.target.value as EntryData['kind'])}
          >
            <option value="word">Word</option>
            <option value="phrase">Phrase</option>
            <option value="sentence">Sentence</option>
          </select>
        </label>
        <label className="field">
          Chinese meaning
          <input
            value={data.meaningZh}
            onChange={(e) => update('meaningZh', e.target.value)}
            placeholder="中文意思"
          />
        </label>
        <label className="field full">
          Where you saw or would use it
          <textarea
            rows={2}
            value={data.context}
            onChange={(e) => update('context', e.target.value)}
            placeholder="The sentence, message, or situation…"
          />
        </label>
        <label className="field">
          English explanation
          <textarea
            rows={2}
            value={data.definitionEn}
            onChange={(e) => update('definitionEn', e.target.value)}
            placeholder="A meaning in your own words"
          />
        </label>
        <label className="field">
          Usage pattern
          <textarea
            rows={2}
            value={data.usage}
            onChange={(e) => update('usage', e.target.value)}
            placeholder="Common structure or combination"
          />
        </label>
        <label className="field">
          Register / setting
          <input
            value={data.register}
            onChange={(e) => update('register', e.target.value)}
            placeholder="Casual, work email, academic…"
          />
        </label>
        <label className="field">
          Tone and connotation
          <input
            value={data.toneNotes}
            onChange={(e) => update('toneNotes', e.target.value)}
            placeholder="Warm, direct, critical…"
          />
        </label>
        <label className="field full">
          Tags <span className="field-hint">separate with commas</span>
          <input
            value={data.tags.join(', ')}
            onChange={(e) => update('tags', e.target.value.split(','))}
            placeholder="work, conversation"
          />
        </label>
        <label className="field full">
          Personal notes
          <textarea
            rows={3}
            value={data.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="What will help you remember it?"
          />
        </label>
      </div>
      <button
        type="button"
        className="review-toggle"
        aria-pressed={data.practiceEnabled}
        onClick={() => update('practiceEnabled', !data.practiceEnabled)}
      >
        <span aria-hidden="true">{data.practiceEnabled ? '✓' : '+'}</span>{' '}
        {data.practiceEnabled ? 'Added to review' : 'Add to review'}
      </button>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </form>
  )
}
