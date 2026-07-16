import { mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { renameWithRetry } from '../core/support/file-system-utils'
import { localServerBackupsFolderPath } from '../core/support/storage-paths'

export async function backupServerFolder(serverFolderPath: string, serverName: string): Promise<void> {
  if (!(await folderExists(serverFolderPath))) {
    return
  }

  await mkdir(localServerBackupsFolderPath, { recursive: true })

  await renameWithRetry(
    serverFolderPath,
    join(localServerBackupsFolderPath, `${createBackupNameSlug(serverName)}-${createBackupTimestamp()}`)
  )
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
