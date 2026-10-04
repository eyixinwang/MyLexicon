import {
  newEntryOperation,
  deriveLibrary,
  type EntryData,
  type EntryOperation,
  type Operation,
} from '../domain/model'
import { isEntryData } from '../domain/validation'
import { normalizeQuery } from '../domain/search'
import { parseCaptureRequest, type CaptureInput } from './protocol'

interface Dependencies {
  state: () => { ready: boolean; locked: boolean; deviceId: string }
  operations: () => Promise<Operation[]>
  generate: (input: CaptureInput, signal: AbortSignal) => Promise<EntryData>
  persist: (op: EntryOperation) => Promise<void>
  changed: () => Promise<void>
}
interface Preview {
  data: EntryData
  expiresAt: number
  operation?: EntryOperation
  saving?: Promise<unknown>
  saved?: { entryId: string; collection: string }
}

export function createCaptureService(deps: Dependencies) {
  const previews = new Map<string, Preview>()
  const requests = new Map<string, AbortController>()
  let disposed = false
  let saveQueue: Promise<unknown> = Promise.resolve()
  function available() {
    const state = deps.state()
    if (disposed || !state.ready || !state.deviceId)
      throw new Error('MyLexicon is still opening. Try again shortly.')
    if (state.locked) throw new Error('Open MyLexicon and unlock the local library first.')
    return state
  }
  function findExisting(ops: Operation[], data: Pick<EntryData, 'text' | 'context'>) {
    const library = deriveLibrary(ops)
    const matches = (value: EntryData) =>
      normalizeQuery(value.text) === normalizeQuery(data.text) &&
      normalizeQuery(value.context) === normalizeQuery(data.context)
    if (
      library.conflicts.some((conflict) =>
        conflict.versions.some((version) => version.value && matches(version.value)),
      )
    )
      throw new Error(
        'This expression has a sync conflict. Resolve it in MyLexicon Settings first.',
      )
    return library.entries.find((entry) => matches(entry.data))
  }
  async function handle(raw: unknown): Promise<unknown> {
    const request = parseCaptureRequest(raw)
    if (request.action === 'ping') return { ...deps.state(), version: 1 }
    if (request.action === 'cancel') {
      requests.get(request.requestId)?.abort()
      return { cancelled: true }
    }
    if (request.action === 'discard') {
      const preview = previews.get(request.token)
      if (!preview?.saving) previews.delete(request.token)
      return { discarded: true }
    }
    available()
    for (const [token, preview] of previews)
      if (preview.expiresAt < Date.now() && !preview.saving) previews.delete(token)
    if (request.action === 'explain') {
      if (requests.size >= 3 || requests.has(request.requestId))
        throw new Error('Another explanation is running. Wait or close it first.')
      const controller = new AbortController()
      requests.set(request.requestId, controller)
      const timeout = setTimeout(() => controller.abort(), 65000)
      try {
        const ops = await deps.operations()
        const existing = findExisting(ops, {
          text: request.input.text,
          context: request.input.context,
        })
        const reused = !!existing?.data.meaningZh.trim()
        const generated = reused
          ? existing!.data
          : await deps.generate(request.input, controller.signal)
        if (controller.signal.aborted)
          throw new Error('Explanation cancelled or timed out. Nothing was saved.')
        available() // Locking or disconnecting during an AI request revokes access.
        if (!isEntryData(generated) || !generated.meaningZh.trim())
          throw new Error('The explanation is invalid. Nothing was saved.')
        if (previews.size >= 30)
          throw new Error('Close some previews before looking up more expressions.')
        const data: EntryData = {
          ...generated,
          text: request.input.text,
          context: request.input.context,
          collection: 'revisit',
          practiceEnabled: false,
          capture: { ...request.input, capturedAt: new Date().toISOString() },
        }
        const token = crypto.randomUUID()
        const saved = existing
          ? { entryId: existing.id, collection: existing.data.collection ?? 'library' }
          : undefined
        previews.set(token, { data, expiresAt: Date.now() + 30 * 60_000, saved })
        return { token, data, saved, reused }
      } finally {
        clearTimeout(timeout)
        requests.delete(request.requestId)
      }
    }
    const preview = previews.get(request.token)
    if (!preview)
      throw new Error('This preview expired. Look up the selection again before saving.')
    if (preview.saved) return preview.saved
    if (preview.saving) return preview.saving
    preview.saving = saveQueue
      .catch(() => undefined)
      .then(async () => {
        available()
        const existing = findExisting(await deps.operations(), preview.data)
        if (existing) {
          preview.saved = {
            entryId: existing.id,
            collection: existing.data.collection ?? 'library',
          }
        } else {
          const { deviceId } = available()
          // Keep this operation across retries, including a lost save response.
          preview.operation ??= newEntryOperation(crypto.randomUUID(), [], preview.data, deviceId)
          await deps.persist(preview.operation)
          preview.saved = { entryId: preview.operation.entryId, collection: 'revisit' }
        }
        // The write is already committed. A refresh failure must not report it as unsaved.
        await deps.changed().catch(() => undefined)
        return preview.saved
      })
      .finally(() => {
        preview.saving = undefined
      })
    saveQueue = preview.saving
    return preview.saving
  }
  return {
    handle,
    dispose() {
      disposed = true
      for (const controller of requests.values()) controller.abort()
      previews.clear()
    },
  }
}
