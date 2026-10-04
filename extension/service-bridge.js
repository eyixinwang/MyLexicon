;(() => {
  if (globalThis.__myLexiconServiceBridge) return
  globalThis.__myLexiconServiceBridge = true
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== 'mylexicon-service') return
    const id = crypto.randomUUID()
    const timeoutMs = message.request?.action === 'ping' ? 500 : 75000
    let timer
    function finish(value) {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      respond(value)
    }
    function receive(event) {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== 'mylexicon:capture:response:v1' ||
        event.data.id !== id
      )
        return
      finish(event.data)
    }
    window.addEventListener('message', receive)
    timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: 'MyLexicon did not answer. Update or reload the service tab and try again.',
        }),
      timeoutMs,
    )
    window.postMessage(
      { channel: 'mylexicon:capture:request:v1', id, request: message.request },
      location.origin,
    )
    return true
  })
})()
