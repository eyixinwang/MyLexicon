import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyEntry } from '../domain/model'
import { localGeminiProxy } from './localProxy'

const nativeFetch = fetch
let server: Server | undefined
afterEach(async () => {
  vi.unstubAllGlobals()
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
  }
})

async function startProxy() {
  let handler!: (request: IncomingMessage, response: ServerResponse, next: () => void) => void
  const plugin = localGeminiProxy('server-only-test-key', '/lexicon/')
  if (typeof plugin.configureServer !== 'function') throw new Error('Missing proxy configuration')
  // This hook does not use a plugin context; mount its real middleware on a Node server.
  const configure = plugin.configureServer as (server: ViteDevServer) => unknown
  configure({
    middlewares: {
      use: (middleware: typeof handler) => {
        handler = middleware
      },
    },
  } as unknown as ViteDevServer)
  server = createServer((request, response) =>
    handler(request, response, () => {
      response.statusCode = 404
      response.end()
    }),
  )
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing address')
  return `http://127.0.0.1:${address.port}/lexicon/__mylexicon/gemini`
}

describe('private development Gemini proxy', () => {
  it('lists all model pages with the private server key and returns only model metadata', async () => {
    const endpoint = await startProxy()
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/first-model',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
            nextPageToken: 'next',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/embedding-model',
                supportedGenerationMethods: ['embedContent'],
              },
            ],
          }),
        ),
      )
    vi.stubGlobal('fetch', upstream)
    const response = await nativeFetch(`${endpoint}/models`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const text = await response.text()
    expect(JSON.parse(text).models).toHaveLength(2)
    expect(text).not.toContain('server-only-test-key')
    for (const [url, init] of upstream.mock.calls) {
      expect(url).not.toContain('server-only-test-key')
      expect(init.headers['x-goog-api-key']).toBe('server-only-test-key')
    }
  })

  it('uses the selected model, validates paths, and refuses other origins or methods', async () => {
    const endpoint = await startProxy()
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: JSON.stringify({ ...emptyEntry(), text: 'hello', meaningZh: '你好' }) },
                ],
              },
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', upstream)
    const headers = { 'Content-Type': 'application/json' }
    const selected = 'models/arbitrary-new-model'
    const response = await nativeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'hello', model: selected }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).source.model).toBe(selected)
    expect(upstream.mock.calls[0][0]).toContain(`${selected}:generateContent`)
    const invalid = await nativeFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: 'hello', model: 'models/../../other-host' }),
    })
    expect(invalid.status).toBe(400)
    const otherOrigin = await nativeFetch(`${endpoint}/models`, {
      headers: { Origin: 'https://other.test' },
    })
    expect(otherOrigin.status).toBe(403)
    const badMethod = await nativeFetch(`${endpoint}/models`, { method: 'POST' })
    expect(badMethod.status).toBe(405)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
})
