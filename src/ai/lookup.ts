import { deriveLibrary, type EntryData, type EntryView, type Operation } from '../domain/model'
import { searchEntries } from '../domain/search'
import { validateQuery } from './gemini'

type LookupResult =
  { source: 'saved' | 'related'; entries: EntryView[] } | { source: 'gemini'; data: EntryData }

export async function resolveQuery(
  query: string,
  operations: Operation[],
  generate: (query: string) => Promise<EntryData>,
  useAI = false,
): Promise<LookupResult> {
  const text = validateQuery(query)
  const library = deriveLibrary(operations)
  const matches = searchEntries(library.entries, text)
  if (matches.exact.length) return { source: 'saved', entries: matches.exact }
  const conflictMatches = library.conflicts.some((conflict) =>
    conflict.versions.some(
      (version) =>
        version.value &&
        searchEntries(
          [
            {
              id: version.entryId,
              revision: version.id,
              updatedAt: version.at,
              data: version.value,
            },
          ],
          text,
        ).exact.length > 0,
    ),
  )
  if (conflictMatches)
    throw new Error(
      'Saved versions of this expression have a conflict. Resolve it in Settings first.',
    )
  if (matches.related.length && !useAI) return { source: 'related', entries: matches.related }
  return { source: 'gemini', data: await generate(text) }
}
