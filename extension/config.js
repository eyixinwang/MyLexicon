export const DEFAULT_SERVICE = 'https://eyixinwang.github.io/MyLexicon/'

export function serviceAddress(value) {
  const url = new URL(value)
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  const hosted = url.origin === 'https://eyixinwang.github.io' && url.pathname === '/MyLexicon/'
  if ((!local && !hosted) || url.username || url.password || url.search || url.hash)
    throw new Error(
      'Use https://eyixinwang.github.io/MyLexicon/ or your local MyLexicon server address.',
    )
  if (local && url.pathname !== '/') throw new Error('The local service address must end with /.')
  return url.href
}

export function isServiceTab(url, service) {
  try {
    const candidate = new URL(url)
    const expected = new URL(service)
    return (
      candidate.origin === expected.origin &&
      (candidate.pathname === expected.pathname ||
        candidate.pathname === `${expected.pathname}index.html`)
    )
  } catch {
    return false
  }
}
