import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { EntryVersions } from '../components/EntryVersions'
import { EntryCard } from '../App'
import {
  deriveLibrary,
  emptyEntry,
  type EntryData,
  type EntryOperation,
  type Operation,
} from './model'
import {
  entryVersions,
  normalizeSentenceVersions,
  planSentenceVersionRepairs,
} from './sentenceVersions'
import { parseOperations } from './validation'
import { searchEntries } from './search'

const sentence = (fields: Partial<EntryData> = {}): EntryData => ({
  ...emptyEntry(),
  kind: 'sentence',
  text: "I'm ready.",
  spokenVersion: "I'm ready.",
  writtenVersion: "I'm ready.",
  meaningZh: '我准备好了。',
  medium: 'spoken',
  practiceEnabled: true,
  examples: [{ en: "I'm ready to go.", zh: '我准备好出发了。' }],
  notes: 'Personal note',
  source: {
    provider: 'gemini',
    model: 'test',
    query: '我准备好了',
    generatedAt: '2026-10-04T00:00:00Z',
  },
  ...fields,
})
const operation = (
  id: string,
  value: EntryData | null,
  parents: string[] = [],
): EntryOperation => ({
  schemaVersion: 1,
  type: 'entry',
  id,
  entryId: id.split('-')[0],
  deviceId: 'original',
  at: '2026-10-04T00:00:00Z',
  parents,
  value,
})

describe('sentence version consolidation', () => {
  it('merges formatting-equivalent versions, preserves all learning data, and is idempotent', () => {
    const original = sentence({ writtenVersion: '  I’m   ready. ' })
    const corrected = normalizeSentenceVersions(original)
    expect(corrected).toEqual({
      ...original,
      sharedVersion: "I'm ready.",
      spokenVersion: '',
      writtenVersion: '',
      medium: 'both',
    })
    expect(corrected.examples).toBe(original.examples)
    expect(corrected.source).toBe(original.source)
    expect(normalizeSentenceVersions(corrected)).toBe(corrected)
    expect(original.spokenVersion).toBe("I'm ready.")
  })

  it('keeps distinct wording, punctuation, case, empty versions, and a separate shared expression', () => {
    for (const fields of [
      { writtenVersion: 'I am prepared.' },
      { writtenVersion: "I'm ready?" },
      { spokenVersion: 'Tell US.', writtenVersion: 'Tell us.' },
      { spokenVersion: '', writtenVersion: '' },
      { spokenVersion: undefined },
      { sharedVersion: 'I can begin.' },
      { kind: 'phrase' as const },
    ]) {
      const data = sentence(fields)
      expect(normalizeSentenceVersions(data)).toBe(data)
    }
  })

  it('marks a matching contextual option as both without altering its context or notes', () => {
    const corrected = normalizeSentenceVersions(
      sentence({
        text: 'I am prepared.',
        medium: 'written',
        alternatives: [
          {
            en: 'I’m ready.',
            medium: 'spoken',
            contextZh: '日常口语，轻松自然。',
            meaningNotesZh: '较随意。',
          },
        ],
      }),
    )
    expect(corrected.medium).toBe('written')
    expect(corrected.alternatives).toEqual([
      {
        en: 'I’m ready.',
        medium: 'both',
        contextZh: '日常口语，轻松自然。',
        meaningNotesZh: '较随意。',
      },
    ])
    expect(entryVersions(corrected)).toEqual([])
  })

  it('displays a shared sentence once and keeps a question distinct from a statement option', () => {
    const html = renderToStaticMarkup(createElement(EntryVersions, { data: sentence() }))
    expect(html).toContain('Speaking &amp; writing')
    expect(html.match(/<p /g)).toHaveLength(1)
    expect(
      entryVersions(
        sentence({
          spokenVersion: "I'm ready?",
          writtenVersion: '',
          alternatives: [
            { en: "I'm ready.", medium: 'both', contextZh: '陈述', meaningNotesZh: '' },
          ],
        }),
      ),
    ).toEqual([{ text: "I'm ready?", medium: 'spoken' }])
  })

  it('shows the English sentence once with a Chinese heading, an English heading, or an alternatives table', () => {
    for (const fields of [
      {},
      { meaningZh: '' },
      {
        alternatives: [
          {
            en: 'Ready to begin.',
            medium: 'both' as const,
            contextZh: '可以口头或书面表达。',
            meaningNotesZh: '',
          },
        ],
      },
    ]) {
      const data = sentence({
        text: 'Ready to begin.',
        spokenVersion: 'Ready to begin.',
        writtenVersion: 'Ready to begin.',
        ...fields,
      })
      const html = renderToStaticMarkup(createElement(EntryCard, { entry: { data }, draft: true }))
      expect(html.split('Ready to begin.')).toHaveLength(2)
    }
  })

  it('repairs only live unconflicted sentences through new revisions, retaining history and review records', () => {
    const original = operation('sentence-root', sentence())
    const current = operation('sentence-edited', sentence({ notes: 'Latest note' }), [original.id])
    const word = operation('word-root', sentence({ kind: 'word', text: 'ready' }))
    const removed = operation('removed-root', sentence())
    const deletion = operation('removed-deleted', null, [removed.id])
    const conflict = operation('conflict-root', sentence())
    const conflictA = operation('conflict-a', sentence(), [conflict.id])
    const conflictB = operation('conflict-b', sentence({ notes: 'Other note' }), [conflict.id])
    const review: Operation = {
      schemaVersion: 1,
      type: 'review',
      id: 'review',
      entryId: original.entryId,
      deviceId: 'original',
      at: original.at,
      rating: 3,
    }
    const history: Operation[] = [
      original,
      current,
      word,
      removed,
      deletion,
      conflict,
      conflictA,
      conflictB,
      review,
    ]
    const repairs = planSentenceVersionRepairs(history, 'repair-device')
    expect(repairs).toHaveLength(1)
    expect(repairs[0]).toMatchObject({
      entryId: original.entryId,
      parents: [current.id],
      deviceId: 'repair-device',
      value: {
        notes: 'Latest note',
        practiceEnabled: true,
        sharedVersion: "I'm ready.",
        spokenVersion: '',
        writtenVersion: '',
      },
    })
    const restored = parseOperations(
      JSON.parse(JSON.stringify({ schemaVersion: 1, operations: [...history, ...repairs] })),
    )
    const library = deriveLibrary(restored)
    expect(library.entries).toHaveLength(2)
    expect(library.conflicts).toHaveLength(1)
    expect(library.reviews).toEqual([review])
    expect(planSentenceVersionRepairs(restored, 'another-device')).toEqual([])
    expect(searchEntries(library.entries, 'I’m ready.').exact.map((entry) => entry.id)).toContain(
      original.entryId,
    )
    expect(restored.find((op) => op.id === current.id)).toEqual(current)
  })
})
