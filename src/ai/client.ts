import type { EntryData } from '../domain/model'
import { isEntryData } from '../domain/validation'
import { generateGeminiEntry, validateQuery, type ReadingContext } from './gemini'
import {
  DEFAULT_GEMINI_MODEL,
  listGeminiModels,
  parseGeminiModelPage,
  validateGeminiModel,
  type GeminiModel,
} from './models'

export const LOCAL_GEMINI_PROXY =
  import.meta.env.VITE_GEMINI_LOCAL_PROXY === true ||
  import.meta.env.VITE_GEMINI_LOCAL_PROXY === 'true'

export async function lookupGemini(
  query: string,
  key: string,
  signal: AbortSignal,
  reading?: ReadingContext,
  model = DEFAULT_GEMINI_MODEL,
): Promise<EntryData> {
  validateQuery(query)
  const selectedModel = validateGeminiModel(model)
  try {
    // A key saved in Settings takes precedence over the server's development key.
    if (key.trim() || !LOCAL_GEMINI_PROXY)
      return await generateGeminiEntry(query, key, signal, reading, selectedModel)
    const response = await fetch(`${import.meta.env.BASE_URL}__mylexicon/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, reading, model: selectedModel }),
      signal,
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : 'Gemini is temporarily unavailable. Please try again.'
      throw new Error(message)
    }
    if (!isEntryData(body)) throw new Error('Gemini returned an invalid entry. Nothing was saved.')
    return body
  } catch (reason) {
    if (signal.aborted) throw new Error('Query cancelled or timed out. Nothing was saved.')
    if (reason instanceof TypeError)
      throw new Error('Could not reach Gemini. Check your connection and try again.')
    throw reason
  }
}

export async function loadGeminiModels(key: string, signal: AbortSignal): Promise<GeminiModel[]> {
  try {
    if (key.trim() || !LOCAL_GEMINI_PROXY) return await listGeminiModels(key, signal)
    const response = await fetch(`${import.meta.env.BASE_URL}__mylexicon/gemini/models`, {
      signal,
      cache: 'no-store',
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof body.error === 'string'
          ? body.error
          : 'Could not load Gemini models. Please refresh them.'
      throw new Error(message)
    }
    return parseGeminiModelPage(body).models
  } catch (reason) {
    if (signal.aborted)
      throw new Error('Loading models was cancelled or timed out. Please refresh them.')
    if (reason instanceof TypeError)
      throw new Error('Could not reach Gemini. Check your connection, then refresh the models.')
    throw reason
  }
}
