import { DEFAULT_SERVICE, serviceAddress, isServiceTab } from './config.js'

let opening
async function configuredService() {
  const { serviceUrl = DEFAULT_SERVICE } = await chrome.storage.local.get('serviceUrl')
  return serviceAddress(serviceUrl)
}
async function serviceTab(active = false) {
  const service = await configuredService()
  const tabs = await chrome.tabs.query({ url: `${new URL(service).origin}/*` })
  const existing = tabs.filter((tab) => isServiceTab(tab.url, service))
  // Prefer a visible, already unlocked service over a dormant background copy.
  let tab = existing.find((item) => item.active) ?? existing[0]
  if (!tab) {
    opening ??= chrome.tabs.create({ url: service, active }).finally(() => {
      opening = undefined
    })
    tab = await opening
  }
  if (active) {
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  return { tab, service }
}
async function requestService(request) {
  const routeKey = request?.token
    ? `preview:${request.token}`
    : request?.action === 'cancel'
      ? `request:${request.requestId}`
      : undefined
  const route = routeKey ? (await chrome.storage.session.get(routeKey))[routeKey] : undefined
  if (routeKey && !route) {
    if (request.action === 'cancel' || request.action === 'discard') return { cancelled: true }
    throw new Error(
      'This preview is no longer connected. Check Revisit or look up the selection again.',
    )
  }
  const { tab, service } = route
    ? { tab: await chrome.tabs.get(route.tabId), service: route.service }
    : await serviceTab()
  // Wait for a newly opened app without submitting or saving more than once.
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await chrome.tabs.get(tab.id)
    if (!isServiceTab(current.url, service))
      throw new Error('The service tab navigated away. Open MyLexicon and try again.')
    if (current.status === 'complete') {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['service-bridge.js'],
      })
      const ping = await chrome.tabs.sendMessage(tab.id, {
        channel: 'mylexicon-service',
        request: { action: 'ping' },
      })
      if (ping?.ok && ping.result?.ready) {
        if (request.action === 'explain')
          await chrome.storage.session.set({
            [`request:${request.requestId}`]: { tabId: tab.id, service },
          })
        const response = await chrome.tabs.sendMessage(tab.id, {
          channel: 'mylexicon-service',
          request,
        })
        if (request.action === 'explain')
          await chrome.storage.session.remove(`request:${request.requestId}`)
        if (!response?.ok)
          throw new Error(
            response?.error || 'MyLexicon did not answer. Reload its tab and try again.',
          )
        if (response.result?.token)
          await chrome.storage.session.set({
            [`preview:${response.result.token}`]: { tabId: tab.id, service },
          })
        if (request.action === 'discard')
          await chrome.storage.session.remove(`preview:${request.token}`)
        return response.result
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('MyLexicon is not ready. Open or reload your service tab, then try again.')
}
async function showSelection(tab, text = '', frameId = 0) {
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) {
    await chrome.runtime.openOptionsPage()
    return
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId] },
      files: ['capture.js'],
    })
  } catch (error) {
    if (frameId === 0) throw error
    frameId = 0 // A selection in an inaccessible cross-origin frame can still be explained.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] })
  }
  await chrome.tabs.sendMessage(tab.id, { channel: 'mylexicon-show', text }, { frameId })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: 'explain-selection',
      title: 'Explain in Chinese · MyLexicon',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    }),
  )
})
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'explain-selection')
    void showSelection(tab, info.selectionText, info.frameId ?? 0).catch(() =>
      chrome.runtime.openOptionsPage(),
    )
})
chrome.action.onClicked.addListener((tab) => {
  void showSelection(tab).catch(() => chrome.runtime.openOptionsPage())
})
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'explain-selection') return
  void (async () => {
    tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    await showSelection(tab)
  })().catch(() => chrome.runtime.openOptionsPage())
})
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return
  if (message?.action === 'open-service') {
    void serviceTab(true).then(
      () => respond({ ok: true }),
      (error) => respond({ ok: false, error: error.message }),
    )
    return true
  }
  if (
    message?.action !== 'capture-request' ||
    !sender.tab ||
    !/^https?:\/\//i.test(sender.url || '')
  )
    return
  // Keep the worker alive only while an explanation or durable save is outstanding.
  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo()
  }, 20000)
  void requestService(message.request)
    .then(
      (result) => respond({ ok: true, result }),
      (error) => respond({ ok: false, error: error.message || 'Capture failed. Try again.' }),
    )
    .finally(() => clearInterval(keepAlive))
  return true
})
