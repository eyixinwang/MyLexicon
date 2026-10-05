import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listGeminiModels,
  parseGeminiModelPage,
  supportsContentGeneration,
  validateGeminiModel,
} from './models'

const model = (name: string, methods = ['generateContent']) => ({
  name: `models/${name}`,
  displayName: name,
  description: 'A model returned by this key.',
  supportedGenerationMethods: methods,
})
const page = (body: unknown) => new Response(JSON.stringify(body))
afterEach(() => vi.unstubAllGlobals())

describe('key-specific Gemini model discovery', () => {
  it('loads all pages, keeps arbitrary models and capabilities, and deduplicates names', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        page({
          models: [model('future-text-model'), model('embedding', ['embedContent'])],
          nextPageToken: 'next page',
        }),
      )
      .mockResolvedValueOnce(
        page({ models: [model('other-provider-text'), model('future-text-model')] }),
      )
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    const models = await listGeminiModels(' private-key ', controller.signal)
    expect(models.map((item) => item.name)).toEqual([
      'models/embedding',
      'models/future-text-model',
      'models/other-provider-text',
    ])
    expect(models.filter(supportsContentGeneration)).toHaveLength(2)
    expect(request).toHaveBeenCalledTimes(2)
    for (const [url, init] of request.mock.calls) {
      expect(url).toMatch(/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\?/)
      expect(url).not.toContain('private-key')
      expect(init.headers['x-goog-api-key']).toBe('private-key')
      expect(init.signal).toBe(controller.signal)
      expect(init.cache).toBe('no-store')
      expect(new URL(url).searchParams.get('pageSize')).toBe('1000')
    }
    expect(new URL(request.mock.calls[1][0]).searchParams.get('pageToken')).toBe('next page')
    expect(request.mock.calls[0][1].method).toBeUndefined()
  })

  it('does not infer billing or generation capability from a model name', () => {
    const result = parseGeminiModelPage({
      models: [
        { name: 'models/gemini-free-flash', price: 'free' },
        { ...model('new-name'), price: 'paid' },
      ],
    }).models
    expect(supportsContentGeneration(result[0])).toBe(false)
    expect(supportsContentGeneration(result[1])).toBe(true)
    expect(result.every((item) => !('price' in item))).toBe(true)
    expect(parseGeminiModelPage({}).models).toEqual([])
  })

  it('rejects invalid pages and external/path-manipulating model names', () => {
    for (const name of [
      'https://other.test/models/x',
      'models/../../x',
      'models/x?key=y',
      'models/x:generateContent',
      'models/',
      'models/a/b',
    ])
      expect(() => validateGeminiModel(name)).toThrow('valid Gemini model')
    expect(validateGeminiModel(' models/gemma-new.1-it ')).toBe('models/gemma-new.1-it')
    for (const invalid of [
      null,
      [],
      { models: {} },
      { nextPageToken: 1 },
      { models: [model('ok'), { name: 'https://other.test' }] },
      { models: [{ name: 'models/x', supportedGenerationMethods: [42] }] },
      { models: [{ name: 'models/x', displayName: 42 }] },
    ])
      expect(() => parseGeminiModelPage(invalid)).toThrow('invalid model list')
  })

  it.each([400, 401, 403, 429, 503])(
    'reports HTTP %s without exposing provider content',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('secret-provider-message', { status })),
      )
      await expect(listGeminiModels('secret-provider-message')).rejects.not.toThrow(
        'secret-provider-message',
      )
    },
  )

  it('rejects missing credentials and cancellation before sending requests', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(listGeminiModels(' ')).rejects.toThrow('API key')
    const controller = new AbortController()
    controller.abort()
    await expect(listGeminiModels('key', controller.signal)).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it('fails a repeated page token rather than showing a partial catalog', async () => {
    const request = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(page({ models: [model('x')], nextPageToken: 'loop' })),
      )
    vi.stubGlobal('fetch', request)
    await expect(listGeminiModels('key')).rejects.toThrow('incomplete model list')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
