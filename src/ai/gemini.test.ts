import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyEntry } from '../domain/model'
import { parseOperations } from '../domain/validation'
import {
  GEMINI_ENDPOINT,
  GEMINI_MODEL,
  generateGeminiEntry,
  geminiRequest,
  parseGeminiEntry,
} from './gemini'

const answer = () => ({
  text: 'get around to',
  kind: 'phrase',
  meaningZh: '抽出时间做某事',
  definitionEn: 'Finally find time to do something.',
  partOfSpeech: 'phrasal verb',
  pronunciation: '',
  pronunciationUk: '',
  pronunciationUs: '',
  medium: 'both',
  domain: 'everyday conversation',
  register: 'neutral',
  toneNotes: 'Often suggests a delay.',
  usage: 'get around to + noun or -ing',
  context: '',
  examples: [{ en: 'I finally got around to replying.', zh: '我终于抽出时间回复了。' }],
  spokenVersion: '',
  writtenVersion: '',
  alternatives: [],
  tags: ['conversation'],
  notes: '',
})

afterEach(() => vi.unstubAllGlobals())

describe('Gemini integration', () => {
  it('uses the requested model, a header key, a JSON schema, and a separate user input', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer()) }] } },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', request)
    const data = await generateGeminiEntry('get around to', 'test-private-key')
    const [url, init] = request.mock.calls[0]
    expect(url).toBe(GEMINI_ENDPOINT)
    expect(url).not.toContain('test-private-key')
    expect(init.headers['x-goog-api-key']).toBe('test-private-key')
    const body = JSON.parse(init.body)
    expect(body.generationConfig.responseFormat.text.mimeType).toBe('APPLICATION_JSON')
    expect(body.generationConfig.responseFormat.text.schema.required).toContain('spokenVersion')
    expect(body.contents[0].parts[0].text).toBe('get around to')
    expect(data.source?.model).toBe(GEMINI_MODEL)
    expect(data.practiceEnabled).toBe(false)
  })

  it('rejects incomplete, malformed, and oversized answers before they can be saved', () => {
    const { examples: _examples, ...incomplete } = answer()
    expect(() => parseGeminiEntry(incomplete, 'query')).toThrow('incomplete')
    expect(() => parseGeminiEntry({ ...answer(), medium: 'sometimes' }, 'query')).toThrow('invalid')
    expect(() =>
      parseGeminiEntry({ ...answer(), examples: [{ en: 'Example', zh: 123 }] }, 'query'),
    ).toThrow('invalid')
    expect(() => parseGeminiEntry({ ...answer(), text: 'x'.repeat(5001) }, 'query')).toThrow(
      'invalid',
    )
    expect(() => parseGeminiEntry({ ...answer(), text: '只有中文' }, 'query')).toThrow('invalid')
  })

  it('preserves separate British and American IPA through generation and backup validation', () => {
    const value = parseGeminiEntry(
      {
        ...answer(),
        text: 'word',
        kind: 'word',
        partOfSpeech: 'noun',
        pronunciationUk: '/wɜːd/',
        pronunciationUs: '/wɝːd/',
      },
      'word',
    )
    const legacy = { ...emptyEntry(), text: 'legacy', pronunciation: '/existing IPA/' }
    delete legacy.pronunciationUk
    delete legacy.pronunciationUs
    const operations = [value, legacy].map((data, index) => ({
      schemaVersion: 1,
      type: 'entry',
      id: `ipa-op${index}`,
      entryId: `ipa-entry${index}`,
      deviceId: 'test',
      at: '2026-10-04T00:00:00Z',
      parents: [],
      value: data,
    }))
    const restored = parseOperations(JSON.parse(JSON.stringify({ schemaVersion: 1, operations })))
    expect(restored[0]).toMatchObject({
      value: {
        pronunciationUk: '/wɜːd/',
        pronunciationUs: '/wɝːd/',
      },
    })
    expect(restored[1]).toMatchObject({ value: { pronunciation: '/existing IPA/' } })
    expect('value' in restored[1] && restored[1].value?.pronunciationUk).toBeUndefined()
    expect('value' in restored[1] && restored[1].value?.pronunciationUs).toBeUndefined()
    const same = parseGeminiEntry(
      { ...answer(), pronunciationUk: '/same/', pronunciationUs: '/same/' },
      'query',
    )
    expect(same.pronunciationUk).toBe(same.pronunciationUs)
  })

  it('rejects incomplete or invalid dialect pronunciation fields without saving', () => {
    for (const key of ['pronunciationUk', 'pronunciationUs'] as const) {
      const incomplete = { ...answer() } as Record<string, unknown>
      delete incomplete[key]
      expect(() => parseGeminiEntry(incomplete, 'query')).toThrow('incomplete')
      expect(() => parseGeminiEntry({ ...answer(), [key]: 42 }, 'query')).toThrow('invalid')
      expect(() => parseGeminiEntry({ ...answer(), [key]: 'x'.repeat(501) }, 'query')).toThrow(
        'invalid',
      )
    }
  })

  it('rejects malformed contextual options and enforces the six-option response limit', () => {
    const alternative = {
      en: "I've encountered a new issue.",
      contextZh: '稍正式，适合工作或技术场合。',
      medium: 'both',
      meaningNotesZh: '',
    }
    for (const invalid of [
      { ...alternative, en: ' ' },
      { ...alternative, en: '只有中文' },
      { ...alternative, contextZh: '' },
      { ...alternative, contextZh: 'x'.repeat(1001) },
      { ...alternative, medium: 'formal' },
      { ...alternative, meaningNotesZh: 42 },
    ]) {
      expect(() => parseGeminiEntry({ ...answer(), alternatives: [invalid] }, 'query')).toThrow(
        'invalid',
      )
    }
    expect(() =>
      parseGeminiEntry({ ...answer(), alternatives: Array(7).fill(alternative) }, 'query'),
    ).toThrow('invalid')
    const { alternatives: _alternatives, ...incomplete } = answer()
    expect(() => parseGeminiEntry(incomplete, 'query')).toThrow('incomplete')
  })

  it('preserves translation alternatives and provenance through backup validation, and accepts old entries', () => {
    const value = parseGeminiEntry(
      {
        ...answer(),
        kind: 'sentence',
        text: 'Could I have a little more time?',
        spokenVersion: 'Could I have a little more time?',
        writtenVersion: 'Would it be possible to extend the deadline?',
        alternatives: [
          {
            en: 'Could I have a little more time?',
            contextZh: '礼貌、自然，适合当面请求。',
            medium: 'both',
            meaningNotesZh: '',
          },
          {
            en: 'Would it be possible to extend the deadline?',
            contextZh: '较正式，适合工作邮件。',
            medium: 'written',
            meaningNotesZh: '明确提出延长截止日期，原句只说需要更多时间。',
          },
        ],
      },
      '我想礼貌地说我需要更多时间',
    )
    const legacy = { ...emptyEntry(), text: 'legacy' }
    for (const key of [
      'partOfSpeech',
      'pronunciation',
      'pronunciationUk',
      'pronunciationUs',
      'medium',
      'domain',
      'examples',
      'spokenVersion',
      'writtenVersion',
      'alternatives',
    ] as const)
      delete legacy[key]
    const operations = [value, legacy].map((data, index) => ({
      schemaVersion: 1,
      type: 'entry',
      id: `op${index}`,
      entryId: `entry${index}`,
      deviceId: 'test',
      at: '2026-10-03T00:00:00Z',
      parents: [],
      value: data,
    }))
    const restored = parseOperations(JSON.parse(JSON.stringify({ schemaVersion: 1, operations })))
    expect(restored).toHaveLength(2)
    expect(restored[0]).toMatchObject({
      value: {
        spokenVersion: value.spokenVersion,
        writtenVersion: value.writtenVersion,
        alternatives: value.alternatives,
        source: { query: '我想礼貌地说我需要更多时间' },
      },
    })
    expect(restored[1]).toMatchObject({ value: { text: 'legacy' } })
    expect('value' in restored[1] && restored[1].value?.alternatives).toBeUndefined()
    expect(() =>
      parseOperations({
        schemaVersion: 1,
        operations: [
          {
            ...operations[0],
            value: { ...value, source: { ...value.source, generatedAt: 'bad date' } },
          },
        ],
      }),
    ).toThrow()
  })

  it.each([403, 404, 429, 503])(
    'reports HTTP %s without reflecting provider errors or credentials',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private-key-or-provider-details', { status })),
      )
      await expect(
        generateGeminiEntry('hello', 'private-key-or-provider-details'),
      ).rejects.not.toThrow('private-key-or-provider-details')
    },
  )

  it('rejects blocked and truncated responses, and ignores thinking parts', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    { thought: true, text: 'internal reasoning' },
                    { text: JSON.stringify(answer()) },
                  ],
                },
              },
            ],
          }),
        ),
      )
    vi.stubGlobal('fetch', request)
    await expect(generateGeminiEntry('hello', 'test-key')).rejects.toThrow('Nothing was saved')
    await expect(generateGeminiEntry('hello', 'test-key')).rejects.toThrow('Nothing was saved')
    await expect(generateGeminiEntry('hello', 'test-key')).resolves.toMatchObject({
      text: 'get around to',
    })
  })

  it('validates queries before making requests', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(generateGeminiEntry(' ', 'test-key')).rejects.toThrow('Enter')
    expect(() => geminiRequest('x'.repeat(5001))).toThrow('5000')
    expect(request).not.toHaveBeenCalled()
  })
})
