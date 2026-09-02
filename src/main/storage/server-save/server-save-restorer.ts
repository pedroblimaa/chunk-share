import extractZip from 'extract-zip'
import { mkdir, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { ServerStorageSnapshot } from '../../../shared/domain'
import { renameWithRetry } from '../core/support/file-system-utils'
import { saveWorldLocalSaveVersion } from '../persistence/local-state-store'
import { StorageError } from '../core/support/storage-error'
import type { WorldOperationContext } from '../core/world-operation-context'

export async function restoreLatestServerSave(
  operationContext: WorldOperationContext,
  storageSnapshot: ServerStorageSnapshot
): Promise<void> {
  const { latestSave, localState } = storageSnapshot
  const { storageAdapter, worldId, paths } = operationContext
  const { serverFolder, serverWorldFolder, backupsFolder } = paths

  if (!latestSave) {
    throw new StorageError('Cannot restore server save because no shared save exists.')
  }

  if (localState.dirty) {
    throw new StorageError('Cannot update from cloud while the local server has unpublished changes.')
  }

  const zipFilePath = getTempZipFilePath(serverFolder, latestSave.saveVersion)
  const tempExtractFolderPath = getTempExtractFolderPath(serverFolder, latestSave.saveVersion)
  let backupFolderPath: string | null = null
  let restoredWorldWasInstalled = false

  try {
    await cleanupTemporaryRestorePaths(zipFilePath, tempExtractFolderPath)

    await storageAdapter.downloadWorld(zipFilePath)
    await assertZipFileExists(zipFilePath)
    await mkdir(tempExtractFolderPath, { recursive: true })
    await extractZip(zipFilePath, { dir: tempExtractFolderPath })
    await assertWorldSaveExists(tempExtractFolderPath)

    await mkdir(serverFolder, { recursive: true })
    if (await folderExists(serverWorldFolder)) {
      backupFolderPath = await moveCurrentWorldToBackup(
        serverWorldFolder,
        backupsFolder,
        latestSave.saveVersion
      )
    }

    await renameWithRetry(tempExtractFolderPath, serverWorldFolder)
    restoredWorldWasInstalled = true
    await saveWorldLocalSaveVersion(worldId, latestSave.saveVersion)
  } catch (error) {
    try {
      await rollbackFailedRestore(serverWorldFolder, backupFolderPath, restoredWorldWasInstalled)
    } catch (rollbackError) {
      throw new StorageError(
        `Server save restore failed: ${getErrorMessage(error)} The previous local server could not be recovered: ${getErrorMessage(rollbackError)}`
      )
    }

    throw error
  } finally {
    await cleanupTemporaryRestorePaths(zipFilePath, tempExtractFolderPath).catch(() => undefined)
  }
}

async function rollbackFailedRestore(
  worldFolderPath: string,
  backupFolderPath: string | null,
  restoredWorldWasInstalled: boolean
): Promise<void> {
  if (restoredWorldWasInstalled) {
    await rm(worldFolderPath, { recursive: true, force: true })
  }

  if (backupFolderPath && !(await folderExists(worldFolderPath))) {
    await renameWithRetry(backupFolderPath, worldFolderPath)
  }
}

async function cleanupTemporaryRestorePaths(
  zipFilePath: string,
  tempExtractFolderPath: string
): Promise<void> {
  await Promise.all([
    rm(zipFilePath, { force: true }),
    rm(tempExtractFolderPath, { recursive: true, force: true })
  ])
}

async function moveCurrentWorldToBackup(
  worldFolderPath: string,
  backupsFolderPath: string,
  saveVersion: number
): Promise<string> {
  await mkdir(backupsFolderPath, { recursive: true })
  const backupWorldName = `${basename(worldFolderPath)}-before-v${saveVersion.toString().padStart(3, '0')}-${Date.now()}`
  const backupFolderPath = join(backupsFolderPath, backupWorldName)

  await renameWithRetry(worldFolderPath, backupFolderPath)

  return backupFolderPath
}

function getTempExtractFolderPath(serverFolderPath: string, saveVersion: number): string {
  return join(
    dirname(serverFolderPath),
    `${basename(serverFolderPath)}.extract-v${saveVersion.toString().padStart(3, '0')}.${process.pid}.tmp`
  )
}

function getTempZipFilePath(serverFolderPath: string, saveVersion: number): string {
  return join(
    dirname(serverFolderPath),
    `${basename(serverFolderPath)}.download-v${saveVersion.toString().padStart(3, '0')}.${process.pid}.tmp.zip`
  )
}

async function assertZipFileExists(filePath: string): Promise<void> {
  const fileStats = await stat(filePath).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new StorageError(`Cannot restore server save because ${filePath} was not found.`)
    }

    throw error
  })

  if (!fileStats.isFile()) {
    throw new StorageError(`Cannot restore server save because ${filePath} is not a file.`)
  }
}

async function assertWorldSaveExists(folderPath: string): Promise<void> {
  const levelFileStats = await stat(join(folderPath, 'level.dat')).catch(() => {
    throw new StorageError('The shared world save does not contain level.dat.')
  })

  if (!levelFileStats.isFile()) {
    throw new StorageError('The shared world save does not contain level.dat.')
  }
}

async function folderExists(folderPath: string): Promise<boolean> {
  try {
    const fileStats = await stat(folderPath)

    return fileStats.isDirectory()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}
