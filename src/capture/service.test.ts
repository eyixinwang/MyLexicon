import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emptyEntry,
  deriveLibrary,
  newEntryOperation,
  isRevisitEntry,
  type EntryData,
  type EntryOperation,
} from '../domain/model'
import { isEntryData, parseOperations } from '../domain/validation'
import { createCaptureService } from './service'
import { parseCaptureRequest } from './protocol'

const input = {
  text: 'take issue with',
  context: 'I take issue with that claim.',
  url: 'https://example.com/article#paragraph',
  title: 'An article',
}
const answer: EntryData = {
  ...emptyEntry(),
  text: input.text,
  kind: 'phrase' as const,
  meaningZh: '对某事提出异议',
  usage: 'take issue with + 名词',
}
function fixture() {
  let locked = false
  const ops: EntryOperation[] = []
  const generate = vi.fn(async () => answer)
  const persist = vi.fn(async (op: EntryOperation) => {
    if (!ops.some((item) => item.id === op.id)) ops.push(op)
  })
  const changed = vi.fn(async () => {})
  const service = createCaptureService({
    state: () => ({ ready: true, locked, deviceId: 'test-device' }),
    operations: async () => [...ops],
    generate,
    persist,
    changed,
  })
  async function explain(requestId: string = crypto.randomUUID(), fields = {}) {
    return (await service.handle({
      action: 'explain',
      requestId,
      input: { ...input, ...fields },
    })) as { token: string; data: EntryData; saved?: unknown }
  }
  return {
    service,
    ops,
    generate,
    persist,
    changed,
    explain,
    lock: () => {
      locked = true
    },
  }
}
afterEach(() => vi.useRealTimers())

