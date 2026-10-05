export const DEFAULT_GEMINI_MODEL = 'models/gemini-3.8-flash'
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface GeminiModel {
  name: string
  displayName: string
  description: string
  supportedGenerationMethods: string[]
}

export function validateGeminiModel(name: string): string {
  const model = name.trim()
  if (!/^models\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,92}$/.test(model))
    throw new Error('Choose a valid Gemini model in Settings.')
  return model
}

export const supportsContentGeneration = (model: GeminiModel) =>
  model.supportedGenerationMethods.includes('generateContent')

// models.list contains capabilities, not prices or a project's billing tier.
export function parseGeminiModelPage(value: unknown): {
  models: GeminiModel[]
  nextPageToken?: string
} {
  const invalid = () => new Error('Gemini returned an invalid model list. Please refresh it.')
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid()
  const page = value as Record<string, unknown>
  // Google may omit models when no models are available.
  if (page.models !== undefined && !Array.isArray(page.models)) throw invalid()
  if (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string') throw invalid()
  const models = ((page.models ?? []) as unknown[]).map((item): GeminiModel => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw invalid()
    const raw = item as Record<string, unknown>
    if (
      typeof raw.name !== 'string' ||
      (raw.displayName !== undefined && typeof raw.displayName !== 'string') ||
      (raw.description !== undefined && typeof raw.description !== 'string') ||
      (raw.supportedGenerationMethods !== undefined &&
        (!Array.isArray(raw.supportedGenerationMethods) ||
          raw.supportedGenerationMethods.some((method) => typeof method !== 'string')))
    )
      throw invalid()
    let name: string
    try {
      name = validateGeminiModel(raw.name)
    } catch {
      throw invalid()
    }
    return {
      name,
      displayName: (raw.displayName as string | undefined) || name,
      description: (raw.description as string | undefined) ?? '',
      supportedGenerationMethods: (raw.supportedGenerationMethods as string[] | undefined) ?? [],
    }
  })
  return { models, nextPageToken: (page.nextPageToken as string | undefined) || undefined }
}

export async function listGeminiModels(key: string, signal?: AbortSignal): Promise<GeminiModel[]> {
  if (!key.trim()) throw new Error('Add your Gemini API key in Settings first.')
  const models = new Map<string, GeminiModel>()
  const tokens = new Set<string>()
  let pageToken: string | undefined
  do {
    signal?.throwIfAborted()
    const url = new URL(`${GEMINI_API_BASE}/models`)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url.toString(), {
      headers: { 'x-goog-api-key': key.trim() },
      signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      if (response.status === 400 || response.status === 401)
        throw new Error('Gemini rejected the API key. Check your key in Settings.')
      if (response.status === 403)
        throw new Error(
          'This key cannot list Gemini models. Check its API restrictions and project access.',
        )
      if (response.status === 429)
        throw new Error('Gemini rate limit reached. Wait a little, then refresh the models.')
      throw new Error('Could not load Gemini models. Please try refreshing them.')
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('Gemini returned an invalid model list. Please refresh it.')
    }
    const page = parseGeminiModelPage(body)
    for (const model of page.models) models.set(model.name, model)
    pageToken = page.nextPageToken
    if (pageToken) {
      if (tokens.has(pageToken) || tokens.size >= 100)
        throw new Error('Gemini returned an incomplete model list. Please refresh it.')
      tokens.add(pageToken)
    }
  } while (pageToken)
  return [...models.values()].sort((a, b) => a.name.localeCompare(b.name))
}
