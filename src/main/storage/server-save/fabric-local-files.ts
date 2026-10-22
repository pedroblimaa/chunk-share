import { readFile } from 'fs/promises'
import type { WorldContext } from '../core/world-context'
import { StorageError } from '../core/support/storage-error'
import { writeJsonFile } from '../persistence/json-file-store'
import { fingerprintFiles, inventorySaveFiles, isMissingFile, type SaveFile } from './save-file-inventory'

const MOD_FOLDERS = ['mods', 'config'] as const

interface FabricBaseline {
  fingerprint: string
}

export async function getFabricFilesFingerprint(serverFolder: string): Promise<string> {
  return fingerprintFiles(await inventorySaveFiles(serverFolder, MOD_FOLDERS))
}

export function fingerprintFabricFiles(files: SaveFile[]): string {
  return fingerprintFiles(
    files.filter((file) => MOD_FOLDERS.some((folder) => file.path.startsWith(`${folder}/`)))
  )
}

export function saveFabricBaseline(context: WorldContext, fingerprint: string): Promise<void> {
  return writeJsonFile(context.paths.fabricBaselineFile, { fingerprint }, isFabricBaseline)
}

export async function readFabricBaseline(path: string): Promise<string> {
  const contents = await readFile(path, 'utf8').catch((error: unknown) => {
    if (isMissingFile(error)) return null
    throw error
  })
  if (!contents) return fingerprintFiles([])
  const value: unknown = JSON.parse(contents)
  if (!isFabricBaseline(value)) {
    throw new StorageError('The local mod baseline is invalid. Restore it from a local server backup.')
  }
  return value.fingerprint
}

function isFabricBaseline(value: unknown): value is FabricBaseline {
  return (
    !!value &&
    typeof value === 'object' &&
    'fingerprint' in value &&
    typeof value.fingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(value.fingerprint)
  )
}
