import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { lstat, readdir } from 'fs/promises'
import { join } from 'path'
import { StorageError } from '../core/support/storage-error'

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const INVALID_PATH_CHARACTERS = /[\\:<>"|?*]/
const TRAILING_DOT_OR_SPACE = /[. ]$/

export interface SaveFile {
  path: string
  sha256: string
}

export async function inventorySaveFiles(root: string, folders: readonly string[]): Promise<SaveFile[]> {
  const files: SaveFile[] = []

  for (const folder of folders) {
    await collectFiles(root, folder, files)
  }

  assertUniqueAcrossPlatforms(files)

  return files.sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0))
}

export function fingerprintFiles(files: SaveFile[]): string {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex')
}

export function assertPortableSavePath(path: string): void {
  const segments = path.replace(/\/$/, '').split('/')

  if (!segments.every(isPortablePathSegment)) {
    throw new StorageError(`Invalid shared file path: ${path}`)
  }
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function collectFiles(root: string, relativePath: string, files: SaveFile[]): Promise<void> {
  const absolutePath = join(root, relativePath)
  const entry = await lstatIfExists(absolutePath)

  if (!entry) {
    return
  }

  if (entry.isSymbolicLink()) {
    throw new StorageError(`Shared files cannot contain links: ${relativePath}`)
  }

  if (entry.isDirectory()) {
    for (const name of await readdir(absolutePath)) {
      assertPortableSavePath(name)
      await collectFiles(root, `${relativePath}/${name}`, files)
    }

    return
  }

  if (!entry.isFile()) {
    throw new StorageError(`Unsupported shared file: ${relativePath}`)
  }

  files.push({ path: relativePath, sha256: await hashFile(absolutePath) })
}

function assertUniqueAcrossPlatforms(files: SaveFile[]): void {
  const normalizedPaths = new Set<string>()

  for (const file of files) {
    const normalizedPath = file.path.toLowerCase()

    if (normalizedPaths.has(normalizedPath)) {
      throw new StorageError('Shared file names must be unique across Windows, macOS, and Linux.')
    }

    normalizedPaths.add(normalizedPath)
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

function isPortablePathSegment(segment: string): boolean {
  return (
    segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    !INVALID_PATH_CHARACTERS.test(segment) &&
    ![...segment].some((character) => character.charCodeAt(0) < 32) &&
    !TRAILING_DOT_OR_SPACE.test(segment) &&
    !WINDOWS_RESERVED_NAME.test(segment)
  )
}

async function lstatIfExists(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }

    throw error
  }
}
