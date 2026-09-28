import type { Operation } from '../domain/model'
import { parseOperations } from '../domain/validation'
import {
  addRemoteBatch,
  getBoundSubject,
  getPendingOperations,
  hasSeenFile,
  markUploaded,
  setLastSyncedAt,
} from '../data/storage'
import type { GoogleConnection } from './auth'

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const PREFIX = 'mylexicon-batch-v1-'

interface DriveFile {
  id: string
  name: string
}

async function authorizedFetch(connection: GoogleConnection, url: string, init: RequestInit = {}) {
  if (Date.now() >= connection.expiresAt) {
    throw new Error('Google access expired. Reconnect to continue syncing.')
  }
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${connection.token}` },
  })
  if (response.status === 401)
    throw new Error('Google access expired. Reconnect to continue syncing.')
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`Google Drive request failed (${response.status}). ${detail}`)
  }
  return response
}

async function listBatches(connection: GoogleConnection): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(API)
    url.searchParams.set('spaces', 'appDataFolder')
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('fields', 'nextPageToken,files(id,name)')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await authorizedFetch(connection, url.toString())
    const page = (await response.json()) as { nextPageToken?: string; files?: DriveFile[] }
    files.push(...(page.files ?? []).filter((file) => file.name?.startsWith(PREFIX) && !!file.id))
    pageToken = page.nextPageToken
  } while (pageToken)
  return files
}

async function downloadUnseen(connection: GoogleConnection): Promise<void> {
  for (const file of await listBatches(connection)) {
    if (await hasSeenFile(file.id)) continue
    const response = await authorizedFetch(
      connection,
      `${API}/${encodeURIComponent(file.id)}?alt=media`,
    )
    const content = (await response.json()) as unknown
    const operations = parseOperations(content)
    await addRemoteBatch(file.id, operations)
  }
}

async function uploadBatch(connection: GoogleConnection, operations: Operation[]): Promise<string> {
  const boundary = `mylexicon_${crypto.randomUUID().replaceAll('-', '')}`
  const name = `${PREFIX}${crypto.randomUUID()}.json`
  const payload = JSON.stringify({ schemaVersion: 1, operations })
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name, mimeType: 'application/json', parents: ['appDataFolder'] }),
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    payload,
    `\r\n--${boundary}--`,
  ].join('')
  const response = await authorizedFetch(connection, `${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  const uploaded = (await response.json()) as { id?: string }
  if (!uploaded.id) throw new Error('Google Drive did not confirm the uploaded batch.')
  return uploaded.id
}

export async function syncDrive(connection: GoogleConnection): Promise<void> {
  const bound = await getBoundSubject()
  if (!bound || bound !== connection.subject) {
    throw new Error('The connected Google account does not match this device’s library.')
  }
  await downloadUnseen(connection)
  while (true) {
    const pending: Operation[] = []
    let bytes = 0
    // Multipart uploads are intended for files under 5 MB. Keep room for the
    // metadata and MIME boundary, even when a user saves unusually long notes.
    for (const op of await getPendingOperations()) {
      if (pending.length >= 100) break
      const size = new TextEncoder().encode(JSON.stringify(op)).length
      if (pending.length && bytes + size > 4_000_000) break
      pending.push(op)
      bytes += size
    }
    if (!pending.length) break
    const fileId = await uploadBatch(connection, pending)
    await markUploaded(pending, fileId)
  }
  // Catch batches another device uploaded during this round. A later sync catches
  // any that arrive after this list; immutable batches prevent lost writes.
  await downloadUnseen(connection)
  await setLastSyncedAt(new Date().toISOString())
}
