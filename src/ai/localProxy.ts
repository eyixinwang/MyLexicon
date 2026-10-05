import type { Plugin } from 'vite'
import { generateGeminiEntry, validateQuery, type ReadingContext } from './gemini'
import { DEFAULT_GEMINI_MODEL, listGeminiModels, validateGeminiModel } from './models'

export function localGeminiProxy(key: string, base: string): Plugin {
  return {
    name: 'local-gemini-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        const isModelList = path === `${base}__mylexicon/gemini/models`
        if (!isModelList && path !== `${base}__mylexicon/gemini`) return next()
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
        if (request.method !== (isModelList ? 'GET' : 'POST'))
          return reply(405, {
            error: isModelList ? 'Use GET to list models.' : 'Use POST for a Gemini query.',
          })
        if (!isModelList && !request.headers['content-type']?.startsWith('application/json'))
          return reply(415, { error: 'A JSON query is required.' })
        let query = ''
        let model = DEFAULT_GEMINI_MODEL
        let reading: ReadingContext | undefined
        if (!isModelList)
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
            if ('model' in parsed) {
              if (typeof parsed.model !== 'string')
                return reply(400, { error: 'Choose a valid Gemini model.' })
              model = validateGeminiModel(parsed.model)
            }
            if ('reading' in parsed && parsed.reading !== undefined) {
              const value = parsed.reading
              if (
                typeof value !== 'object' ||
                value === null ||
                !('context' in value) ||
                typeof value.context !== 'string' ||
                value.context.length > 5000
              )
                return reply(400, { error: 'Reading context must be text within 5000 characters.' })
              reading = { context: value.context }
            }
          } catch {
            return reply(400, {
              error: 'Enter a text query of 1–5000 characters and choose a valid Gemini model.',
            })
          }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), isModelList ? 20000 : 60000)
        const cancel = () => {
          if (!response.writableEnded) controller.abort()
        }
        response.on('close', cancel)
        try {
          if (isModelList) reply(200, { models: await listGeminiModels(key, controller.signal) })
          else reply(200, await generateGeminiEntry(query, key, controller.signal, reading, model))
        } catch (reason) {
          reply(502, {
            error: controller.signal.aborted
              ? isModelList
                ? 'Loading models timed out. Please refresh them.'
                : 'Gemini timed out. Nothing was saved; please try again.'
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
