import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyEntry } from '../domain/model'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function proxyClient() {
  vi.resetModules()
  vi.stubEnv('VITE_GEMINI_LOCAL_PROXY', 'true')
  vi.stubEnv('BASE_URL', '/lexicon/')
  return import('./client')
}

describe('Gemini connection and model routing', () => {
  it('loads server-key models through the local proxy with no key in the browser request', async () => {
    const { loadGeminiModels } = await proxyClient()
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/future-model',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    const models = await loadGeminiModels('', controller.signal)
    expect(models[0].name).toBe('models/future-model')
    expect(request.mock.calls[0][0]).toBe('/lexicon/__mylexicon/gemini/models')
    expect(request.mock.calls[0][1].headers).toBeUndefined()
    expect(request.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('a saved key overrides the development key for discovery and generation', async () => {
    const { loadGeminiModels, lookupGemini } = await proxyClient()
    const generated = { ...emptyEntry(), text: 'hello', meaningZh: '你好' }
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/my-new-model',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: JSON.stringify(generated) }] },
              },
            ],
          }),
        ),
      )
    vi.stubGlobal('fetch', request)
    const signal = new AbortController().signal
    await loadGeminiModels('saved-key', signal)
    const data = await lookupGemini('hello', 'saved-key', signal, undefined, 'models/my-new-model')
    expect(request.mock.calls[0][0]).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models?',
    )
    expect(request.mock.calls[1][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/my-new-model:generateContent',
    )
    for (const [, init] of request.mock.calls)
      expect(init.headers['x-goog-api-key']).toBe('saved-key')
    expect(data.source?.model).toBe('models/my-new-model')
  })

  it('sends the selected model and reading context through the private proxy', async () => {
    const { lookupGemini } = await proxyClient()
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ...emptyEntry(), text: 'hello' })))
    vi.stubGlobal('fetch', request)
    await lookupGemini(
      'hello',
      '',
      new AbortController().signal,
      { context: 'hello there' },
      'models/chosen-model',
    )
    expect(request.mock.calls[0][0]).toBe('/lexicon/__mylexicon/gemini')
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      query: 'hello',
      reading: { context: 'hello there' },
      model: 'models/chosen-model',
    })
  })

  it('reports listing failures without mistaking them for an empty successful catalog', async () => {
    const { loadGeminiModels } = await proxyClient()
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Key cannot list models.' }), { status: 502 }),
      )
      .mockRejectedValueOnce(new TypeError('connection failed'))
    vi.stubGlobal('fetch', request)
    const signal = new AbortController().signal
    await expect(loadGeminiModels('', signal)).rejects.toThrow('Key cannot list models')
    await expect(loadGeminiModels('', signal)).rejects.toThrow('Check your connection')
  })
})
