import {
  deriveLibrary,
  newEntryOperation,
  type EntryData,
  type Operation,
  type UsageMedium,
} from './model'

// Ignore formatting only. Case and punctuation may change meaning (US/us, ./?).
export const versionTextKey = (text: string) =>
  text.normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/gu, ' ').trim()

export function normalizeSentenceVersions(data: EntryData): EntryData {
  if (data.kind !== 'sentence') return data
  const spoken = data.spokenVersion?.trim()
  const written = data.writtenVersion?.trim()
  if (!spoken || !written || versionTextKey(spoken) !== versionTextKey(written)) return data
  // Do not overwrite a separate shared expression supplied by the user.
  if (data.sharedVersion?.trim() && versionTextKey(data.sharedVersion) !== versionTextKey(spoken))
    return data
  const sharedVersion = data.sharedVersion?.trim() || spoken
  return {
    ...data,
    sharedVersion,
    spokenVersion: '',
    writtenVersion: '',
    ...(versionTextKey(data.text) === versionTextKey(sharedVersion) && { medium: 'both' as const }),
    ...(data.alternatives && {
      alternatives: data.alternatives.map((alternative) =>
        versionTextKey(alternative.en) === versionTextKey(sharedVersion)
          ? { ...alternative, medium: 'both' as const }
          : alternative,
      ),
    }),
  }
}

export function planSentenceVersionRepairs(operations: Operation[], deviceId: string) {
  return deriveLibrary(operations).entries.flatMap((entry) => {
    const value = normalizeSentenceVersions(entry.data)
    return value === entry.data
      ? []
      : [newEntryOperation(entry.id, [entry.revision], value, deviceId)]
  })
}

export function entryVersions(data: EntryData) {
  const normalized = normalizeSentenceVersions(data)
  const alternatives = new Set(
    (normalized.alternatives ?? []).map((option) => versionTextKey(option.en)),
  )
  const versions = new Map<string, { text: string; medium: UsageMedium }>()
  const fields = [
    [normalized.sharedVersion, 'both'],
    [normalized.spokenVersion, 'spoken'],
    [normalized.writtenVersion, 'written'],
  ] as const
  for (const [text, medium] of fields) {
    if (!text?.trim()) continue
    const key = versionTextKey(text)
    if (alternatives.has(key)) continue
    const existing = versions.get(key)
    versions.set(key, {
      text: existing?.text ?? text.trim(),
      medium: existing && existing.medium !== medium ? 'both' : medium,
    })
  }
  return [...versions.values()]
}
