import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SERVICE, isServiceTab, serviceAddress } from '../../extension/config.js'

const workerSource = (
  await readFile(new URL('../../extension/background.js', import.meta.url), 'utf8')
).replace(/^import .*\n/, '')
function event() {
  const listeners = []
  return { addListener: (fn) => listeners.push(fn), listeners }
}
function worker() {
  let activeService = 10
  const session = {}
  const serviceTabs = [10, 11].map((id) => ({
    id,
    windowId: 1,
    url: DEFAULT_SERVICE,
    status: 'complete',
    active: id === 10,
  }))
  const sendMessage = vi.fn(async (id, message) => {
    const request = message.request
    if (request.action === 'ping') return { ok: true, result: { ready: true } }
    if (request.action === 'explain')
      return { ok: true, result: { token: 'preview-token', data: { text: 'example' } } }
    if (request.action === 'save')
      return { ok: true, result: { entryId: 'entry-id', collection: 'revisit' } }
    return { ok: true, result: { discarded: true } }
  })
  const chrome = {
    runtime: {
      id: 'extension-id',
      onMessage: event(),
      onInstalled: event(),
      openOptionsPage: vi.fn(),
      getPlatformInfo: vi.fn(async () => ({})),
    },
    contextMenus: { onClicked: event(), removeAll: vi.fn(), create: vi.fn() },
    action: { onClicked: event() },
    commands: { onCommand: event() },
    scripting: { executeScript: vi.fn(async () => {}) },
    tabs: {
      query: vi.fn(async () =>
        serviceTabs.map((tab) => ({ ...tab, active: tab.id === activeService })),
      ),
      get: vi.fn(async (id) => serviceTabs.find((tab) => tab.id === id)),
      create: vi.fn(async (options) => ({ id: 12, windowId: 1, status: 'complete', ...options })),
      update: vi.fn(async () => {}),
      sendMessage,
    },
    windows: { update: vi.fn(async () => {}) },
    storage: {
      local: { get: vi.fn(async () => ({ serviceUrl: DEFAULT_SERVICE })) },
      session: {
        get: async (key) => ({ [key]: session[key] }),
        set: async (data) => Object.assign(session, data),
        remove: async (key) => {
          delete session[key]
        },
      },
    },
  }
  runInNewContext(workerSource, {
    chrome,
    DEFAULT_SERVICE,
    serviceAddress,
    isServiceTab,
    URL,
    setInterval,
    clearInterval,
    setTimeout,
  })
  async function request(
    value,
    sender = { id: 'extension-id', tab: { id: 1 }, url: 'https://example.com/article' },
  ) {
    return new Promise((resolve, reject) => {
      const accepted = chrome.runtime.onMessage.listeners[0](
        { action: 'capture-request', request: value },
        sender,
        resolve,
      )
      if (!accepted) reject(new Error('rejected sender'))
    })
  }
  return {
    chrome,
    request,
    session,
    switchService: () => {
      activeService = 11
    },
  }
}

describe('extension routing and permissions', () => {
  it('accepts only the intended service origin/path and local development', () => {
    expect(serviceAddress(DEFAULT_SERVICE)).toBe(DEFAULT_SERVICE)
    expect(serviceAddress('http://127.0.0.1:5174/')).toBe('http://127.0.0.1:5174/')
    expect(isServiceTab(`${DEFAULT_SERVICE}?view=revisit`, DEFAULT_SERVICE)).toBe(true)
    for (const value of [
      'https://evil.example/',
      'https://eyixinwang.github.io/OtherProject/',
      'https://eyixinwang.github.io/MyLexicon/?secret=key',
      'http://user:password@localhost:5173/',
    ])
      expect(() => serviceAddress(value)).toThrow()
    expect(isServiceTab('https://eyixinwang.github.io/OtherProject/', DEFAULT_SERVICE)).toBe(false)
    expect(isServiceTab(`${DEFAULT_SERVICE}extra/`, DEFAULT_SERVICE)).toBe(false)
  })
  it('routes a save and discard to the original service tab even after another service tab becomes active', async () => {
    const f = worker()
    await f.request({ action: 'explain', requestId: 'lookup-id', input: {} })
    expect(f.session['preview:preview-token'].tabId).toBe(10)
    expect(f.session['request:lookup-id']).toBeUndefined()
    f.switchService()
    const saved = await f.request({ action: 'save', token: 'preview-token' })
    expect(saved).toMatchObject({ ok: true, result: { collection: 'revisit' } })
    expect(f.chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
      10,
      expect.objectContaining({ request: { action: 'save', token: 'preview-token' } }),
    )
    await f.request({ action: 'discard', token: 'preview-token' })
    expect(f.session['preview:preview-token']).toBeUndefined()
    expect(f.chrome.tabs.create).not.toHaveBeenCalled()
    expect(f.chrome.tabs.update).not.toHaveBeenCalled()
  })
  it('rejects other extensions and unknown save routes without opening or writing anything', async () => {
    const f = worker()
    await expect(
      f.request(
        { action: 'save', token: 'forged' },
        { id: 'other-extension', tab: { id: 1 }, url: 'https://example.com/' },
      ),
    ).rejects.toThrow('rejected')
    await expect(f.request({ action: 'save', token: 'forged' })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('no longer connected'),
    })
    expect(f.chrome.tabs.sendMessage).not.toHaveBeenCalled()
    expect(f.chrome.tabs.create).not.toHaveBeenCalled()
  })
})
