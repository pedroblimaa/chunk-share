import { createWriteStream } from 'fs'
import { mkdir, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { ZipArchive } from 'archiver'
import type { LatestSave, LocalState, Player } from '../../../shared/domain'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import type { ServerSaveVersionFile, StorageAdapter } from '../adapters/storage-adapter.model'
import { renameWithRetry } from '../core/file-system-utils'
import { readLocalState, saveLocalSaveVersion } from '../persistence/local-state-store'
import { StorageError } from '../core/storage-error'
import { localServerFolderPath } from '../core/storage-paths'

const MAX_RETAINED_SAVE_VERSIONS = 3

export interface PublishServerSaveResult {
  latestSave: NonNullable<LatestSave>
  cleanupError: Error | null
}

export async function publishServerSave(): Promise<PublishServerSaveResult> {
  const storageAdapter = await getActiveStorageAdapter()
  const latestSave = await storageAdapter.readLatestSave()
  const existingVersionFiles = await storageAdapter.listServerSaveVersions()
  const nextSaveVersion = getNextSaveVersion(latestSave, existingVersionFiles)
  const localState = await readLocalState()
  const serverFolderPath = localServerFolderPath
  const fileName = createServerSaveFileName(nextSaveVersion)
  const zipFilePath = getTempServerSaveZipPath(fileName)

  await assertServerFolderExists(serverFolderPath)

  try {
    await zipFolder(serverFolderPath, zipFilePath)
    await storageAdapter.uploadServerSaveVersion(fileName, zipFilePath)

    const nextLatestSave = {
      saveVersion: nextSaveVersion,
      fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: getUploadedBy(localState),
      minecraftVersion: localState.serverConfig.minecraftVersion,
      serverType: localState.serverConfig.serverType
    }

    await saveLocalSaveVersion(nextLatestSave.saveVersion)
    await storageAdapter.writeLatestSave(nextLatestSave)
    const cleanupError = await pruneOldServerSaveVersions(storageAdapter, nextSaveVersion)

    return { latestSave: nextLatestSave, cleanupError }
  } finally {
    await rm(zipFilePath, { force: true })
  }
}

function getNextSaveVersion(latestSave: LatestSave, versionFiles: ServerSaveVersionFile[]): number {
  const highestFileVersion = versionFiles.reduce(
    (highestVersion, versionFile) => Math.max(highestVersion, versionFile.saveVersion),
    0
  )
  const highestKnownVersion = Math.max(latestSave?.saveVersion ?? 0, highestFileVersion)

  return highestKnownVersion + 1
}

function createServerSaveFileName(saveVersion: number): string {
  return `server-v${saveVersion.toString().padStart(3, '0')}.zip`
}

async function pruneOldServerSaveVersions(
  storageAdapter: StorageAdapter,
  latestSaveVersion: number
): Promise<Error | null> {
  try {
    const lastVersionToPrune = latestSaveVersion - MAX_RETAINED_SAVE_VERSIONS
    const versionsToDelete = (await storageAdapter.listServerSaveVersions()).filter(
      (versionFile) => versionFile.saveVersion <= lastVersionToPrune
    )

    for (const versionFile of versionsToDelete) {
      await storageAdapter.deleteServerSaveVersion(versionFile.fileName)
    }

    return null
  } catch (error) {
    return error instanceof Error ? error : new Error('Unable to clean up old server save versions.')
  }
}

async function assertServerFolderExists(serverFolderPath: string): Promise<void> {
  try {
    const serverFolderStats = await stat(serverFolderPath)

    if (serverFolderStats.isDirectory()) {
      return
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }

  throw new StorageError(`Cannot publish save because the server folder was not found.`)
}

async function zipFolder(sourceFolderPath: string, destinationFilePath: string): Promise<void> {
  await mkdir(dirname(destinationFilePath), { recursive: true })

  const tempFilePath = `${destinationFilePath}.${process.pid}.tmp`
  const zipFile = new ZipArchive({ zlib: { level: 6 } })
  const outputStream = createWriteStream(tempFilePath)

  const zipFinished = new Promise<void>((resolve, reject) => {
    outputStream.on('close', resolve)
    outputStream.on('error', reject)
    zipFile.on('error', reject)
    zipFile.on('warning', reject)
  })

  zipFile.pipe(outputStream)
  zipFile.directory(sourceFolderPath, false)

  try {
    await zipFile.finalize()
    await zipFinished
    await renameWithRetry(tempFilePath, destinationFilePath)
  } catch (error) {
    await rm(tempFilePath, { force: true })
    throw error
  }
}

function getTempServerSaveZipPath(fileName: string): string {
  return join(
    dirname(localServerFolderPath),
    `${basename(fileName, '.zip')}.${process.pid}.${Date.now()}.tmp.zip`
  )
}

function getUploadedBy(localState: LocalState): Player {
  if (!localState.player) {
    throw new StorageError('Cannot publish save because no Google user is signed in.')
  }

  return localState.player
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
