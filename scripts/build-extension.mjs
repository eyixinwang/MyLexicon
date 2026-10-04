import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// Small, portable ZIP writer (stored entries). No platform-specific zip executable.
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
const names = (await readdir('extension'))
  .filter((name) => /\.(js|json|html|css|png|md)$/.test(name))
  .sort()
const locals = []
const directory = []
let offset = 0
for (const name of names) {
  const filename = Buffer.from(`mylexicon-capture/${name}`)
  const data = await readFile(`extension/${name}`)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x21, 12) // 1980-01-01; reproducible archive.
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(filename.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x21, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(filename.length, 28)
  central.writeUInt32LE(offset, 42)
  locals.push(local, filename, data)
  directory.push(central, filename)
  offset += local.length + filename.length + data.length
}
const central = Buffer.concat(directory)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(names.length, 8)
end.writeUInt16LE(names.length, 10)
end.writeUInt32LE(central.length, 12)
end.writeUInt32LE(offset, 16)
const destination = process.argv[2] || 'dist/mylexicon-capture.zip'
await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, Buffer.concat([...locals, central, end]))
console.log(`Packaged MyLexicon Capture (${names.length} files).`)
