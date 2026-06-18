import { mkdir, rename, stat } from 'fs/promises'
import { join } from 'path'
import {
  ServerLockStatus,
  type ServerConfig,
  type ServerStorageSnapshot
} from '../../shared/domain'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { resetServerLock as resetLocalMockServerLock } from './local-mock-cloud-storage'
import { resetConfiguredServer, saveServerConfig } from './local-state-store'
import { StorageError } from './storage-error'
import { localServerBackupsFolderPath, localServerFolderPath } from './storage-paths'

export async function getStorageSnapshot(): Promise<ServerStorageSnapshot> {
  return getServerSyncSnapshot()
}

export async function updateServerConfig(
  serverConfig: ServerConfig
): Promise<ServerStorageSnapshot> {
  await saveServerConfig(serverConfig)

  return getStorageSnapshot()
}

export async function resetServerLock(): Promise<ServerStorageSnapshot> {
  await resetLocalMockServerLock()

  return getStorageSnapshot()
}

export async function deleteConfiguredServer(): Promise<ServerStorageSnapshot> {
  const storageSnapshot = await getStorageSnapshot()
  const { localState, serverLock } = storageSnapshot

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot delete this server while ${serverLock.lockedBy.displayName} is hosting it.`
    )
  }

  const serverFolderPath = localState.serverConfig.serverFolderPath ?? localServerFolderPath

  await backupServerFolder(serverFolderPath, localState.serverConfig.name)
  await resetConfiguredServer()

  return getStorageSnapshot()
}

async function backupServerFolder(serverFolderPath: string, serverName: string): Promise<void> {
  if (!(await folderExists(serverFolderPath))) {
    return
  }

  await mkdir(localServerBackupsFolderPath, { recursive: true })

  const backupFolderPath = join(
    localServerBackupsFolderPath,
    `${createBackupNameSlug(serverName)}-${createBackupTimestamp()}`
  )

  await rename(serverFolderPath, backupFolderPath)
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

function createBackupTimestamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function createBackupNameSlug(serverName: string): string {
  return serverName.trim().toLowerCase().replaceAll(/\s+/g, '-') || 'server'
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
