import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { generateGeminiEntry, validateQuery, type ReadingContext } from './src/ai/gemini'

function localGeminiProxy(key: string, base: string): Plugin {
  return {
    name: 'local-gemini-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== `${base}__mylexicon/gemini`) return next()
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        const reply = (status: number, body: unknown) => {
          response.statusCode = status
          response.end(JSON.stringify(body))
        }
        const remote = request.socket.remoteAddress ?? ''
        if (
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ||
          (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)
        )
          return reply(403, {
            error: 'The private Gemini connection is only available on this computer.',
          })
        if (request.method !== 'POST') return reply(405, { error: 'Use POST for a Gemini query.' })
        if (!request.headers['content-type']?.startsWith('application/json'))
          return reply(415, { error: 'A JSON query is required.' })
        let query: string
        let reading: ReadingContext | undefined
        try {
          let body = ''
          request.setEncoding('utf8')
          for await (const chunk of request) {
            body += chunk
            if (body.length > 30000) return reply(413, { error: 'This query is too large.' })
          }
          const parsed: unknown = JSON.parse(body)
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('query' in parsed) ||
            typeof parsed.query !== 'string'
          )
            return reply(400, { error: 'Enter a text query.' })
          query = validateQuery(parsed.query)
          if ('reading' in parsed && parsed.reading !== undefined) {
            const value = parsed.reading
            if (typeof value !== 'object' || value === null || !('context' in value) ||
                typeof value.context !== 'string' || value.context.length > 5000)
              return reply(400, { error: 'Reading context must be text within 5000 characters.' })
            reading = { context: value.context }
          }
        } catch {
          return reply(400, { error: 'Enter a text query of 1–5000 characters.' })
        }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60000)
        const cancel = () => {
          if (!response.writableEnded) controller.abort()
        }
        response.on('close', cancel)
        try {
          const entry = await generateGeminiEntry(query, key, controller.signal, reading)
          reply(200, entry)
        } catch (reason) {
          reply(502, {
            error: controller.signal.aborted
              ? 'Gemini timed out. Nothing was saved; please try again.'
              : reason instanceof Error && reason.name === 'Error'
                ? reason.message
                : 'Could not reach Gemini. Please check your connection and try again.',
          })
        } finally {
          clearTimeout(timeout)
          response.off('close', cancel)
        }
      })
    },
  }
}

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/'
  const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || ''
  const localProxy = command === 'serve' && !isPreview && !!key && mode !== 'test'
  return {
    plugins: [react(), ...(localProxy ? [localGeminiProxy(key, base)] : [])],
    define: { 'import.meta.env.VITE_GEMINI_LOCAL_PROXY': JSON.stringify(localProxy) },
    base,
    test: { environment: 'node' },
  }
})
