import { useState, type FormEvent } from 'react'
import {
  emptyEntry,
  type EntryData,
  type EntryView,
  type TranslationAlternative,
} from '../domain/model'

interface Props {
  entry?: EntryView
  initialText?: string
  initialData?: EntryData
  onSave: (value: EntryData, original?: EntryView) => Promise<unknown>
  onCancel: () => void
}

export function EntryEditor({ entry, initialText = '', initialData, onSave, onCancel }: Props) {
  const [data, setData] = useState<EntryData>(
    () =>
      entry?.data ??
      initialData ?? {
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
  const updateAlternative = (index: number, fields: Partial<TranslationAlternative>) =>
    setData((current) => ({
      ...current,
      alternatives: (current.alternatives ?? []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...fields } : item,
      ),
    }))
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!data.text.trim()) return setError('Add the English text first.')
    const alternatives = (data.alternatives ?? [])
      .map((alternative) => ({
        ...alternative,
        en: alternative.en.trim(),
        contextZh: alternative.contextZh.trim(),
        meaningNotesZh: alternative.meaningNotesZh.trim(),
      }))
      .filter(
        (alternative) => alternative.en || alternative.contextZh || alternative.meaningNotesZh,
      )
    if (alternatives.some((alternative) => !alternative.en))
      return setError('Add English text for each alternative, or remove the empty option.')
    setSaving(true)
    setError('')
    try {
      await onSave(
        {
          ...data,
          text: data.text.trim(),
          pronunciationUk: data.pronunciationUk?.trim(),
          pronunciationUs: data.pronunciationUs?.trim(),
          tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
          alternatives,
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
          <h2>
            {entry ? 'Edit this entry' : initialData?.source ? 'Edit AI response' : 'A new entry'}
          </h2>
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
          Part of speech
          <input
            value={data.partOfSpeech ?? ''}
            maxLength={500}
            onChange={(e) => update('partOfSpeech', e.target.value)}
            placeholder="Noun, adjective, phrasal verb…"
          />
        </label>
        <label className="field">
          British pronunciation (IPA)
          <input
            value={data.pronunciationUk ?? ''}
            maxLength={500}
            onChange={(e) => update('pronunciationUk', e.target.value)}
            placeholder="British IPA in /slashes/"
          />
        </label>
        <label className="field">
          American pronunciation (IPA)
          <input
            value={data.pronunciationUs ?? ''}
            maxLength={500}
            onChange={(e) => update('pronunciationUs', e.target.value)}
            placeholder="American IPA in /slashes/"
          />
        </label>
        {(entry?.data.pronunciation || initialData?.pronunciation) && (
          <label className="field">
            Existing pronunciation
            <input
              value={data.pronunciation ?? ''}
              maxLength={500}
              onChange={(e) => update('pronunciation', e.target.value)}
            />
            <span className="field-hint">Original note; edit UK/US IPA in the fields above.</span>
          </label>
        )}
        <label className="field">
          Usually used in
          <select
            value={data.medium ?? ''}
            onChange={(e) =>
              update('medium', e.target.value ? (e.target.value as EntryData['medium']) : undefined)
            }
          >
            <option value="">Not classified</option>
            <option value="both">Speaking & writing</option>
            <option value="spoken">Speaking</option>
            <option value="written">Writing</option>
          </select>
        </label>
        <label className="field">
          Domain
          <input
            value={data.domain ?? ''}
            maxLength={500}
            onChange={(e) => update('domain', e.target.value)}
            placeholder="Everyday, business, academic…"
          />
        </label>
        <label className="field full">
          Spoken version
          <textarea
            rows={2}
            maxLength={5000}
            value={data.spokenVersion ?? ''}
            onChange={(e) => update('spokenVersion', e.target.value)}
            placeholder="A natural way to say it in conversation, if applicable"
          />
        </label>
        <label className="field full">
          Written version
          <textarea
            rows={2}
            maxLength={5000}
            value={data.writtenVersion ?? ''}
            onChange={(e) => update('writtenVersion', e.target.value)}
            placeholder="A natural version for writing, if applicable"
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
      <div className="example-editor">
        <div className="example-editor-heading">
          <strong>Contextual alternatives</strong>
          <button
            type="button"
            className="text-button"
            disabled={(data.alternatives?.length ?? 0) >= 10}
            onClick={() =>
              update('alternatives', [
                ...(data.alternatives ?? []),
                { en: '', contextZh: '', medium: 'both', meaningNotesZh: '' },
              ])
            }
          >
            + Add alternative
          </button>
        </div>
        {(data.alternatives ?? []).map((alternative, index) => (
          <div className="example-fields" key={index}>
            <label className="field">
              English alternative {index + 1}
              <textarea
                rows={2}
                maxLength={5000}
                value={alternative.en}
                onChange={(e) => updateAlternative(index, { en: e.target.value })}
              />
            </label>
            <label className="field">
              Context & tone {index + 1} · 语境与语气
              <textarea
                rows={2}
                maxLength={1000}
                value={alternative.contextZh}
                onChange={(e) => updateAlternative(index, { contextZh: e.target.value })}
                placeholder="适合什么场合？语气、正式程度或强调什么？"
              />
            </label>
            <label className="field">
              Used in alternative {index + 1}
              <select
                value={alternative.medium}
                onChange={(e) =>
                  updateAlternative(index, {
                    medium: e.target.value as TranslationAlternative['medium'],
                  })
                }
              >
                <option value="both">Speaking & writing</option>
                <option value="spoken">Speaking</option>
                <option value="written">Writing</option>
              </select>
            </label>
            <label className="field">
              Meaning differences {index + 1} · 含义差别
              <textarea
                rows={2}
                maxLength={1000}
                value={alternative.meaningNotesZh}
                onChange={(e) => updateAlternative(index, { meaningNotesZh: e.target.value })}
                placeholder="与原意相比有什么变化？没有则留空。"
              />
            </label>
            <button
              type="button"
              className="text-button danger"
              aria-label={`Remove alternative ${index + 1}`}
              onClick={() =>
                update(
                  'alternatives',
                  data.alternatives!.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              Remove alternative
            </button>
          </div>
        ))}
      </div>
      <div className="example-editor">
        <div className="example-editor-heading">
          <strong>Usage examples</strong>
          <button
            type="button"
            className="text-button"
            disabled={(data.examples?.length ?? 0) >= 10}
            onClick={() => update('examples', [...(data.examples ?? []), { en: '', zh: '' }])}
          >
            + Add example
          </button>
        </div>
        {(data.examples ?? []).map((example, index) => (
          <div className="example-fields" key={index}>
            <label className="field">
              English example {index + 1}
              <textarea
                rows={2}
                maxLength={5000}
                value={example.en}
                onChange={(e) =>
                  update(
                    'examples',
                    data.examples!.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, en: e.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              Chinese translation {index + 1}
              <textarea
                rows={2}
                maxLength={5000}
                value={example.zh}
                onChange={(e) =>
                  update(
                    'examples',
                    data.examples!.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, zh: e.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                update(
                  'examples',
                  data.examples!.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              Remove example
            </button>
          </div>
        ))}
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
