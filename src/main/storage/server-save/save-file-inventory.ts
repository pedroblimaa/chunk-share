import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { lstat, readdir } from 'fs/promises'
import { join } from 'path'
import { StorageError } from '../core/support/storage-error'

export interface SaveFile {
  path: string
  sha256: string
}

export async function inventorySaveFiles(root: string, folders: readonly string[]): Promise<SaveFile[]> {
  const files: SaveFile[] = []
  for (const folder of folders) await collectFiles(root, folder, files)
  const paths = new Set<string>()
  for (const file of files) {
    const normalizedPath = file.path.toLowerCase()
    if (paths.has(normalizedPath))
      throw new StorageError('Shared file names must be unique across Windows, macOS, and Linux.')
    paths.add(normalizedPath)
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

export function fingerprintFiles(files: SaveFile[]): string {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex')
}

async function collectFiles(root: string, relativePath: string, files: SaveFile[]): Promise<void> {
  const absolutePath = join(root, relativePath)
  const entry = await lstat(absolutePath).catch((error: unknown) => {
    if (isMissingFile(error)) return null
    throw error
  })
  if (!entry) return
  if (entry.isSymbolicLink()) throw new StorageError(`Shared files cannot contain links: ${relativePath}`)
  if (entry.isDirectory()) {
    for (const name of await readdir(absolutePath)) {
      assertPortableSavePath(name)
      await collectFiles(root, `${relativePath}/${name}`, files)
    }
    return
  }
  if (!entry.isFile()) throw new StorageError(`Unsupported shared file: ${relativePath}`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk)
  files.push({ path: relativePath, sha256: hash.digest('hex') })
}

export function assertPortableSavePath(path: string): void {
  const segments = path.replace(/\/$/, '').split('/')
  if (
    segments.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\:<>"|?*]/.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  ) {
    throw new StorageError(`Invalid shared file path: ${path}`)
  }
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
