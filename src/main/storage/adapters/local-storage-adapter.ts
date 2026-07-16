import { randomUUID } from 'crypto'
import { copyFile, mkdir, open, readdir, rm, stat } from 'fs/promises'
import { dirname, join } from 'path'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { renameWithRetry } from '../core/support/file-system-utils'
import { DEFAULT_LATEST_SAVE, DEFAULT_SERVER_LOCK } from '../core/support/storage-defaults'
import { StorageError } from '../core/support/storage-error'
import {
  latestSaveFilePath,
  localStorageFolderPath,
  localStorageMutationLockFilePath,
  localStorageVersionsFolderPath,
  serverLockFilePath
} from '../core/support/storage-paths'
import { isLatestSave, isServerLock } from '../core/support/storage-validation'
import { readJsonFileOrDefault, readOrCreateJsonFile, writeJsonFile } from '../persistence/json-file-store'
import type {
  ServerSaveVersionFile,
  ServerSavesReplacement,
  ServerSyncStorageData,
  StorageAdapter
} from './storage-adapter.model'

const SERVER_SAVE_FILE_PATTERN = /^server-v(\d+)\.zip$/
const MUTATION_LOCK_STALE_MS = 60 * 60 * 1000

export const localStorageAdapter: StorageAdapter = {
  assertNoStorageMutationInProgress,
  deleteServerSaveVersion,
  downloadServerSaveVersion,
  listServerSaveVersions,
  readLatestSave,
  readServerLock,
  readServerSyncData,
  resetServerLock,
  resetServerSaves,
  runExclusiveStorageMutation,
  serverSaveVersionExists,
  stageServerSavesReplacement,
  uploadServerSaveVersion,
  writeLatestSave,
  writeServerLock
}

async function runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result> {
  await acquireExclusiveMutationLock()

  try {
    return await executeMutation()
  } finally {
    await releaseExclusiveMutationLock()
  }
}

async function assertNoStorageMutationInProgress(): Promise<void> {
  if (await activeMutationLockExists()) {
    throw new StorageError('Storage data is being moved. Try again after the switch finishes.')
  }
}

export async function ensureLocalStorage(): Promise<void> {
  await mkdir(localStorageFolderPath, { recursive: true })
  await mkdir(localStorageVersionsFolderPath, { recursive: true })
  await Promise.all([
    readOrCreateJsonFile(latestSaveFilePath, DEFAULT_LATEST_SAVE, isLatestSave),
    readOrCreateJsonFile(serverLockFilePath, DEFAULT_SERVER_LOCK, isServerLock)
  ])
}

async function readServerSyncData(): Promise<ServerSyncStorageData> {
  const [latestSave, serverLock, versionFiles] = await Promise.all([
    readLatestSave(),
    readServerLock(),
    listServerSaveVersions()
  ])

  return {
    latestSave,
    serverLock,
    versionFiles
  }
}

function readLatestSave(): Promise<LatestSave> {
  return readJsonFileOrDefault(latestSaveFilePath, DEFAULT_LATEST_SAVE, isLatestSave)
}

function writeLatestSave(latestSave: LatestSave): Promise<void> {
  return writeJsonFile(latestSaveFilePath, latestSave, isLatestSave)
}

function readServerLock(): Promise<ServerLock> {
  return readJsonFileOrDefault(serverLockFilePath, DEFAULT_SERVER_LOCK, isServerLock)
}

function writeServerLock(serverLock: ServerLock): Promise<void> {
  return writeJsonFile(serverLockFilePath, serverLock, isServerLock)
}

function resetServerLock(): Promise<void> {
  return writeServerLock(DEFAULT_SERVER_LOCK)
}

