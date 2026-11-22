import { afterEach, expect, it, vi } from 'vitest'
import { lookupAI, loadModels } from './providerClient'
import { suggestProvider } from './providerConfig'
import { emptyEntry } from '../domain/model'
import { isEntryData } from '../domain/validation'
afterEach(() => vi.unstubAllGlobals())
it('suggests providers offline and leaves shared key prefixes ambiguous', () => {
  expect(suggestProvider('sk-or-v1-example')).toBe('openrouter')
  expect(suggestProvider(' sk-proj-example')).toBe('openai')
  expect(suggestProvider('AIzaexample')).toBe('gemini')
  expect(suggestProvider('sk-example')).toBeUndefined()
})
it.each(['openai', 'openrouter', 'deepseek'] as const)(
  'routes discovery and reading queries to %s with the selected credential',
  async (provider) => {
    const key = provider + '-test-key'
    const model = provider === 'openrouter' ? 'vendor/model:free' : 'example-model'
    const profile = { provider, key, model }
    const signal = new AbortController().signal
    const entry = {
      ...emptyEntry(),
      text: 'hello',
      meaningZh: '你好',
      source: { provider: 'gemini' },
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: model }] }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(entry) } }],
        }),
      )
    vi.stubGlobal('fetch', fetch)
    expect(await loadModels(profile, signal)).toMatchObject([{ name: model }])
    const saved = await lookupAI('hi', profile, signal, { context: 'hi there' })
    expect(saved).toMatchObject({
      text: 'hi',
      context: 'hi there',
      source: { provider, model, query: 'hi' },
    })
    expect(isEntryData(JSON.parse(JSON.stringify(saved)))).toBe(true)
    const base = {
      openai: 'https://api.openai.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      deepseek: 'https://api.deepseek.com',
    }[provider]
    const [[list, first], [chat, second]] = fetch.mock.calls
    expect(list).toBe(base + (provider === 'openrouter' ? '/models/user' : '/models'))
    expect(chat).toBe(base + '/chat/completions')
    for (const init of [first, second]) expect(init.headers.Authorization).toBe('Bearer ' + key)
    if (provider === 'deepseek') {
      expect(JSON.parse(second.body).messages[0].content).toContain('pronunciationUk')
      expect(JSON.parse(second.body).response_format).toEqual({ type: 'json_object' })
    }
    expect(JSON.parse(second.body)).toMatchObject({
      model,
      response_format: { type: provider === 'deepseek' ? 'json_object' : 'json_schema' },
    })
  },
)
it('rejects provider failures without retrying credentials elsewhere', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('secret echoed by vendor', { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  await expect(
    loadModels({ provider: 'openrouter', key: 'test', model: '' }, new AbortController().signal),
  ).rejects.toThrow('OpenRouter request failed (401)')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('distinguishes an empty DeepSeek catalog, a rejected key, and an unreadable response', async () => {
  const profile = { provider: 'deepseek' as const, key: 'test', model: '' }
  const signal = new AbortController().signal
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('fetch failed')),
  )
  await expect(loadModels(profile, signal)).resolves.toEqual([])
  await expect(loadModels(profile, signal)).rejects.toThrow('DeepSeek request failed (401)')
  await expect(loadModels(profile, signal)).rejects.toThrow(
    'No readable response from api.deepseek.com',
  )
})
