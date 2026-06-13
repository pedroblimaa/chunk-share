import { createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { join } from 'path'
import { ZipArchive } from 'archiver'
import type { LatestSave, Player } from '../../shared/domain'
import { getSignedInMockUser } from '../mock-dashboard'
import { readLatestSave, writeLatestSave } from './local-mock-cloud-storage'
import { readLocalState, saveLocalSaveVersion } from './local-state-store'
import { StorageError } from './storage-error'
import { managedServerFolderPath, mockCloudVersionsFolderPath } from './storage-paths'

const INITIAL_SAVE_VERSION = 1

export async function publishInitialServerSave(): Promise<LatestSave> {
  const latestSave = await readLatestSave()

  if (latestSave) {
    return latestSave
  }

  const localState = await readLocalState()
  const serverFolderPath = managedServerFolderPath
  const fileName = createServerSaveFileName(INITIAL_SAVE_VERSION)
  const zipFilePath = join(mockCloudVersionsFolderPath, fileName)

  await assertServerFolderExists(serverFolderPath)
  await zipFolder(serverFolderPath, zipFilePath)

  const nextLatestSave = {
    saveVersion: INITIAL_SAVE_VERSION,
    fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: getUploadedBy(),
    minecraftVersion: localState.serverConfig.minecraftVersion,
    serverType: localState.serverConfig.serverType
  }

  await writeLatestSave(nextLatestSave)
  await saveLocalSaveVersion(nextLatestSave.saveVersion)

  return nextLatestSave
}

function createServerSaveFileName(saveVersion: number): string {
  return `server-v${saveVersion.toString().padStart(3, '0')}.zip`
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
  await mkdir(mockCloudVersionsFolderPath, { recursive: true })

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
    await rename(tempFilePath, destinationFilePath)
  } catch (error) {
    await rm(tempFilePath, { force: true })
    throw error
  }
}

function getUploadedBy(): Player {
  const signedInUser = getSignedInMockUser()

  return {
    id: signedInUser?.id ?? 'local-user',
    displayName: signedInUser?.name ?? 'Local host',
    email: signedInUser?.email ?? 'local@example.com',
    avatarInitials: signedInUser?.avatarInitials ?? 'LH'
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
