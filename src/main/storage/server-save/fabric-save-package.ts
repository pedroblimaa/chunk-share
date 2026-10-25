import { ZipArchive } from 'archiver'
import extractZip from 'extract-zip'
import { createWriteStream } from 'fs'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import type { LatestSave, ServerConfig } from '../../../shared/domain'
import { isFabricRuntime, type FabricRuntime } from '../../../shared/fabric'
import type { WorldContext } from '../core/world-context'
import { StorageError } from '../core/support/storage-error'
import { fingerprintFabricFiles } from './fabric-local-files'
import {
  assertPortableSavePath,
  fingerprintFiles,
  inventorySaveFiles,
  isMissingFile,
  type SaveFile
} from './save-file-inventory'
import { SERVER_PROPERTIES_FILE_NAME } from './server-save-layout'

const SHARED_FOLDERS = ['world', 'mods', 'config'] as const
const SHARED_ENTRIES = [...SHARED_FOLDERS, SERVER_PROPERTIES_FILE_NAME]
const MANIFEST_FILE_NAME = 'manifest.json'
const FILE_TYPE_MASK = 0o170000
const ALLOWED_FILE_TYPES = [0, 0o100000, 0o040000]

interface ArchiveEntry {
  fileName: string
  externalFileAttributes: number
}

interface FabricSaveManifest {
  formatVersion: 1
  worldId: string
  minecraftVersion: string
  fabric: FabricRuntime
  files: SaveFile[]
}

export async function createFabricSavePackage(
  context: WorldContext,
  config: ServerConfig,
  destination: string
): Promise<string> {
  if (!isFabricRuntime(config.fabric)) {
    throw new StorageError('Fabric versions are missing.')
  }

  const staging = `${destination}.staging`

  await mkdir(staging, { recursive: true })

  try {
    const files = await stageSharedEntries(context.paths.serverFolder, staging)
    const manifest: FabricSaveManifest = {
      formatVersion: 1,
      worldId: context.worldId,
      minecraftVersion: config.minecraftVersion,
      fabric: config.fabric,
      files
    }

    await writeFile(join(staging, MANIFEST_FILE_NAME), JSON.stringify(manifest), 'utf8')
    await archiveFolder(staging, destination)

    return fingerprintFabricFiles(files)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function extractFabricSavePackage(
  archive: string,
  destination: string,
  worldId: string,
  latestSave: NonNullable<LatestSave>
): Promise<string> {
  const entryNames = new Set<string>()

  await extractZip(archive, {
    dir: destination,
    onEntry: (entry) => assertSafeArchiveEntry(entry, entryNames)
  })

  const manifest: unknown = JSON.parse(await readFile(join(destination, MANIFEST_FILE_NAME), 'utf8'))
  assertManifest(manifest, worldId, latestSave)

  const files = await inventorySaveFiles(destination, SHARED_ENTRIES)

  if (fingerprintFiles(files) !== fingerprintFiles(manifest.files)) {
    throw new StorageError('The shared save failed file integrity verification.')
  }

  if (!(await isFile(join(destination, 'world', 'level.dat')))) {
    throw new StorageError('The shared save does not contain a valid world.')
  }

  for (const folder of SHARED_FOLDERS) {
    await mkdir(join(destination, folder), { recursive: true })
  }

  return fingerprintFabricFiles(files)
}

async function stageSharedEntries(serverFolder: string, staging: string): Promise<SaveFile[]> {
  const filesBeforeCopy = await inventorySaveFiles(serverFolder, SHARED_ENTRIES)

  for (const folder of SHARED_FOLDERS) {
    const source = join(serverFolder, folder)
    const target = join(staging, folder)

    await mkdir(target, { recursive: true })

    if (await isDirectory(source)) {
      await cp(source, target, { recursive: true })
    }
  }

  if (await isFile(join(serverFolder, SERVER_PROPERTIES_FILE_NAME))) {
    await cp(join(serverFolder, SERVER_PROPERTIES_FILE_NAME), join(staging, SERVER_PROPERTIES_FILE_NAME))
  }

  const stagedFiles = await inventorySaveFiles(staging, SHARED_ENTRIES)
  const filesAfterCopy = await inventorySaveFiles(serverFolder, SHARED_ENTRIES)
  const stagedFingerprint = fingerprintFiles(stagedFiles)

  if (
    fingerprintFiles(filesBeforeCopy) !== stagedFingerprint ||
    fingerprintFiles(filesAfterCopy) !== stagedFingerprint
  ) {
    throw new StorageError(
      'Server files changed while preparing the save. Finish editing and retry publishing.'
    )
  }

  return stagedFiles
}

function assertSafeArchiveEntry(entry: ArchiveEntry, entryNames: Set<string>): void {
  assertPortableSavePath(entry.fileName)

  const fileType = (entry.externalFileAttributes >>> 16) & FILE_TYPE_MASK

  if (!ALLOWED_FILE_TYPES.includes(fileType)) {
    throw new StorageError('Shared save archives cannot contain links or special files.')
  }

  const normalizedName = entry.fileName.replace(/\/$/, '').toLowerCase()

  if (entryNames.has(normalizedName)) {
    throw new StorageError('The shared save contains duplicate file paths.')
  }

  entryNames.add(normalizedName)

  const rootFolder = entry.fileName.split('/')[0]
  const isSharedEntry =
    [MANIFEST_FILE_NAME, SERVER_PROPERTIES_FILE_NAME].includes(entry.fileName) ||
    SHARED_FOLDERS.some((folder) => folder === rootFolder)

  if (!isSharedEntry) {
    throw new StorageError(`Unexpected shared save entry: ${entry.fileName}`)
  }
}

function assertManifest(
  value: unknown,
  worldId: string,
  latestSave: NonNullable<LatestSave>
): asserts value is FabricSaveManifest {
  if (!isFabricSaveManifest(value)) {
    throw new StorageError('The Fabric save manifest is invalid.')
  }

  const matchesLatestSave =
    value.worldId === worldId &&
    value.minecraftVersion === latestSave.minecraftVersion &&
    value.fabric.loaderVersion === latestSave.fabric?.loaderVersion &&
    value.fabric.installerVersion === latestSave.fabric?.installerVersion

  if (!matchesLatestSave) {
    throw new StorageError('The Fabric save manifest does not match the shared world metadata.')
  }
}

function isFabricSaveManifest(value: unknown): value is FabricSaveManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'formatVersion' in value &&
    value.formatVersion === 1 &&
    'worldId' in value &&
    typeof value.worldId === 'string' &&
    'minecraftVersion' in value &&
    typeof value.minecraftVersion === 'string' &&
    'fabric' in value &&
    isFabricRuntime(value.fabric) &&
    'files' in value &&
    Array.isArray(value.files) &&
    value.files.every(isSaveFile)
  )
}

function isSaveFile(value: unknown): value is SaveFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  )
}

async function archiveFolder(source: string, destination: string): Promise<void> {
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

async function isDirectory(path: string): Promise<boolean> {
  return (await statIfExists(path))?.isDirectory() ?? false
}

async function isFile(path: string): Promise<boolean> {
  return (await statIfExists(path))?.isFile() ?? false
}

async function statIfExists(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path)
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }

    throw error
  }
}
