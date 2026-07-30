import { readFile, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))

if (packageJson.name !== 'chunk-share') {
  throw new Error('Run clean:dev-data from the ChunkShare repository root.')
}

const generatedPaths = [
  '.backups',
  '.chunkshare-backups',
  '.chunkshare-server',
  '.chunkshare-server-test',
  '.chunkshare-storage',
  '.chunkshare-storage-test',
  '.server',
  '.server-test',
  '.servers',
  '.storage',
  '.storage-test',
  'localState.json',
  'localState.test.json'
]

const rootEntries = await readdir(projectRoot)
const interruptedServerPaths = rootEntries.filter(
  (name) => name.startsWith('.server.download') || name.startsWith('.server.extract')
)

await Promise.all(
  [...generatedPaths, ...interruptedServerPaths].map((path) =>
    rm(resolve(projectRoot, path), { force: true, recursive: true })
  )
)

console.log('ChunkShare development data cleared.')
