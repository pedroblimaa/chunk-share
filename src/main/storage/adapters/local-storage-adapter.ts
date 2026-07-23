import { randomUUID } from 'crypto'
import { copyFile, mkdir, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { renameWithRetry } from '../core/support/file-system-utils'
import {
  DEFAULT_LATEST_SAVE,
  DEFAULT_SERVER_LOCK,
  DEFAULT_STORAGE_CONTROL
} from '../core/support/storage-defaults'
import { StorageError } from '../core/support/storage-error'
import {
  localStorageFolderPath,
  localStorageWorldFilePath,
  storageControlFilePath
} from '../core/support/storage-paths'
import { isStorageControl } from '../core/support/storage-validation'
import { readJsonFileOrDefault, readOrCreateJsonFile, writeJsonFile } from '../persistence/json-file-store'
import type {
  ServerLockUpdate,
  ServerSavesReplacement,
  ServerSyncStorageData,
  StorageControl,
  StorageAdapter
} from './storage-adapter.model'

const MUTATION_LOCK_STALE_MS = 60 * 60 * 1000

export const localStorageAdapter: StorageAdapter = {
  assertNoStorageMutationInProgress,
  downloadWorld,
  readLatestSave,
  readServerLock,
  readServerSyncData,
  resetServerLock,
  resetServerSaves,
  runExclusiveStorageMutation,
  stageServerSavesReplacement,
  uploadWorld,
  updateServerLock,
  worldFileExists,
  writeLatestSave
}

async function runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result> {
  const operationId = randomUUID()
  await acquireExclusiveMutationLock(operationId)

  try {
    return await executeMutation()
  } finally {
    await releaseExclusiveMutationLock(operationId)
  }
}

async function assertNoStorageMutationInProgress(): Promise<void> {
  if (await activeMutationLockExists()) {
    throw new StorageError('Storage data is being moved. Try again after the switch finishes.')
  }
}

export async function ensureLocalStorage(): Promise<void> {
  await mkdir(localStorageFolderPath, { recursive: true })
  await readOrCreateJsonFile(storageControlFilePath, DEFAULT_STORAGE_CONTROL, isStorageControl)
}

async function readServerSyncData(): Promise<ServerSyncStorageData> {
  const [control, hasWorldFile] = await Promise.all([readStorageControl(), worldFileExists()])

  return {
    latestSave: control.latestSave,
    serverLock: control.serverLock,
    worldFileExists: hasWorldFile
  }
}

async function readLatestSave(): Promise<LatestSave> {
  return (await readStorageControl()).latestSave
}

async function writeLatestSave(latestSave: LatestSave): Promise<void> {
  await updateStorageControl((control) => ({ ...control, latestSave }))
}

async function readServerLock(): Promise<ServerLock> {
  return (await readStorageControl()).serverLock
}

async function updateServerLock(update: ServerLockUpdate): Promise<boolean> {
  return updateStorageControl((control) => {
    const serverLock = update(control.serverLock)

    if (!serverLock) {
      return control
    }

    return { ...control, serverLock }
  })
}

async function resetServerLock(): Promise<void> {
  await updateServerLock(() => DEFAULT_SERVER_LOCK)
}

async function stageServerSavesReplacement(): Promise<ServerSavesReplacement> {
  await ensureLocalStorage()

  const previousControl = await readStorageControl()
  const previousWorldExists = await worldFileExists()
  const backupFilePath = `${localStorageWorldFilePath}.backup-${randomUUID()}`

  if (previousWorldExists) {
    await copyFile(localStorageWorldFilePath, backupFilePath)
  }

  let isResolved = false

  const commit = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    await rm(backupFilePath, { force: true })
    isResolved = true
  }

  const rollback = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    if (previousWorldExists) {
      await renameWithRetry(backupFilePath, localStorageWorldFilePath)
    } else {
      await rm(localStorageWorldFilePath, { force: true })
    }
    await updateStorageControl((control) => ({
      ...control,
      latestSave: previousControl.latestSave,
      serverLock: previousControl.serverLock
    }))
    isResolved = true
  }

  return { commit, rollback }
}

async function acquireExclusiveMutationLock(operationId: string): Promise<void> {
  await updateStorageControl((control) => {
    if (storageMutationIsActive(control)) {
      throw new StorageError('Storage data is already being moved. Try again after it finishes.')
    }

    return {
      ...control,
      storageMutation: {
        operationId,
        startedAt: new Date().toISOString()
      }
    }
  })
}

async function releaseExclusiveMutationLock(operationId: string): Promise<void> {
  await updateStorageControl((control) =>
    control.storageMutation?.operationId === operationId ? { ...control, storageMutation: null } : control
  )
}

async function activeMutationLockExists(): Promise<boolean> {
  const control = await readStorageControl()

  if (!storageMutationIsActive(control) && control.storageMutation) {
    await releaseExclusiveMutationLock(control.storageMutation.operationId)
    return false
  }

  return control.storageMutation !== null
}

function storageMutationIsActive(control: StorageControl): boolean {
  if (!control.storageMutation) {
    return false
  }

  const lockAgeMs = Date.now() - Date.parse(control.storageMutation.startedAt)

  return Number.isFinite(lockAgeMs) && lockAgeMs <= MUTATION_LOCK_STALE_MS
}

function readStorageControl(): Promise<StorageControl> {
  return readJsonFileOrDefault(storageControlFilePath, DEFAULT_STORAGE_CONTROL, isStorageControl)
}

async function updateStorageControl(update: (control: StorageControl) => StorageControl): Promise<boolean> {
  const control = await readStorageControl()
  const nextControl = update(control)

  if (nextControl === control) {
    return false
  }

  await writeJsonFile(storageControlFilePath, nextControl, isStorageControl)
  return true
}

async function worldFileExists(): Promise<boolean> {
  try {
    const fileStats = await stat(localStorageWorldFilePath)

    return fileStats.isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

async function uploadWorld(localZipPath: string): Promise<Error | null> {
  await mkdir(dirname(localStorageWorldFilePath), { recursive: true })
  const tempDestinationPath = `${localStorageWorldFilePath}.${process.pid}.${randomUUID()}.tmp`

  await copyFile(localZipPath, tempDestinationPath)

  try {
    await renameWithRetry(tempDestinationPath, localStorageWorldFilePath)
  } catch (error) {
    await rm(tempDestinationPath, { force: true })
    throw error
  }

  return null
}

async function downloadWorld(localDestinationPath: string): Promise<void> {
  await mkdir(dirname(localDestinationPath), { recursive: true })
  await copyFile(localStorageWorldFilePath, localDestinationPath)
}

async function resetServerSaves(): Promise<void> {
  await ensureLocalStorage()

  await writeLatestSave(DEFAULT_LATEST_SAVE)
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
