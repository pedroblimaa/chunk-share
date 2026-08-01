import { randomUUID } from 'crypto'
import { copyFile, mkdir, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import type { WorldContext } from '../core/world-context'
import { getSelectedWorldContext } from '../core/world-context'
import { renameWithRetry } from '../core/support/file-system-utils'
import { createDefaultStorageControl, DEFAULT_SERVER_LOCK } from '../core/support/storage-defaults'
import { StorageError } from '../core/support/storage-error'
import { isRecoverableStorageControl, isStorageControl } from '../core/support/storage-validation'
import { readJsonFileOrDefault, readOrCreateJsonFile, writeJsonFile } from '../persistence/json-file-store'
import type {
  RecoverableStorageControl,
  ServerLockUpdate,
  ServerSavesReplacement,
  ServerSyncStorageData,
  StorageAdapter,
  StorageControl
} from './storage-adapter.model'

const MUTATION_LOCK_STALE_MS = 60 * 60 * 1000

export function createLocalStorageAdapter(context: WorldContext): StorageAdapter {
  const controlFilePath = context.paths.storageControlFile
  const worldFilePath = context.paths.storageWorldFile
  const defaultControl = createDefaultStorageControl(context.worldId)
  const isContextStorageControl = (value: unknown): value is StorageControl =>
    isStorageControl(value) && value.worldId === context.worldId
  const isContextRecoverableStorageControl = (value: unknown): value is RecoverableStorageControl =>
    isRecoverableStorageControl(value) && value.worldId === context.worldId

  async function ensureStorage(): Promise<void> {
    await mkdir(context.paths.storageFolder, { recursive: true })
    await readOrCreateJsonFile(controlFilePath, defaultControl, isContextStorageControl)
  }

  async function runExclusiveStorageMutation<Result>(
    executeMutation: () => Promise<Result>
  ): Promise<Result> {
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

      return serverLock ? { ...control, serverLock } : control
    })
  }

  async function resetServerLock(): Promise<void> {
    const control = await readJsonFileOrDefault(
      controlFilePath,
      defaultControl,
      isContextRecoverableStorageControl
    )

    await writeJsonFile(
      controlFilePath,
      { ...control, serverLock: DEFAULT_SERVER_LOCK },
      isContextStorageControl
    )
  }

  async function stageServerSavesReplacement(): Promise<ServerSavesReplacement> {
    await ensureStorage()

    const previousControl = await readStorageControl()
    const previousWorldExists = await worldFileExists()
    const backupFilePath = `${worldFilePath}.backup-${randomUUID()}`

    if (previousWorldExists) {
      await copyFile(worldFilePath, backupFilePath)
    }

    let isResolved = false

    return {
      async commit(): Promise<void> {
        if (isResolved) {
          return
        }

        await rm(backupFilePath, { force: true })
        isResolved = true
      },
      async rollback(): Promise<void> {
        if (isResolved) {
          return
        }

        if (previousWorldExists) {
          await renameWithRetry(backupFilePath, worldFilePath)
        } else {
          await rm(worldFilePath, { force: true })
        }

        await updateStorageControl((control) => ({
          ...control,
          latestSave: previousControl.latestSave,
          serverLock: previousControl.serverLock
        }))
        isResolved = true
      }
    }
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

  function readStorageControl(): Promise<StorageControl> {
    return readJsonFileOrDefault(controlFilePath, defaultControl, isContextStorageControl)
  }

  async function updateStorageControl(update: (control: StorageControl) => StorageControl): Promise<boolean> {
    const control = await readStorageControl()
    const nextControl = update(control)

    if (nextControl === control) {
      return false
    }

    await writeJsonFile(controlFilePath, nextControl, isContextStorageControl)
    return true
  }

  async function worldFileExists(): Promise<boolean> {
    try {
      return (await stat(worldFilePath)).isFile()
    } catch (error) {
      if (isMissingFileError(error)) {
        return false
      }

      throw error
    }
  }

  async function uploadWorld(localZipPath: string): Promise<Error | null> {
    await mkdir(dirname(worldFilePath), { recursive: true })
    const tempDestinationPath = `${worldFilePath}.${process.pid}.${randomUUID()}.tmp`

    await copyFile(localZipPath, tempDestinationPath)

    try {
      await renameWithRetry(tempDestinationPath, worldFilePath)
    } catch (error) {
      await rm(tempDestinationPath, { force: true })
      throw error
    }

    return null
  }

  async function downloadWorld(localDestinationPath: string): Promise<void> {
    await mkdir(dirname(localDestinationPath), { recursive: true })
    await copyFile(worldFilePath, localDestinationPath)
  }

  async function resetServerSaves(): Promise<void> {
    await Promise.all([rm(controlFilePath, { force: true }), rm(worldFilePath, { force: true })])
  }

  return {
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
}

export async function ensureLocalStorage(context?: WorldContext): Promise<void> {
  const resolvedContext = context ?? (await getSelectedWorldContext())
  const defaultControl = createDefaultStorageControl(resolvedContext.worldId)

  await mkdir(resolvedContext.paths.storageFolder, { recursive: true })
  await readOrCreateJsonFile(
    resolvedContext.paths.storageControlFile,
    defaultControl,
    (value): value is StorageControl => isStorageControl(value) && value.worldId === resolvedContext.worldId
  )
}

function storageMutationIsActive(control: StorageControl): boolean {
  if (!control.storageMutation) {
    return false
  }

  const lockAgeMs = Date.now() - Date.parse(control.storageMutation.startedAt)

  return Number.isFinite(lockAgeMs) && lockAgeMs <= MUTATION_LOCK_STALE_MS
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
