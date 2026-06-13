import { createWriteStream } from 'fs'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { ZipArchive } from 'archiver'
import type { LatestSave, Player } from '../../shared/domain'
import { getSignedInMockUser } from '../mock-dashboard'
import { renameWithRetry } from './file-system-utils'
import { readLatestSave, writeLatestSave } from './local-mock-cloud-storage'
import { readLocalState, saveLocalSaveVersion } from './local-state-store'
import { StorageError } from './storage-error'
import { managedServerFolderPath, mockCloudVersionsFolderPath } from './storage-paths'

const MAX_RETAINED_SAVE_VERSIONS = 3
const SERVER_SAVE_FILE_PATTERN = /^server-v(\d+)\.zip$/

export interface PublishServerSaveResult {
  latestSave: NonNullable<LatestSave>
  cleanupError: Error | null
}

interface ServerSaveVersionFile {
  fileName: string
  saveVersion: number
}

export async function publishServerSave(): Promise<PublishServerSaveResult> {
  const latestSave = await readLatestSave()
  const existingVersionFiles = await listServerSaveVersionFiles()
  const nextSaveVersion = getNextSaveVersion(latestSave, existingVersionFiles)
  const localState = await readLocalState()
  const serverFolderPath = managedServerFolderPath
  const fileName = createServerSaveFileName(nextSaveVersion)
  const zipFilePath = join(mockCloudVersionsFolderPath, fileName)

  await assertServerFolderExists(serverFolderPath)
  await zipFolder(serverFolderPath, zipFilePath)

  const nextLatestSave = {
    saveVersion: nextSaveVersion,
    fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: getUploadedBy(),
    minecraftVersion: localState.serverConfig.minecraftVersion,
    serverType: localState.serverConfig.serverType
  }

  await saveLocalSaveVersion(nextLatestSave.saveVersion)
  await writeLatestSave(nextLatestSave)
  const cleanupError = await pruneOldServerSaveVersions(nextSaveVersion)

  return { latestSave: nextLatestSave, cleanupError }
}

async function listServerSaveVersionFiles(): Promise<ServerSaveVersionFile[]> {
  try {
    await mkdir(mockCloudVersionsFolderPath, { recursive: true })
    const entries = await readdir(mockCloudVersionsFolderPath, { withFileTypes: true })

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

function getNextSaveVersion(latestSave: LatestSave, versionFiles: ServerSaveVersionFile[]): number {
  const highestFileVersion = versionFiles.reduce(
    (highestVersion, versionFile) => Math.max(highestVersion, versionFile.saveVersion),
    0
  )
  const highestKnownVersion = Math.max(latestSave?.saveVersion ?? 0, highestFileVersion)

  return highestKnownVersion + 1
}

function createServerSaveFileName(saveVersion: number): string {
  return `server-v${saveVersion.toString().padStart(3, '0')}.zip`
}

async function pruneOldServerSaveVersions(latestSaveVersion: number): Promise<Error | null> {
  try {
    const lastVersionToPrune = latestSaveVersion - MAX_RETAINED_SAVE_VERSIONS
    const versionsToDelete = (await listServerSaveVersionFiles()).filter(
      (versionFile) => versionFile.saveVersion <= lastVersionToPrune
    )

    for (const versionFile of versionsToDelete) {
      await rm(join(mockCloudVersionsFolderPath, versionFile.fileName), { force: true })
    }

    return null
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error('Unable to clean up old server save versions.')
  }
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
    await renameWithRetry(tempFilePath, destinationFilePath)
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
