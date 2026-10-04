import { CAPTURE_REQUEST, CAPTURE_RESPONSE } from './protocol'

export function listenForCapture(handle: (request: unknown) => Promise<unknown>) {
  const listener = (event: MessageEvent) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.channel !== CAPTURE_REQUEST ||
      typeof event.data?.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(event.data.id)
    )
      return
    const id = event.data.id
    void handle(event.data.request).then(
      (result) =>
        window.postMessage(
          { channel: CAPTURE_RESPONSE, id, ok: true, result },
          window.location.origin,
        ),
      (reason) =>
        window.postMessage(
          {
            channel: CAPTURE_RESPONSE,
            id,
            ok: false,
            error: reason instanceof Error ? reason.message : 'Capture failed. Please try again.',
          },
          window.location.origin,
        ),
    )
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
