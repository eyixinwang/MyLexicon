import { describe, expect, it } from 'vitest'
import { deriveLibrary, emptyEntry, type EntryOperation } from './model'

const operation = (id: string, parents: string[], text: string | null): EntryOperation => ({
  schemaVersion: 1,
  type: 'entry',
  id,
  entryId: 'e1',
  deviceId: 'test',
  at: '2026-09-28T00:00:00.000Z',
  parents,
  value: text === null ? null : { ...emptyEntry(), text },
})

describe('operation merge', () => {
  it('keeps simultaneous edits visible until resolved', () => {
    const root = operation('root', [], 'hello')
    const a = operation('a', ['root'], 'hello A')
    const b = operation('b', ['root'], 'hello B')
    const unresolved = deriveLibrary([b, root, a, a])
    expect(unresolved.entries).toHaveLength(0)
    expect(unresolved.conflicts[0].versions.map((v) => v.id)).toEqual(['a', 'b'])
    const resolved = deriveLibrary([a, b, root, operation('merge', ['a', 'b'], 'hello B')])
    expect(resolved.conflicts).toHaveLength(0)
    expect(resolved.entries[0].data.text).toBe('hello B')
  })

  it('retains edit-versus-delete as a conflict and prevents a resolved deletion from reappearing', () => {
    const root = operation('root', [], 'hello')
    const edit = operation('edit', ['root'], 'edited')
    const remove = operation('remove', ['root'], null)
    expect(deriveLibrary([root, edit, remove]).conflicts).toHaveLength(1)
    const resolution = operation('resolved', ['edit', 'remove'], null)
    const view = deriveLibrary([root, edit, remove, resolution])
    expect(view.conflicts).toHaveLength(0)
    expect(view.entries).toHaveLength(0)
  })
})
