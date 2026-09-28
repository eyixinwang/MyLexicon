import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const root = 'dist'
const base = process.env.VITE_BASE_PATH || '/'
if (!base.startsWith('/') || !base.endsWith('/')) {
  throw new Error('VITE_BASE_PATH must start and end with a slash.')
}
async function filesIn(directory) {
  const found = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) found.push(...(await filesIn(path)))
    else if (item.name !== 'sw.js') found.push(path)
  }
  return found
}
const files = (await filesIn(root)).sort()
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(file))
const cacheName = `mylexicon-${base.replaceAll('/', '_')}-${hash.digest('hex').slice(0, 12)}`
const paths = files.map(
  (file) => base + relative(root, file).split('/').map(encodeURIComponent).join('/'),
)
const source =
  `const CACHE = ${JSON.stringify(cacheName)};\n` +
  `const ASSETS = ${JSON.stringify(paths)};\n` +
  `const HOME = ${JSON.stringify(base)};\n` +
  `self.addEventListener('install', event => {\n` +
  `  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));\n` +
  `});\n` +
  `self.addEventListener('activate', event => {\n` +
  `  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(${JSON.stringify(`mylexicon-${base.replaceAll('/', '_')}-`)}) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));\n` +
  `});\n` +
  `self.addEventListener('fetch', event => {\n` +
  `  const url = new URL(event.request.url);\n` +
  `  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(HOME)) return;\n` +
  `  if (event.request.mode === 'navigate') {\n` +
  `    event.respondWith(fetch(event.request).catch(() => caches.match(HOME + 'index.html')));\n` +
  `  } else if (ASSETS.includes(url.pathname)) {\n` +
  `    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));\n` +
  `  }\n` +
  `});\n`
await writeFile(join(root, 'sw.js'), source)
console.log(`Generated service worker for ${files.length} public assets.`)
