import extractZip from 'extract-zip'
import { mkdir, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { ServerStorageSnapshot } from '../../../shared/domain'
import { getActiveStorageAdapter } from '../adapters/storage-adapter-service'
import { renameWithRetry } from '../core/file-system-utils'
import { saveLocalSaveVersion } from '../persistence/local-state-store'
import { StorageError } from '../core/storage-error'
import { localServerBackupsFolderPath, localServerFolderPath } from '../core/storage-paths'

export async function restoreLatestServerSave(
  storageSnapshot: ServerStorageSnapshot
): Promise<void> {
  const { latestSave, localState } = storageSnapshot

  if (!latestSave) {
    throw new StorageError('Cannot restore server save because no shared save exists.')
  }

  if (localState.dirty) {
    throw new StorageError(
      'Cannot update from cloud while the local server has unpublished changes.'
    )
  }

  const zipFilePath = getTempZipFilePath(latestSave.saveVersion)
  const tempExtractFolderPath = getTempExtractFolderPath(latestSave.saveVersion)
  let backupFolderPath: string | null = null

  const storageAdapter = await getActiveStorageAdapter()
  await storageAdapter.downloadServerSaveVersion(latestSave.fileName, zipFilePath)
  await assertZipFileExists(zipFilePath)
  await rm(tempExtractFolderPath, { recursive: true, force: true })
  await mkdir(tempExtractFolderPath, { recursive: true })

  try {
    await extractZip(zipFilePath, { dir: tempExtractFolderPath })

    if (await folderExists(localServerFolderPath)) {
      backupFolderPath = await moveCurrentServerToBackup(latestSave.saveVersion)
    }

    await renameWithRetry(tempExtractFolderPath, localServerFolderPath)
    await saveLocalSaveVersion(latestSave.saveVersion)
  } catch (error) {
    await rm(tempExtractFolderPath, { recursive: true, force: true })

    if (backupFolderPath && !(await folderExists(localServerFolderPath))) {
      await renameWithRetry(backupFolderPath, localServerFolderPath).catch(() => undefined)
    }

    throw error
  } finally {
    await rm(zipFilePath, { force: true })
  }
}

async function moveCurrentServerToBackup(saveVersion: number): Promise<string> {
  await mkdir(localServerBackupsFolderPath, { recursive: true })
  const backupServerName = `${basename(localServerFolderPath)}-before-v${saveVersion.toString().padStart(3, '0')}-${Date.now()}`
  const backupFolderPath = join(localServerBackupsFolderPath, backupServerName)

  await renameWithRetry(localServerFolderPath, backupFolderPath)

  return backupFolderPath
}

function getTempExtractFolderPath(saveVersion: number): string {
  return join(
    dirname(localServerFolderPath),
    `${basename(localServerFolderPath)}.extract-v${saveVersion.toString().padStart(3, '0')}.${process.pid}.tmp`
  )
}

function getTempZipFilePath(saveVersion: number): string {
  return join(
    dirname(localServerFolderPath),
    `${basename(localServerFolderPath)}.download-v${saveVersion.toString().padStart(3, '0')}.${process.pid}.tmp.zip`
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