describe('browser capture lifecycle', () => {
  it('keeps explanations temporary, saves only by preview token, and preserves the actual selection and source', async () => {
    const f = fixture()
    const preview = await f.explain()
    expect(f.ops).toHaveLength(0)
    expect(f.generate).toHaveBeenCalledWith(
      expect.objectContaining({ context: input.context }),
      expect.any(AbortSignal),
    )
    expect(preview.data.capture?.url).toBe('https://example.com/article')
    expect(preview.data.text).toBe(input.text)
    expect(preview.data.context).toBe(input.context)
    await f.service.handle({ action: 'save', token: preview.token, data: { text: 'injected' } })
    expect(f.ops).toHaveLength(1)
    expect(f.ops[0].value).toMatchObject({
      text: input.text,
      collection: 'revisit',
      practiceEnabled: false,
    })
    expect(f.changed).toHaveBeenCalledOnce()
    const restored = parseOperations(
      JSON.parse(JSON.stringify({ schemaVersion: 1, operations: f.ops })),
    )
    expect(deriveLibrary(restored).entries[0].data.capture).toEqual(preview.data.capture)
  })
  it('deduplicates repeated saves, simultaneous identical previews, and a failed write retry', async () => {
    const f = fixture()
    const a = await f.explain()
    const b = await f.explain()
    f.persist.mockRejectedValueOnce(new Error('disk failure'))
    await expect(f.service.handle({ action: 'save', token: a.token })).rejects.toThrow(
      'disk failure',
    )
    await Promise.all(
      [a, a, b].map((preview) => f.service.handle({ action: 'save', token: preview.token })),
    )
    expect(f.ops).toHaveLength(1)
    expect(f.persist.mock.calls[0][0].id).toBe(f.persist.mock.calls[1][0].id)
  })
  it('reuses the same contextual entry offline, never demotes Library, and retains different senses', async () => {
    const f = fixture()
    f.ops.push(
      newEntryOperation('existing', [], { ...answer, context: input.context }, 'test-device'),
    )
    const existing = await f.explain()
    expect(existing.saved).toEqual({ entryId: 'existing', collection: 'library' })
    expect(f.generate).not.toHaveBeenCalled()
    await f.service.handle({ action: 'save', token: existing.token })
    expect(f.persist).not.toHaveBeenCalled()
    const different = await f.explain(crypto.randomUUID(), {
      context: 'They take issue with my interpretation.',
    })
    await f.service.handle({ action: 'save', token: different.token })
    expect(f.ops).toHaveLength(2)
    expect(f.ops[0].value?.collection).toBeUndefined()
  })
  it('discarded and expired previews cannot be saved', async () => {
    const f = fixture()
    const preview = await f.explain()
    await f.service.handle({ action: 'discard', token: preview.token })
    await expect(f.service.handle({ action: 'save', token: preview.token })).rejects.toThrow(
      'expired',
    )
    const later = await f.explain()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 31 * 60_000)
    await expect(f.service.handle({ action: 'save', token: later.token })).rejects.toThrow(
      'expired',
    )
    expect(f.ops).toHaveLength(0)
  })
  it('requires conflict resolution before using a saved contextual sense', async () => {
    const f = fixture()
    const first = newEntryOperation(
      'conflicted',
      [],
      { ...answer, context: input.context },
      'test-device',
    )
    const other = newEntryOperation(
      'conflicted',
      [],
      { ...answer, context: input.context, notes: 'Other version' },
      'other-device',
    )
    f.ops.push(first, other)
    await expect(f.explain()).rejects.toThrow('sync conflict')
    expect(f.generate).not.toHaveBeenCalled()
    expect(f.persist).not.toHaveBeenCalled()
  })
  it('blocks locked access and cancels an in-flight explanation without creating an entry', async () => {
    const f = fixture()
    let release!: (data: EntryData) => void
    f.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const pending = f.explain('pending')
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await f.service.handle({ action: 'cancel', requestId: 'pending' })
    release(answer)
    await expect(pending).rejects.toThrow('cancelled')
    expect(f.ops).toHaveLength(0)
    f.lock()
    await expect(f.explain()).rejects.toThrow('unlock')
  })
  it('rejects a late response after locking, invalid answers, and forged or unknown save tokens', async () => {
    const f = fixture()
    f.generate.mockImplementationOnce(async () => {
      f.lock()
      return answer
    })
    await expect(f.explain()).rejects.toThrow('unlock')
    const bad = fixture()
    bad.generate.mockResolvedValueOnce({ ...answer, meaningZh: 123 } as unknown as typeof answer)
    await expect(bad.explain()).rejects.toThrow('invalid')
    await expect(bad.service.handle({ action: 'save', token: 'unknown' })).rejects.toThrow(
      'expired',
    )
    expect(bad.ops).toHaveLength(0)
  })
  it('promotes a Revisit entry using the normal revision chain and preserves old backups', async () => {
    const f = fixture()
    const preview = await f.explain()
    await f.service.handle({ action: 'save', token: preview.token })
    const entry = deriveLibrary(f.ops).entries[0]
    expect(isRevisitEntry(entry.data)).toBe(true)
    const promoted = newEntryOperation(
      entry.id,
      [entry.revision],
      { ...entry.data, collection: 'library', practiceEnabled: true },
      'test-device',
    )
    const restored = parseOperations({ schemaVersion: 1, operations: [...f.ops, promoted] })
    expect(deriveLibrary(restored).entries).toHaveLength(1)
    expect(isRevisitEntry(deriveLibrary(restored).entries[0].data)).toBe(false)
    expect(deriveLibrary(restored).entries[0].data.practiceEnabled).toBe(true)
    expect(isEntryData(emptyEntry())).toBe(true)
    for (const url of ['javascript:alert(1)', 'https://', 'https://user:pass@example.com'])
      expect(isEntryData({ ...preview.data, capture: { ...preview.data.capture, url } })).toBe(
        false,
      )
    expect(isEntryData({ ...preview.data, collection: 'unknown' })).toBe(false)
  })
  it('validates every external boundary before contacting Gemini', () => {
    for (const fields of [
      { text: ' ' },
      { text: 'x'.repeat(5001) },
      { context: 'x'.repeat(5001) },
      { url: 'javascript:alert(1)' },
      { url: 'https://user:pass@example.com' },
      { title: 'x'.repeat(501) },
    ])
      expect(() =>
        parseCaptureRequest({
          action: 'explain',
          requestId: 'valid',
          input: { ...input, ...fields },
        }),
      ).toThrow()
    expect(() => parseCaptureRequest({ action: 'save', token: '<script>' })).toThrow()
  })
})
