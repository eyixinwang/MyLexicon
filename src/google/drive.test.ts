import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyEntry, type Operation } from '../domain/model'

const storage = vi.hoisted(() => ({
  getBoundSubject: vi.fn(),
  getPendingOperations: vi.fn(),
  hasSeenFile: vi.fn(),
  addRemoteBatch: vi.fn(),
  markUploaded: vi.fn(),
  setLastSyncedAt: vi.fn(),
}))
vi.mock('../data/storage', () => storage)
import { syncDrive } from './drive'

const connection = {
  token: 'test-token',
  expiresAt: Date.now() + 60_000,
  subject: 'owner',
  email: 'owner@example.test',
}
const operation: Operation = {
  schemaVersion: 1,
  type: 'entry',
  id: 'op-1',
  entryId: 'entry-1',
  deviceId: 'device-1',
  at: '2026-09-28T00:00:00.000Z',
  parents: [],
  value: { ...emptyEntry(), text: 'hello' },
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.getBoundSubject.mockResolvedValue('owner')
  storage.getPendingOperations.mockResolvedValueOnce([operation]).mockResolvedValue([])
  storage.hasSeenFile.mockResolvedValue(false)
  storage.markUploaded.mockResolvedValue(undefined)
  storage.setLastSyncedAt.mockResolvedValue(undefined)
})

describe('Drive synchronization', () => {
  it('uploads an immutable batch to app data and acknowledges local changes', async () => {
    let lists = 0
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
      if (url.includes('uploadType=multipart')) {
        expect(init?.method).toBe('POST')
        expect(String(init?.body)).toContain('appDataFolder')
        expect(String(init?.body)).toContain('op-1')
        return new Response(JSON.stringify({ id: 'remote-file-1' }), { status: 200 })
      }
      lists++
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await syncDrive(connection)
      expect(lists).toBe(2)
      expect(storage.markUploaded).toHaveBeenCalledWith([operation], 'remote-file-1')
      expect(storage.setLastSyncedAt).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects a different account before making a network request', async () => {
    storage.getBoundSubject.mockResolvedValue('someone-else')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(syncDrive(connection)).rejects.toThrow('does not match')
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
