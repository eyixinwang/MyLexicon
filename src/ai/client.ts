import type { EntryData } from '../domain/model'
import { isEntryData } from '../domain/validation'
import { generateGeminiEntry, validateQuery, type ReadingContext } from './gemini'

export const LOCAL_GEMINI_PROXY = import.meta.env.VITE_GEMINI_LOCAL_PROXY === true

export async function lookupGemini(
  query: string,
  key: string,
  signal: AbortSignal,
  reading?: ReadingContext,
): Promise<EntryData> {
  validateQuery(query)
  try {
    if (!LOCAL_GEMINI_PROXY) return await generateGeminiEntry(query, key, signal, reading)
    const response = await fetch(`${import.meta.env.BASE_URL}__mylexicon/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, reading }),
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
