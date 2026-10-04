import { describe, expect, it, vi } from 'vitest'
import { emptyEntry, entryCategory, type EntryData, type EntryOperation } from '../domain/model'
import { resolveQuery } from './lookup'

const operation = (data: Partial<EntryData> = {}): EntryOperation => ({
  schemaVersion: 1,
  type: 'entry',
  id: 'op',
  entryId: 'entry',
  deviceId: 'test',
  at: '2026-10-03T00:00:00Z',
  parents: [],
  value: {
    ...emptyEntry(),
    text: 'get around to',
    kind: 'phrase',
    meaningZh: '抽出时间做某事',
    ...data,
  },
})

describe('local-first query flow', () => {
  it('reuses exact saved text with normalized casing, spacing and punctuation without AI', async () => {
    const generate = vi.fn()
    const result = await resolveQuery('  GET   AROUND TO!  ', [operation()], generate)
    expect(result.source).toBe('saved')
    expect(generate).not.toHaveBeenCalled()
  })

  it('reuses original Chinese queries and both English alternatives without AI', async () => {
    const generate = vi.fn()
    const op = operation({
      kind: 'sentence',
      text: 'I need more time.',
      spokenVersion: 'Could I have a little more time?',
      writtenVersion: 'May I request an extension?',
      alternatives: [
        {
          en: 'Would it be possible to extend the deadline?',
          contextZh: '较正式，适合工作邮件。',
          medium: 'written',
          meaningNotesZh: '明确提出延长截止日期。',
        },
      ],
      source: {
        provider: 'gemini',
        model: 'models/gemini-3.8-flash',
        query: '我想礼貌地说我需要更多时间',
        generatedAt: '2026-10-03T00:00:00Z',
      },
    })
    for (const query of [
      '我想礼貌地说我需要更多时间',
      'Could I have a little more time?',
      'May I request an extension?',
      'Would it be possible to extend the deadline?',
      '抽出时间做某事',
    ]) {
      expect((await resolveQuery(query, [op], generate, true)).source).toBe('saved')
    }
    expect(generate).not.toHaveBeenCalled()
  })

  it('finds related saved options by their Chinese context and meaning differences before using AI', async () => {
    const generate = vi.fn()
    const op = operation({
      alternatives: [
        {
          en: 'I ran into another problem.',
          contextZh: '日常口语，适合与同事交流。',
          medium: 'spoken',
          meaningNotesZh: 'another 暗示又遇到一个问题。',
        },
      ],
    })
    for (const query of ['同事交流', '暗示又遇到']) {
      const result = await resolveQuery(query, [op], generate)
      expect(result).toMatchObject({ source: 'related', entries: [{ id: 'entry' }] })
    }
    expect(generate).not.toHaveBeenCalled()
  })

  it('shows related records before requesting AI, and only uses AI after opting in', async () => {
    const data = { ...emptyEntry(), text: 'around' }
    const generate = vi.fn().mockResolvedValue(data)
    expect((await resolveQuery('around', [operation()], generate)).source).toBe('related')
    expect(generate).not.toHaveBeenCalled()
    expect(await resolveQuery('around', [operation()], generate, true)).toEqual({
      source: 'gemini',
      data,
    })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('requests a new expression once and keeps errors from becoming entries', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('quota reached'))
    await expect(resolveQuery('unseen', [operation()], generate)).rejects.toThrow('quota reached')
    expect(generate).toHaveBeenCalledExactlyOnceWith('unseen')
  })

  it('requires conflict resolution before querying the same saved expression', async () => {
    const root = operation()
    const a = { ...root, id: 'a', parents: ['op'] }
    const b = {
      ...root,
      id: 'b',
      parents: ['op'],
      value: { ...root.value!, meaningZh: '另一个意思' },
    }
    const generate = vi.fn()
    await expect(resolveQuery('get around to', [root, a, b], generate)).rejects.toThrow('conflict')
    expect(generate).not.toHaveBeenCalled()
  })

  it('groups words and phrases together while keeping sentences separate', () => {
    expect(entryCategory('word')).toBe('expressions')
    expect(entryCategory('phrase')).toBe('expressions')
    expect(entryCategory('sentence')).toBe('sentences')
  })
})
