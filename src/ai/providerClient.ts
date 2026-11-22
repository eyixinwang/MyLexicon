import { loadGeminiModels, lookupGemini, LOCAL_GEMINI_PROXY } from './client'
import { geminiRequest, LEXICON_SCHEMA, parseGeminiEntry, type ReadingContext } from './gemini'
import { providers, type AIProfile } from './providerConfig'
import { supportsContentGeneration } from './models'

export const canConnect = (profile: AIProfile) =>
  !!profile.key || (profile.provider === 'gemini' && LOCAL_GEMINI_PROXY)
type ChatProvider = Exclude<AIProfile['provider'], 'gemini'>
const base = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}
interface ModelOption {
  name: string
  description: string
  selectable: boolean
}

async function request(
  provider: ChatProvider,
  key: string,
  path: string,
  signal: AbortSignal,
  body?: object,
) {
  if (!key.trim()) throw new Error('Save an API key in Settings first.')
  const label = providers[provider].label
  let response: Response
  try {
    response = await fetch(base[provider] + path, {
      method: body ? 'POST' : 'GET',
      signal,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + key,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      ...(body && { body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error(
      signal.aborted
        ? 'Request cancelled or timed out.'
        : 'No readable response from ' +
            providers[provider].host +
            '. Check whether your network or browser blocks this host, then retry.',
    )
  }
  if (!response.ok) {
    const action =
      response.status === 401
        ? 'Replace the saved key with an active key issued by ' + label + '.'
        : response.status === 403
          ? 'Check the permissions for this provider account.'
          : response.status === 402
            ? 'Check the available balance in your provider account.'
            : response.status === 429
              ? 'Rate or quota limit reached. Check your quota or try again later.'
              : body
                ? 'Check that the selected model supports structured chat responses.'
                : 'Try refreshing the list.'
    throw new Error(label + ' request failed (' + response.status + '). ' + action)
  }
  return response.json()
}

export async function loadModels(profile: AIProfile, signal: AbortSignal): Promise<ModelOption[]> {
  if (profile.provider === 'gemini')
    return (await loadGeminiModels(profile.key, signal)).map((m) => ({
      name: m.name,
      description: m.description,
      selectable: supportsContentGeneration(m),
    }))
  const payload = await request(
    profile.provider,
    profile.key,
    profile.provider === 'openrouter' ? '/models/user' : '/models',
    signal,
  )
  if (!Array.isArray(payload?.data)) throw new Error('The provider returned an invalid model list.')
  return payload.data
    .flatMap(
      (m: {
        id?: string
        description?: string
        supported_parameters?: string[]
        output_modalities?: string[]
        architecture?: { output_modalities?: string[] }
      }) => {
        if (typeof m?.id !== 'string' || !m.id.trim() || m.id.length > 256) return []
        return [
          {
            name: m.id,
            description: typeof m.description === 'string' ? m.description : '',
            selectable:
              (!m.output_modalities || m.output_modalities.includes('text')) &&
              (!m.supported_parameters ||
                m.supported_parameters.includes('structured_outputs') ||
                m.supported_parameters.includes('response_format')) &&
              (!m.architecture?.output_modalities ||
                m.architecture.output_modalities.includes('text')),
          },
        ]
      },
    )
    .sort((a: ModelOption, b: ModelOption) => a.name.localeCompare(b.name))
}

export async function lookupAI(
  query: string,
  profile: AIProfile,
  signal: AbortSignal,
  reading?: ReadingContext,
) {
  const { provider, key, model } = profile
  if (provider === 'gemini') return lookupGemini(query, key, signal, reading, model)
  if (!model) throw new Error('Choose an AI model in Settings first.')
  const prompt = geminiRequest(query, reading)
  const systemInstruction = prompt.systemInstruction.parts[0].text
  const instructions =
    provider === 'deepseek'
      ? systemInstruction +
        '\nReturn a JSON object matching this schema: ' +
        JSON.stringify(LEXICON_SCHEMA)
      : systemInstruction
  const payload = await request(provider, key, '/chat/completions', signal, {
    model,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: prompt.contents[0].parts[0].text },
    ],
    response_format:
      provider === 'deepseek'
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: { name: 'lexicon_entry', strict: true, schema: LEXICON_SCHEMA },
          },
    ...(provider === 'openrouter' && { provider: { require_parameters: true } }),
  })
  const answer = payload?.choices?.[0]
  if (
    answer?.finish_reason !== 'stop' ||
    answer.message?.refusal ||
    typeof answer.message?.content !== 'string'
  )
    throw new Error('The provider did not return a complete entry. Nothing was saved.')
  let fields: unknown
  try {
    fields = JSON.parse(answer.message.content)
  } catch {
    throw new Error('The provider returned invalid JSON. Nothing was saved.')
  }
  const entry = parseGeminiEntry(fields, query, new Date().toISOString(), model, provider)
  return reading ? { ...entry, text: query.trim(), context: reading.context.trim() } : entry
}
