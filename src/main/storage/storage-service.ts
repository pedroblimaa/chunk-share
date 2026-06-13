import { mkdir, rename, stat } from 'fs/promises'
import { join } from 'path'
import type { ServerConfig, StorageSnapshot } from '../../shared/domain'
import { readLocalMockCloudSnapshot } from './local-mock-cloud-storage'
import {
  readLocalState,
  readLocalStateSnapshot,
  resetConfiguredServer,
  saveServerConfig
} from './local-state-store'
import { managedServerBackupsFolderPath, managedServerFolderPath } from './storage-paths'

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const [mockCloudSnapshot, localStateSnapshot] = await Promise.all([
    readLocalMockCloudSnapshot(),
    readLocalStateSnapshot()
  ])

  return {
    latestSave: mockCloudSnapshot.latestSave,
    serverLock: mockCloudSnapshot.serverLock,
    localState: localStateSnapshot.localState
  }
}

export async function updateServerConfig(serverConfig: ServerConfig): Promise<StorageSnapshot> {
  await saveServerConfig(serverConfig)

  return getStorageSnapshot()
}

export async function deleteConfiguredServer(): Promise<StorageSnapshot> {
  const localState = await readLocalState()
  const serverFolderPath = localState.serverConfig.serverFolderPath ?? managedServerFolderPath

  await backupServerFolder(serverFolderPath, localState.serverConfig.name)
  await resetConfiguredServer()

  return getStorageSnapshot()
}

async function backupServerFolder(serverFolderPath: string, serverName: string): Promise<void> {
  if (!(await folderExists(serverFolderPath))) {
    return
  }

  await mkdir(managedServerBackupsFolderPath, { recursive: true })

  const backupFolderPath = join(
    managedServerBackupsFolderPath,
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
