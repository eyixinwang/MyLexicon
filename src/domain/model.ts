export type EntryKind = 'word' | 'phrase' | 'sentence'
export type RatingValue = 1 | 2 | 3 | 4

export interface EntryData {
  text: string
  kind: EntryKind
  meaningZh: string
  definitionEn: string
  context: string
  usage: string
  register: string
  toneNotes: string
  tags: string[]
  notes: string
  practiceEnabled: boolean
}

export interface EntryOperation {
  schemaVersion: 1
  type: 'entry'
  id: string
  entryId: string
  deviceId: string
  at: string
  parents: string[]
  value: EntryData | null
}

export interface ReviewOperation {
  schemaVersion: 1
  type: 'review'
  id: string
  entryId: string
  deviceId: string
  at: string
  rating: RatingValue
}

export type Operation = EntryOperation | ReviewOperation

export interface EntryView {
  id: string
  revision: string
  updatedAt: string
  data: EntryData
}

export interface EntryConflict {
  entryId: string
  versions: EntryOperation[]
}

export interface LibraryView {
  entries: EntryView[]
  conflicts: EntryConflict[]
  reviews: ReviewOperation[]
}

export const emptyEntry = (): EntryData => ({
  text: '',
  kind: 'word',
  meaningZh: '',
  definitionEn: '',
  context: '',
  usage: '',
  register: '',
  toneNotes: '',
  tags: [],
  notes: '',
  practiceEnabled: false,
})

export const newEntryOperation = (
  entryId: string,
  parents: string[],
  value: EntryData | null,
  deviceId: string,
): EntryOperation => ({
  schemaVersion: 1,
  type: 'entry',
  id: crypto.randomUUID(),
  entryId,
  deviceId,
  at: new Date().toISOString(),
  parents,
  value,
})

export const newReviewOperation = (
  entryId: string,
  rating: RatingValue,
  deviceId: string,
): ReviewOperation => ({
  schemaVersion: 1,
  type: 'review',
  id: crypto.randomUUID(),
  entryId,
  deviceId,
  at: new Date().toISOString(),
  rating,
})

export function deriveLibrary(operations: Operation[]): LibraryView {
  const byEntry = new Map<string, EntryOperation[]>()
  const reviews: ReviewOperation[] = []
  const unique = new Map<string, Operation>()
  for (const op of operations) unique.set(op.id, op)
  for (const op of unique.values()) {
    if (op.type === 'review') {
      reviews.push(op)
    } else {
      const list = byEntry.get(op.entryId) ?? []
      list.push(op)
      byEntry.set(op.entryId, list)
    }
  }
  const entries: EntryView[] = []
  const conflicts: EntryConflict[] = []
  for (const [entryId, list] of byEntry) {
    const parentIds = new Set(list.flatMap((op) => op.parents))
    const leaves = list
      .filter((op) => !parentIds.has(op.id))
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    if (leaves.length > 1) {
      conflicts.push({ entryId, versions: leaves })
    } else if (leaves.length === 1 && leaves[0].value) {
      entries.push({
        id: entryId,
        revision: leaves[0].id,
        updatedAt: leaves[0].at,
        data: leaves[0].value,
      })
    }
  }
  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  reviews.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  return { entries, conflicts, reviews }
}
