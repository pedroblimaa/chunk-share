import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { dirname, join } from 'path'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { renameWithRetry } from '../core/file-system-utils'
import { DEFAULT_LATEST_SAVE, DEFAULT_SERVER_LOCK } from '../core/storage-defaults'
import { StorageError } from '../core/storage-error'
import {
  latestSaveFilePath,
  localStorageFolderPath,
  localStorageVersionsFolderPath,
  serverLockFilePath
} from '../core/storage-paths'
import { isLatestSave, isServerLock } from '../core/storage-validation'
import { readJsonFile, writeJsonFile } from '../persistence/json-file-store'
import type { ServerSaveVersionFile, ServerSyncStorageData, StorageAdapter } from './storage-adapter.model'

const SERVER_SAVE_FILE_PATTERN = /^server-v(\d+)\.zip$/

export const localStorageAdapter: StorageAdapter = {
  deleteServerSaveVersion,
  downloadServerSaveVersion,
  listServerSaveVersions,
  readLatestSave,
  readServerLock,
  readServerSyncData,
  resetServerLock,
  resetServerSaves,
  serverSaveVersionExists,
  uploadServerSaveVersion,
  writeLatestSave,
  writeServerLock
}

export async function ensureLocalStorage(): Promise<void> {
  await mkdir(localStorageFolderPath, { recursive: true })
  await mkdir(localStorageVersionsFolderPath, { recursive: true })
  await readLatestSave()
  await readServerLock()
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
  return readJsonFile(latestSaveFilePath, DEFAULT_LATEST_SAVE, isLatestSave)
}

function writeLatestSave(latestSave: LatestSave): Promise<void> {
  return writeJsonFile(latestSaveFilePath, latestSave, isLatestSave)
}

function readServerLock(): Promise<ServerLock> {
  return readJsonFile(serverLockFilePath, DEFAULT_SERVER_LOCK, isServerLock)
}

function writeServerLock(serverLock: ServerLock): Promise<void> {
  return writeJsonFile(serverLockFilePath, serverLock, isServerLock)
}

function resetServerLock(): Promise<void> {
  return writeServerLock(DEFAULT_SERVER_LOCK)
}

async function listServerSaveVersions(): Promise<ServerSaveVersionFile[]> {
  try {
    await mkdir(localStorageVersionsFolderPath, { recursive: true })
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
