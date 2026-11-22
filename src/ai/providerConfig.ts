import { DEFAULT_GEMINI_MODEL } from './models'

export const providers = {
  gemini: {
    label: 'Google Gemini',
    host: 'generativelanguage.googleapis.com',
    pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  openai: { label: 'OpenAI', host: 'api.openai.com', pricing: 'https://openai.com/api/pricing/' },
  deepseek: {
    label: 'DeepSeek',
    host: 'api.deepseek.com',
    pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
  openrouter: {
    label: 'OpenRouter',
    host: 'openrouter.ai',
    pricing: 'https://openrouter.ai/models',
  },
} as const

export type Provider = keyof typeof providers
export interface AIProfile {
  provider: Provider
  key: string
  model: string
}
export const initialProfile: AIProfile = {
  provider: 'gemini',
  key: '',
  model: DEFAULT_GEMINI_MODEL,
}
export const isProvider = (value: unknown): value is Provider =>
  typeof value === 'string' && Object.hasOwn(providers, value)

export function suggestProvider(input: string): Provider | undefined {
  const key = input.trim()
  if (key.startsWith('sk-or-v1-')) return 'openrouter'
  if (key.startsWith('sk-proj-')) return 'openai'
  if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'gemini'
}
