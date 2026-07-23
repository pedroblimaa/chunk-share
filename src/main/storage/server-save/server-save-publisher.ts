import { createWriteStream } from 'fs'
import { mkdir, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { ZipArchive } from 'archiver'
import type { LatestSave, LocalState, Player } from '../../../shared/domain'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import { renameWithRetry } from '../core/support/file-system-utils'
import { readLocalState, saveLocalSaveVersion } from '../persistence/local-state-store'
import { StorageError } from '../core/support/storage-error'
import { localServerFolderPath } from '../core/support/storage-paths'

const WORLD_FILE_NAME = 'world.zip'

export interface PublishServerSaveResult {
  latestSave: NonNullable<LatestSave>
  cleanupError: Error | null
}

export async function publishServerSave(): Promise<PublishServerSaveResult> {
  const storageAdapter = await getActiveStorageAdapter()
  const latestSave = await storageAdapter.readLatestSave()
  const nextSaveVersion = (latestSave?.saveVersion ?? 0) + 1
  const localState = await readLocalState()
  const serverFolderPath = localServerFolderPath
  const zipFilePath = getTempServerSaveZipPath()

  await assertServerFolderExists(serverFolderPath)

  try {
    await zipFolder(serverFolderPath, zipFilePath)
    const result = await publishWorldUpdate(storageAdapter, zipFilePath, nextSaveVersion, localState)

    return result
  } finally {
    await rm(zipFilePath, { force: true })
  }
}

async function publishWorldUpdate(
  storageAdapter: StorageAdapter,
  zipFilePath: string,
  nextSaveVersion: number,
  localState: LocalState
): Promise<PublishServerSaveResult> {
  const nextLatestSave = {
    saveVersion: nextSaveVersion,
    uploadedAt: new Date().toISOString(),
    uploadedBy: getUploadedBy(localState),
    serverName: localState.serverConfig.name,
    minecraftVersion: localState.serverConfig.minecraftVersion,
    serverType: localState.serverConfig.serverType
  }
  const replacement = await storageAdapter.stageServerSavesReplacement()
  let cleanupError: Error | null

  try {
    cleanupError = await storageAdapter.uploadWorld(zipFilePath)
    await storageAdapter.writeLatestSave(nextLatestSave)
    await saveLocalSaveVersion(nextLatestSave.saveVersion)
  } catch (error) {
    await replacement.rollback()
    throw error
  }

  try {
    await replacement.commit()
  } catch (error) {
    cleanupError ??= toError(error, 'Unable to clean up the previous server save.')
  }

  return { latestSave: nextLatestSave, cleanupError }
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

function getTempServerSaveZipPath(): string {
  return join(
    dirname(localServerFolderPath),
    `${basename(WORLD_FILE_NAME, '.zip')}.${process.pid}.${Date.now()}.tmp.zip`
  )
}

function getUploadedBy(localState: LocalState): Player {
  if (!localState.player) {
    throw new StorageError('Cannot publish save because no Google user is signed in.')
  }

  return localState.player
}

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage)
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
