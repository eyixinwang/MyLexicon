import { describe, expect, it } from 'vitest'
import { emptyEntry, entryCategory, type EntryData, type EntryView } from './model'
import { filterLibraryEntries } from './search'

const entry = (id: string, data: Partial<EntryData>): EntryView => ({
  id,
  revision: `revision-${id}`,
  updatedAt: '2026-10-04T00:00:00Z',
  data: { ...emptyEntry(), text: id, ...data },
})
const entries = [
  entry('spoken-word', { text: 'gonna', medium: 'spoken' }),
  entry('written-word', { text: 'herein', medium: 'written' }),
  entry('both-word', { text: 'problem', medium: 'both' }),
  entry('legacy-word', { medium: undefined }),
  entry('spoken-phrase', { text: 'give me a hand', kind: 'phrase', medium: 'spoken' }),
  entry('written-sentence', {
    text: 'Please find the report attached.',
    kind: 'sentence',
    medium: 'written',
  }),
  entry('written-with-spoken-option', {
    text: 'The issue remains unresolved.',
    kind: 'sentence',
    medium: 'written',
    alternatives: [
      {
        en: "We still haven't sorted it out.",
        contextZh: '日常口语',
        medium: 'spoken',
        meaningNotesZh: '',
      },
    ],
  }),
]
const ids = (values: EntryView[]) => values.map((value) => value.id)

describe('library usage filters', () => {
  it('includes shared usage in speaking and writing, and leaves unclassified records visible under all', () => {
    expect(ids(filterLibraryEntries(entries, '', 'all'))).toEqual(ids(entries))
    expect(ids(filterLibraryEntries(entries, '', 'spoken'))).toEqual([
      'spoken-word',
      'both-word',
      'spoken-phrase',
    ])
    expect(ids(filterLibraryEntries(entries, '', 'written'))).toEqual([
      'written-word',
      'both-word',
      'written-sentence',
      'written-with-spoken-option',
    ])
    expect(ids(filterLibraryEntries(entries, '', 'both'))).toEqual(['both-word'])
    expect(ids(filterLibraryEntries(entries, '', 'unclassified'))).toEqual(['legacy-word'])
  })

  it('combines usage with normalized search and word/phrase or sentence categories', () => {
    const expressions = filterLibraryEntries(entries, '', 'spoken').filter(
      (value) => entryCategory(value.data.kind) === 'expressions',
    )
    expect(ids(expressions)).toEqual(['spoken-word', 'both-word', 'spoken-phrase'])
    expect(ids(filterLibraryEntries(entries, '  PROBLEM! ', 'written'))).toEqual(['both-word'])
    expect(filterLibraryEntries(entries, '  PROBLEM! ', 'unclassified')).toEqual([])
    expect(
      ids(
        filterLibraryEntries(entries, 'report', 'written').filter(
          (value) => entryCategory(value.data.kind) === 'sentences',
        ),
      ),
    ).toEqual(['written-sentence'])
    expect(filterLibraryEntries(entries, 'report', 'spoken')).toEqual([])
  })

  it('uses the main expression classification even when search matches an alternative with different usage', () => {
    expect(
      ids(filterLibraryEntries(entries, "We still haven't sorted it out.", 'written')),
    ).toEqual(['written-with-spoken-option'])
    expect(filterLibraryEntries(entries, "We still haven't sorted it out.", 'spoken')).toEqual([])
  })
})
