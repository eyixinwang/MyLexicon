import type { EntryData, Operation } from './model'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const shortString = (value: unknown, limit = 20000): value is string =>
  typeof value === 'string' && value.length <= limit
const strArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 100 && value.every((part) => shortString(part, 300))

export function isEntryData(value: unknown): value is EntryData {
  if (!record(value)) return false
  return (
    typeof value.kind === 'string' &&
    ['word', 'phrase', 'sentence'].includes(value.kind) &&
    shortString(value.text, 5000) &&
    shortString(value.meaningZh) &&
    shortString(value.definitionEn) &&
    shortString(value.context) &&
    shortString(value.usage) &&
    shortString(value.register, 500) &&
    shortString(value.toneNotes) &&
    strArray(value.tags) &&
    shortString(value.notes) &&
    typeof value.practiceEnabled === 'boolean' &&
    (value.collection === undefined || ['library', 'revisit'].includes(value.collection as string)) &&
    (value.capture === undefined ||
      (record(value.capture) &&
        shortString(value.capture.text, 5000) && !!value.capture.text.trim() &&
        shortString(value.capture.context, 5000) &&
        shortString(value.capture.url, 2000) &&
        /^https?:\/\//i.test(value.capture.url) &&
        shortString(value.capture.title, 500) &&
        shortString(value.capture.capturedAt, 40) &&
        Number.isFinite(Date.parse(value.capture.capturedAt)))) &&
    ['partOfSpeech', 'pronunciation', 'pronunciationUk', 'pronunciationUs', 'domain'].every(
      (key) => value[key] === undefined || shortString(value[key], 500),
    ) &&
    ['spokenVersion', 'writtenVersion'].every(
      (key) => value[key] === undefined || shortString(value[key], 5000),
    ) &&
    (value.medium === undefined ||
      ['spoken', 'written', 'both'].includes(value.medium as string)) &&
    (value.examples === undefined ||
      (Array.isArray(value.examples) &&
        value.examples.length <= 10 &&
        value.examples.every(
          (example) =>
            record(example) && shortString(example.en, 5000) && shortString(example.zh, 5000),
        ))) &&
    (value.alternatives === undefined ||
      (Array.isArray(value.alternatives) &&
        value.alternatives.length <= 10 &&
        value.alternatives.every(
          (alternative) =>
            record(alternative) &&
            shortString(alternative.en, 5000) &&
            !!alternative.en.trim() &&
            shortString(alternative.contextZh, 1000) &&
            shortString(alternative.meaningNotesZh, 1000) &&
            ['spoken', 'written', 'both'].includes(alternative.medium as string),
        ))) &&
    (value.source === undefined ||
      (record(value.source) &&
        value.source.provider === 'gemini' &&
        shortString(value.source.model, 100) &&
        shortString(value.source.query, 5000) &&
        shortString(value.source.generatedAt, 40) &&
        Number.isFinite(Date.parse(value.source.generatedAt))))
  )
}

export function isOperation(value: unknown): value is Operation {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !shortString(value.id, 100) ||
    !value.id ||
    !shortString(value.entryId, 100) ||
    !value.entryId ||
    !shortString(value.deviceId, 100) ||
    !value.deviceId ||
    !shortString(value.at, 40) ||
    !Number.isFinite(Date.parse(value.at))
  )
    return false
  if (value.type === 'review')
    return typeof value.rating === 'number' && [1, 2, 3, 4].includes(value.rating)
  if (value.type === 'entry') {
    return (
      Array.isArray(value.parents) &&
      value.parents.length <= 100 &&
      value.parents.every((parent: unknown) => shortString(parent, 100) && !!parent) &&
      (value.value === null || isEntryData(value.value))
    )
  }
  return false
}

export function parseOperations(value: unknown): Operation[] {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.operations) ||
    value.operations.length > 100000 ||
    !value.operations.every(isOperation)
  ) {
    throw new Error('This file is not a valid MyLexicon data file.')
  }
  const ids = new Set<string>()
  for (const op of value.operations) {
    if (ids.has(op.id)) throw new Error('The data file contains duplicate operation IDs.')
    ids.add(op.id)
  }
  return value.operations
}