async function stageServerSavesReplacement(): Promise<ServerSavesReplacement> {
  await ensureLocalStorage()

  const [previousLatestSave, previousServerLock] = await Promise.all([readLatestSave(), readServerLock()])
  const backupFolderPath = `${localStorageVersionsFolderPath}.backup-${randomUUID()}`

  await renameWithRetry(localStorageVersionsFolderPath, backupFolderPath)

  try {
    await mkdir(localStorageVersionsFolderPath, { recursive: true })
  } catch (error) {
    await renameWithRetry(backupFolderPath, localStorageVersionsFolderPath)
    throw error
  }

  let isResolved = false

  const commit = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    await rm(backupFolderPath, { recursive: true, force: true })
    isResolved = true
  }

  const rollback = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    await rm(localStorageVersionsFolderPath, { recursive: true, force: true })
    await renameWithRetry(backupFolderPath, localStorageVersionsFolderPath)
    await Promise.all([writeLatestSave(previousLatestSave), writeServerLock(previousServerLock)])
    isResolved = true
  }

  return { commit, rollback }
}

async function acquireExclusiveMutationLock(): Promise<void> {
  await mkdir(localStorageFolderPath, { recursive: true })

  if (await activeMutationLockExists()) {
    throw new StorageError('Storage data is already being moved. Try again after it finishes.')
  }

  const lockFile = await open(localStorageMutationLockFilePath, 'wx')
  await lockFile.close()
}

async function releaseExclusiveMutationLock(): Promise<void> {
  await rm(localStorageMutationLockFilePath, { force: true })
}

async function activeMutationLockExists(): Promise<boolean> {
  try {
    const lockStats = await stat(localStorageMutationLockFilePath)
    const lockAgeMs = Date.now() - lockStats.mtimeMs

    if (lockAgeMs > MUTATION_LOCK_STALE_MS) {
      await releaseExclusiveMutationLock()
      return false
    }

    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

async function listServerSaveVersions(): Promise<ServerSaveVersionFile[]> {
  try {
    const entries = await readdir(localStorageVersionsFolderPath, { withFileTypes: true })

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => parseServerSaveVersionFile(entry.name))
      .filter((entry): entry is ServerSaveVersionFile => entry !== null)
      .sort((a, b) => a.saveVersion - b.saveVersion)
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }

    throw error
  }
}

async function serverSaveVersionExists(fileName: string): Promise<boolean> {
  try {
    const fileStats = await stat(getServerSaveVersionPath(fileName))

    return fileStats.isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

async function uploadServerSaveVersion(fileName: string, localZipPath: string): Promise<void> {
  await mkdir(localStorageVersionsFolderPath, { recursive: true })

  if (await serverSaveVersionExists(fileName)) {
    throw new StorageError(`Server save version ${fileName} already exists.`)
  }

  const destinationPath = getServerSaveVersionPath(fileName)
  const tempDestinationPath = `${destinationPath}.${process.pid}.tmp`

  await copyFile(localZipPath, tempDestinationPath)

  try {
    await renameWithRetry(tempDestinationPath, destinationPath)
  } catch (error) {
    await rm(tempDestinationPath, { force: true })
    throw error
  }
}

async function downloadServerSaveVersion(fileName: string, localDestinationPath: string): Promise<void> {
  await mkdir(dirname(localDestinationPath), { recursive: true })
  await copyFile(getServerSaveVersionPath(fileName), localDestinationPath)
}

async function deleteServerSaveVersion(fileName: string): Promise<void> {
  await rm(getServerSaveVersionPath(fileName), { force: true })
}

async function resetServerSaves(): Promise<void> {
  await ensureLocalStorage()

  const versions = await listServerSaveVersions()

  await Promise.all(versions.map((version) => deleteServerSaveVersion(version.fileName)))
  await writeLatestSave(DEFAULT_LATEST_SAVE)
}

function getServerSaveVersionPath(fileName: string): string {
  return join(localStorageVersionsFolderPath, fileName)
}

function parseServerSaveVersionFile(fileName: string): ServerSaveVersionFile | null {
  const match = fileName.match(SERVER_SAVE_FILE_PATTERN)

  if (!match) {
    return null
  }

  return {
    fileName,
    saveVersion: Number(match[1])
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
