import { QUERY_LIMIT } from '../ai/gemini'

export const CAPTURE_REQUEST = 'mylexicon:capture:request:v1'
export const CAPTURE_RESPONSE = 'mylexicon:capture:response:v1'

export interface CaptureInput {
  text: string
  context: string
  url: string
  title: string
}

export type CaptureRequest =
  | { action: 'ping' }
  | { action: 'explain'; requestId: string; input: CaptureInput }
  | { action: 'save' | 'discard'; token: string }
  | { action: 'cancel'; requestId: string }

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)

export function parseCaptureRequest(value: unknown): CaptureRequest {
  if (!record(value)) throw new Error('Invalid capture request.')
  if (value.action === 'ping') return { action: 'ping' }
  if ((value.action === 'save' || value.action === 'discard') && identifier(value.token))
    return { action: value.action, token: value.token }
  if (value.action === 'cancel' && identifier(value.requestId))
    return { action: 'cancel', requestId: value.requestId }
  if (value.action !== 'explain' || !identifier(value.requestId) || !record(value.input))
    throw new Error('Invalid capture request.')
  const input = value.input
  if (
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    !/[a-z]/i.test(input.text) ||
    input.text.length > QUERY_LIMIT ||
    typeof input.context !== 'string' ||
    input.context.length > QUERY_LIMIT ||
    typeof input.title !== 'string' ||
    input.title.length > 500 ||
    typeof input.url !== 'string' ||
    input.url.length > 2000
  )
    throw new Error('Select a word or sentence within 5000 characters.')
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    throw new Error('A valid source page is required.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Capture is available on ordinary HTTP and HTTPS pages.')
  // Fragments and embedded credentials are not needed to retain the source.
  url.hash = ''
  return {
    action: 'explain',
    requestId: value.requestId,
    input: {
      text: input.text.trim(),
      context: input.context.trim(),
      url: url.href,
      title: input.title.trim(),
    },
  }
}
