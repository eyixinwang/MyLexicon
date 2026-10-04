import type { EntryData, EntryView, UsageMedium } from './model'

export type UsageFilter = UsageMedium | 'all' | 'unclassified'

export function filterLibraryEntries(
  entries: EntryView[],
  query: string,
  medium: UsageFilter,
): EntryView[] {
  const matches = query.trim() ? searchEntries(entries, query) : undefined
  const searched = matches ? [...matches.exact, ...matches.related] : entries
  return searched.filter(({ data }) => {
    if (medium === 'all') return true
    if (medium === 'unclassified') return data.medium === undefined
    if (medium === 'both') return data.medium === 'both'
    return data.medium === medium || data.medium === 'both'
  })
}

export function normalizeQuery(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。！？]+$/u, '')
    .trim()
}

const exactFields = (data: EntryData) => [
  data.text,
  data.meaningZh,
  data.spokenVersion ?? '',
  data.writtenVersion ?? '',
  data.sharedVersion ?? '',
  data.source?.query ?? '',
  ...(data.alternatives ?? []).map((alternative) => alternative.en),
]

export function searchEntries(entries: EntryView[], query: string) {
  const term = normalizeQuery(query)
  if (!term) return { exact: [] as EntryView[], related: [] as EntryView[] }
  const exact = entries.filter((entry) =>
    exactFields(entry.data).some((part) => normalizeQuery(part) === term),
  )
  const ids = new Set(exact.map((entry) => entry.id))
  const related = entries.filter(
    (entry) =>
      !ids.has(entry.id) &&
      [
        ...exactFields(entry.data),
        entry.data.definitionEn,
        entry.data.context,
        entry.data.usage,
        entry.data.register,
        entry.data.toneNotes,
        entry.data.notes,
        entry.data.partOfSpeech ?? '',
        entry.data.domain ?? '',
        ...entry.data.tags,
        ...(entry.data.examples ?? []).flatMap((example) => [example.en, example.zh]),
        ...(entry.data.alternatives ?? []).flatMap((alternative) => [
          alternative.contextZh,
          alternative.meaningNotesZh,
        ]),
      ].some((part) => normalizeQuery(part).includes(term)),
  )
  return { exact, related }
}
