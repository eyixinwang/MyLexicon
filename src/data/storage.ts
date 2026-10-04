import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Operation } from '../domain/model'
import { planSentenceVersionRepairs } from '../domain/sentenceVersions'

interface StoredOperation {
  id: string
  op: Operation
  uploaded: boolean
}

interface LexiconDB extends DBSchema {
  operations: { key: string; value: StoredOperation }
  seenFiles: { key: string; value: string }
  meta: { key: string; value: string }
}

let database: Promise<IDBPDatabase<LexiconDB>> | undefined
function notifyChanged() {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
  const channel = new BroadcastChannel('mylexicon-changes')
  channel.postMessage('changed')
  channel.close()
}
export function subscribeToChanges(callback: () => void): () => void {
  if (!('BroadcastChannel' in window)) return () => {}
  const channel = new BroadcastChannel('mylexicon-changes')
  channel.onmessage = callback
  return () => channel.close()
}
function db() {
  database ??= openDB<LexiconDB>('mylexicon-v1', 1, {
    upgrade(store) {
      store.createObjectStore('operations', { keyPath: 'id' })
      store.createObjectStore('seenFiles')
      store.createObjectStore('meta')
    },
  })
  return database
}

export async function getDeviceId(): Promise<string> {
  const store = await db()
  let id = await store.get('meta', 'deviceId')
  if (!id) {
    id = crypto.randomUUID()
    await store.put('meta', id, 'deviceId')
  }
  return id
}

export async function getBoundSubject(): Promise<string | undefined> {
  return (await db()).get('meta', 'googleSubject')
}

export async function bindSubject(subject: string): Promise<void> {
  const store = await db()
  const tx = store.transaction('meta', 'readwrite')
  const existing = await tx.store.get('googleSubject')
  if (existing && existing !== subject) {
    throw new Error(
      'This device is linked to another Google account. Export its data before changing accounts.',
    )
  }
  await tx.store.put(subject, 'googleSubject')
  await tx.done
}

export async function getOperations(): Promise<Operation[]> {
  return (await (await db()).getAll('operations')).map((item) => item.op)
}

export async function getPendingOperations(): Promise<Operation[]> {
  return (await (await db()).getAll('operations'))
    .filter((item) => !item.uploaded)
    .map((item) => item.op)
}

export async function repairSentenceVersions(): Promise<number> {
  const store = await db()
  // Read and append in one transaction: simultaneous tabs cannot create sibling repairs.
  const tx = store.transaction(['operations', 'meta'], 'readwrite')
  const operationStore = tx.objectStore('operations')
  const records = await operationStore.getAll()
  const deviceId = (await tx.objectStore('meta').get('deviceId')) ?? crypto.randomUUID()
  const repairs = planSentenceVersionRepairs(
    records.map((record) => record.op),
    deviceId,
  )
  if (repairs.length) {
    await tx.objectStore('meta').put(deviceId, 'deviceId')
    for (const op of repairs) await operationStore.add({ id: op.id, op, uploaded: false })
  }
  await tx.done
  if (repairs.length) notifyChanged()
  return repairs.length
}

export async function addLocalOperation(op: Operation): Promise<void> {
  await (await db()).add('operations', { id: op.id, op, uploaded: false })
  notifyChanged()
}

// A capture save can be retried after its response channel disappears.
// Check and write in one transaction so retrying never adds another entry.
export async function addLocalOperationOnce(op: Operation): Promise<void> {
  const tx = (await db()).transaction('operations', 'readwrite')
  const existing = await tx.store.get(op.id)
  if (existing && JSON.stringify(existing.op) !== JSON.stringify(op)) {
    tx.abort()
    throw new Error('This capture ID already belongs to a different change.')
  }
  if (!existing) await tx.store.add({ id: op.id, op, uploaded: false })
  await tx.done
  if (!existing) notifyChanged()
}

// Credentials stay in device metadata, outside the operation log, Drive, and backups.
export async function getGeminiKey(): Promise<string> {
  return (await (await db()).get('meta', 'geminiApiKey')) ?? ''
}

export async function setGeminiKey(key: string): Promise<void> {
  const store = await db()
  if (key.trim()) await store.put('meta', key.trim(), 'geminiApiKey')
  else await store.delete('meta', 'geminiApiKey')
}

export async function addImportedOperations(ops: Operation[]): Promise<number> {
  const store = await db()
  // Check the entire import before opening a write transaction so a duplicate
  // ID with different content cannot leave a partially imported library.
  const existing = await Promise.all(ops.map((op) => store.get('operations', op.id)))
  for (let index = 0; index < ops.length; index++) {
    const previous = existing[index]
    if (previous && JSON.stringify(previous.op) !== JSON.stringify(ops[index])) {
      throw new Error('The data file reuses an ID for different content.')
    }
  }
  const tx = store.transaction('operations', 'readwrite')
  let added = 0
  for (let index = 0; index < ops.length; index++) {
    if (!existing[index]) {
      const op = ops[index]
      await tx.store.add({ id: op.id, op, uploaded: false })
      added++
    }
  }
  await tx.done
  if (added) notifyChanged()
  return added
}

export async function hasSeenFile(id: string): Promise<boolean> {
  return !!(await (await db()).get('seenFiles', id))
}

export async function addRemoteBatch(fileId: string, ops: Operation[]): Promise<void> {
  const store = await db()
  const existing = await Promise.all(ops.map((op) => store.get('operations', op.id)))
  for (let index = 0; index < ops.length; index++) {
    const previous = existing[index]
    if (previous && JSON.stringify(previous.op) !== JSON.stringify(ops[index])) {
      throw new Error('A remote operation ID contains different content. Sync stopped.')
    }
  }
  const tx = store.transaction(['operations', 'seenFiles'], 'readwrite')
  for (const op of ops) {
    await tx.objectStore('operations').put({ id: op.id, op, uploaded: true })
  }
  await tx.objectStore('seenFiles').put(fileId, fileId)
  await tx.done
  notifyChanged()
}

export async function markUploaded(ops: Operation[], fileId: string): Promise<void> {
  const store = await db()
  const tx = store.transaction(['operations', 'seenFiles'], 'readwrite')
  for (const op of ops) {
    const item = await tx.objectStore('operations').get(op.id)
    if (item) await tx.objectStore('operations').put({ ...item, uploaded: true })
  }
  await tx.objectStore('seenFiles').put(fileId, fileId)
  await tx.done
}

export async function getLastSyncedAt(): Promise<string | undefined> {
  return (await db()).get('meta', 'lastSyncedAt')
}

export async function setLastSyncedAt(at: string): Promise<void> {
  await (await db()).put('meta', at, 'lastSyncedAt')
}
