import { createWriteStream } from 'fs'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { ZipArchive } from 'archiver'
import extractZip from 'extract-zip'
import { fingerprintFabricFiles } from './fabric-local-files'
import type { LatestSave, ServerConfig } from '../../../shared/domain'
import { isFabricRuntime } from '../../../shared/fabric'
import type { WorldContext } from '../core/world-context'
import { StorageError } from '../core/support/storage-error'
import {
  assertPortableSavePath,
  fingerprintFiles,
  inventorySaveFiles,
  type SaveFile
} from './save-file-inventory'

const SHARED_FOLDERS = ['world', 'mods', 'config'] as const

interface FabricSaveManifest {
  formatVersion: 1
  worldId: string
  minecraftVersion: string
  fabric: NonNullable<ServerConfig['fabric']>
  files: SaveFile[]
}

export async function createFabricSavePackage(
  context: WorldContext,
  config: ServerConfig,
  destination: string
): Promise<string> {
  if (!isFabricRuntime(config.fabric)) throw new StorageError('Fabric versions are missing.')
  const staging = `${destination}.staging`
  await mkdir(staging, { recursive: true })
  try {
    const before = await inventorySaveFiles(context.paths.serverFolder, SHARED_FOLDERS)
    for (const folder of SHARED_FOLDERS) {
      await mkdir(join(staging, folder), { recursive: true })
      if (await folderExists(join(context.paths.serverFolder, folder))) {
        await cp(join(context.paths.serverFolder, folder), join(staging, folder), { recursive: true })
      }
    }
    const files = await inventorySaveFiles(staging, SHARED_FOLDERS)
    const after = await inventorySaveFiles(context.paths.serverFolder, SHARED_FOLDERS)
    if (
      fingerprintFiles(before) !== fingerprintFiles(files) ||
      fingerprintFiles(files) !== fingerprintFiles(after)
    ) {
      throw new StorageError(
        'Server files changed while preparing the save. Finish editing and retry publishing.'
      )
    }
    const manifest: FabricSaveManifest = {
      formatVersion: 1,
      worldId: context.worldId,
      minecraftVersion: config.minecraftVersion,
      fabric: config.fabric,
      files
    }
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest), 'utf8')
    await archivePackage(staging, destination)
    return fingerprintFabricFiles(files)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function extractFabricSavePackage(
  archive: string,
  destination: string,
  context: WorldContext,
  latestSave: NonNullable<LatestSave>
): Promise<string> {
  const entries = new Set<string>()
  await extractZip(archive, {
    dir: destination,
    onEntry(entry) {
      assertPortableSavePath(entry.fileName)
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000
      if (mode !== 0 && mode !== 0o100000 && mode !== 0o040000) {
        throw new StorageError('Shared save archives cannot contain links or special files.')
      }
      const name = entry.fileName.replace(/\/$/, '').toLowerCase()
      if (entries.has(name)) throw new StorageError('The shared save contains duplicate file paths.')
      entries.add(name)
      const root = entry.fileName.split('/')[0]
      if (entry.fileName !== 'manifest.json' && !SHARED_FOLDERS.some((folder) => folder === root)) {
        throw new StorageError(`Unexpected shared save entry: ${entry.fileName}`)
      }
    }
  })
  const manifest: unknown = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'))
  assertManifest(manifest, context.worldId, latestSave)
  const files = await inventorySaveFiles(destination, SHARED_FOLDERS)
  if (fingerprintFiles(files) !== fingerprintFiles(manifest.files)) {
    throw new StorageError('The shared save failed file integrity verification.')
  }
  if (!(await stat(join(destination, 'world', 'level.dat'))).isFile()) {
    throw new StorageError('The shared save does not contain a valid world.')
  }
  for (const folder of SHARED_FOLDERS) await mkdir(join(destination, folder), { recursive: true })
  return fingerprintFabricFiles(files)
}

function assertManifest(
  value: unknown,
  worldId: string,
  latestSave: NonNullable<LatestSave>
): asserts value is FabricSaveManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('formatVersion' in value) ||
    value.formatVersion !== 1 ||
    !('worldId' in value) ||
    value.worldId !== worldId ||
    !('minecraftVersion' in value) ||
    value.minecraftVersion !== latestSave.minecraftVersion ||
    !('fabric' in value) ||
    !isFabricRuntime(value.fabric) ||
    value.fabric.loaderVersion !== latestSave.fabric?.loaderVersion ||
    value.fabric.installerVersion !== latestSave.fabric?.installerVersion ||
    !('files' in value) ||
    !Array.isArray(value.files) ||
    !value.files.every(isSaveFile)
  ) {
    throw new StorageError('The Fabric save manifest does not match the shared world metadata.')
  }
}

function isSaveFile(value: unknown): value is SaveFile {
  return (
    !!value &&
    typeof value === 'object' &&
    'path' in value &&
    typeof value.path === 'string' &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  )
}

async function archivePackage(source: string, destination: string): Promise<void> {
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const output = createWriteStream(destination)
  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('warning', reject)
  })
  archive.pipe(output)
  archive.directory(source, false)
  try {
    await Promise.all([archive.finalize(), finished])
  } catch (error) {
    archive.abort()
    output.destroy()
    throw error
  }
}

async function folderExists(path: string): Promise<boolean> {
  const entry = await stat(path).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  })
  return entry?.isDirectory() ?? false
}
