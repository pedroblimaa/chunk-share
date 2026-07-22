import { createReadStream, createWriteStream } from 'fs'
import { randomUUID } from 'crypto'
import { mkdir } from 'fs/promises'
import type { OAuth2Client } from 'google-auth-library'
import { dirname } from 'path'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { ensureGoogleDriveAuthSession } from '../../auth/auth-service'
import { createAuthenticatedGoogleOAuthClient } from '../../auth/google-oauth-client'
import {
  GOOGLE_DRIVE_API_BASE_URL,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GoogleDriveErrorCode,
  type GoogleDriveFileListResponse,
  type GoogleDriveFileResponse
} from '../../cloud-storage/google-drive.model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import { DEFAULT_LATEST_SAVE, DEFAULT_SERVER_LOCK } from '../core/support/storage-defaults'
import { isLatestSave, isServerLock } from '../core/support/storage-validation'
import { readCloudStorageSettings } from '../persistence/cloud-storage-settings-store'
import type {
  ServerSaveVersionFile,
  ServerSavesReplacement,
  ServerSyncStorageData,
  StorageAdapter
} from './storage-adapter.model'

const LATEST_SAVE_FILE_NAME = 'latest.json'
const SERVER_LOCK_FILE_NAME = 'lock.json'
const VERSIONS_FOLDER_NAME = 'versions'
const VERSIONS_BACKUP_FOLDER_PREFIX = 'versions-backup-'
const MUTATION_LOCK_CONTENDER_PREFIX = 'storage-operation-lock-'
const JSON_MIME_TYPE = 'application/json'
const ZIP_MIME_TYPE = 'application/zip'
const SERVER_SAVE_FILE_PATTERN = /^server-v(\d+)\.zip$/
const MUTATION_LOCK_STALE_MS = 60 * 60 * 1000

export const googleDriveStorageAdapter: StorageAdapter = {
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

export async function readGoogleDriveStorageData(folderId: string): Promise<ServerSyncStorageData> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFiles = await listFilesInFolder(oauthClient, folderId)
  const versionsFolder = findFileByName(storageFiles, VERSIONS_FOLDER_NAME)

  const readDriveFile = <T>(
    fileName: string,
    defaultValue: T,
    validate: (value: unknown) => value is T
  ): Promise<T> =>
    readJsonDriveFileWithClient(
      oauthClient,
      findFileByName(storageFiles, fileName),
      fileName,
      defaultValue,
      validate
    )

  const resolveVersions = async (): Promise<ServerSaveVersionFile[]> => {
    if (!versionsFolder?.id) {
      return []
    }

    const fileList = await listFilesInFolder(oauthClient, versionsFolder.id)
    return toServerSaveVersionFiles(fileList)
  }

  const [latestSave, serverLock, versionFiles] = await Promise.all([
    readDriveFile(LATEST_SAVE_FILE_NAME, DEFAULT_LATEST_SAVE, isLatestSave),
    readDriveFile(SERVER_LOCK_FILE_NAME, DEFAULT_SERVER_LOCK, isServerLock),
    resolveVersions()
  ])

  return {
    latestSave,
    serverLock,
    versionFiles
  }
}

async function runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const contenderFileId = await acquireMutationLockContender(oauthClient, storageFolderId)

  try {
    return await executeMutation()
  } finally {
    await releaseMutationLockContender(oauthClient, contenderFileId)
  }
}

async function assertNoStorageMutationInProgress(): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()

  await deleteStaleMutationLockContenders(oauthClient, storageFolderId)

  const activeLockContenders = await listActiveMutationLockContenders(oauthClient, storageFolderId)

  if (activeLockContenders.length > 0) {
    throw new GoogleDriveError(
      'Storage data is being moved. Try again after the switch finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }
}

async function readLatestSave(): Promise<LatestSave> {
  return readJsonDriveFile(LATEST_SAVE_FILE_NAME, DEFAULT_LATEST_SAVE, isLatestSave)
}

async function writeLatestSave(latestSave: LatestSave): Promise<void> {
  await writeJsonDriveFile(LATEST_SAVE_FILE_NAME, latestSave)
}

async function readServerLock(): Promise<ServerLock> {
  return readJsonDriveFile(SERVER_LOCK_FILE_NAME, DEFAULT_SERVER_LOCK, isServerLock)
}

async function readServerSyncData(): Promise<ServerSyncStorageData> {
  const storageFolderId = await getConfiguredDriveFolderId()

  return readGoogleDriveStorageData(storageFolderId)
}

async function writeServerLock(serverLock: ServerLock): Promise<void> {
  await writeJsonDriveFile(SERVER_LOCK_FILE_NAME, serverLock)
}

function resetServerLock(): Promise<void> {
  return writeServerLock(DEFAULT_SERVER_LOCK)
}

async function stageServerSavesReplacement(): Promise<ServerSavesReplacement> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const [previousLatestSave, previousServerLock, versionsFolder] = await Promise.all([
    readLatestSave(),
    readServerLock(),
    findFileInFolder(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME)
  ])
  const backupFolderName = `${VERSIONS_BACKUP_FOLDER_PREFIX}${randomUUID()}`
  const backupFolderId = versionsFolder?.id

  if (backupFolderId) {
    await renameDriveFile(oauthClient, backupFolderId, backupFolderName)
  }

  let replacementFolderId: string

  try {
    replacementFolderId = await createDriveFile(
      oauthClient,
      storageFolderId,
      VERSIONS_FOLDER_NAME,
      GOOGLE_DRIVE_FOLDER_MIME_TYPE
    )
  } catch (error) {
    if (backupFolderId) {
      await renameDriveFile(oauthClient, backupFolderId, VERSIONS_FOLDER_NAME)
    }

    throw error
  }

  let isResolved = false

  const commit = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    if (backupFolderId) {
      await deleteDriveFile(oauthClient, backupFolderId)
    }

    isResolved = true
  }

  const rollback = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    await deleteDriveFile(oauthClient, replacementFolderId)

    if (backupFolderId) {
      await renameDriveFile(oauthClient, backupFolderId, VERSIONS_FOLDER_NAME)
    }

    await Promise.all([writeLatestSave(previousLatestSave), writeServerLock(previousServerLock)])
    isResolved = true
  }

  return { commit, rollback }
}

async function acquireMutationLockContender(
  oauthClient: OAuth2Client,
  storageFolderId: string
): Promise<string> {
  await deleteStaleMutationLockContenders(oauthClient, storageFolderId)

  const contenderFileName = `${MUTATION_LOCK_CONTENDER_PREFIX}${Date.now()}-${randomUUID()}.json`
  const contenderFileId = await createDriveFile(
    oauthClient,
    storageFolderId,
    contenderFileName,
    JSON_MIME_TYPE
  )

  const activeLockContenders = await listActiveMutationLockContenders(oauthClient, storageFolderId)
  const winningContender = activeLockContenders[0]

  if (winningContender?.id !== contenderFileId) {
    await releaseMutationLockContender(oauthClient, contenderFileId)
    throw new GoogleDriveError(
      'Storage data is already being moved. Try again after it finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }

  return contenderFileId
}

async function releaseMutationLockContender(
  oauthClient: OAuth2Client,
  contenderFileId: string
): Promise<void> {
  await deleteDriveFile(oauthClient, contenderFileId).catch(() => undefined)
}

async function deleteStaleMutationLockContenders(
  oauthClient: OAuth2Client,
  storageFolderId: string
): Promise<void> {
  const lockContenders = await listMutationLockContenders(oauthClient, storageFolderId)
  const staleLockContenders = lockContenders.filter((contender) => mutationLockContenderIsStale(contender))

  await Promise.all(
    staleLockContenders.map((contender) =>
      contender.id ? deleteDriveFile(oauthClient, contender.id) : Promise.resolve()
    )
  )
}

async function listActiveMutationLockContenders(
  oauthClient: OAuth2Client,
  storageFolderId: string
): Promise<GoogleDriveFileResponse[]> {
  const contenders = await listMutationLockContenders(oauthClient, storageFolderId)

  return contenders
    .filter((contender) => !mutationLockContenderIsStale(contender))
    .sort(compareMutationLockContenders)
}

async function listMutationLockContenders(
  oauthClient: OAuth2Client,
  storageFolderId: string
): Promise<GoogleDriveFileResponse[]> {
  const files = await listFilesInFolder(oauthClient, storageFolderId)

  return files.filter((file) => file.name?.startsWith(MUTATION_LOCK_CONTENDER_PREFIX))
}

function mutationLockContenderIsStale(contender: GoogleDriveFileResponse): boolean {
  if (!contender.createdTime) {
    return false
  }

  const lockAgeMs = Date.now() - new Date(contender.createdTime).getTime()

  return Number.isFinite(lockAgeMs) && lockAgeMs > MUTATION_LOCK_STALE_MS
}

function compareMutationLockContenders(
  left: GoogleDriveFileResponse,
  right: GoogleDriveFileResponse
): number {
  const createdTimeComparison = (left.createdTime ?? '').localeCompare(right.createdTime ?? '')

  if (createdTimeComparison !== 0) {
    return createdTimeComparison
  }

  return (left.name ?? '').localeCompare(right.name ?? '')
}

async function listServerSaveVersions(): Promise<ServerSaveVersionFile[]> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await findVersionsFolder(oauthClient)

  if (!versionsFolderId) {
    return []
  }

  const files = await listFilesInFolder(oauthClient, versionsFolderId)

  return toServerSaveVersionFiles(files)
}

async function serverSaveVersionExists(fileName: string): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await findVersionsFolder(oauthClient)

  return (
    versionsFolderId !== null && (await findFileInFolder(oauthClient, versionsFolderId, fileName)) !== null
  )
}

async function uploadServerSaveVersion(fileName: string, localZipPath: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await ensureVersionsFolder(oauthClient)
  const existingFile = await findFileInFolder(oauthClient, versionsFolderId, fileName)

  if (existingFile) {
    throw new GoogleDriveError(
      `Server save version ${fileName} already exists in Google Drive.`,
      GoogleDriveErrorCode.RequestFailed
    )
  }

  const fileId = await createDriveFile(oauthClient, versionsFolderId, fileName, ZIP_MIME_TYPE)

  await uploadDriveFileMedia(oauthClient, fileId, createReadStream(localZipPath), ZIP_MIME_TYPE)
}

async function downloadServerSaveVersion(fileName: string, localDestinationPath: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await findVersionsFolder(oauthClient)

  if (!versionsFolderId) {
    throw new GoogleDriveError(
      `Server save version ${fileName} was not found in Google Drive.`,
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  const file = await findFileInFolder(oauthClient, versionsFolderId, fileName)

  if (!file?.id) {
    throw new GoogleDriveError(
      `Server save version ${fileName} was not found in Google Drive.`,
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  const fileId = file.id

  await mkdir(dirname(localDestinationPath), { recursive: true })

  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.request<Readable>({
      responseType: 'stream',
      url: `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?alt=media`
    })
  )

  await pipeline(response.data, createWriteStream(localDestinationPath))
}

async function deleteServerSaveVersion(fileName: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await findVersionsFolder(oauthClient)

  if (!versionsFolderId) {
    return
  }

  const file = await findFileInFolder(oauthClient, versionsFolderId, fileName)

  if (!file?.id) {
    return
  }

  await deleteDriveFile(oauthClient, file.id)
}

async function resetServerSaves(): Promise<void> {
  const versions = await listServerSaveVersions()

  await Promise.all(versions.map((version) => deleteServerSaveVersion(version.fileName)))
  await writeLatestSave(DEFAULT_LATEST_SAVE)
}

async function readJsonDriveFile<T>(
  fileName: string,
  defaultValue: T,
  validate: (value: unknown) => value is T
): Promise<T> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const file = await findFileInFolder(oauthClient, storageFolderId, fileName)

  return readJsonDriveFileWithClient(oauthClient, file, fileName, defaultValue, validate)
}

async function readJsonDriveFileWithClient<T>(
  oauthClient: OAuth2Client,
  file: GoogleDriveFileResponse | null,
  fileName: string,
  defaultValue: T,
  validate: (value: unknown) => value is T
): Promise<T> {
  if (!file?.id) {
    return defaultValue
  }

  const fileId = file.id
  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.request<string>({
      responseType: 'text',
      url: `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?alt=media`
    })
  )
  const parsedJson: unknown = JSON.parse(response.data)

  if (!validate(parsedJson)) {
    throw new GoogleDriveError(
      `Invalid data shape in Google Drive file ${fileName}.`,
      GoogleDriveErrorCode.RequestFailed
    )
  }

  return parsedJson
}

async function writeJsonDriveFile(fileName: string, value: unknown): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFile = await findFileInFolder(oauthClient, storageFolderId, fileName)
  const fileId =
    existingFile?.id ?? (await createDriveFile(oauthClient, storageFolderId, fileName, JSON_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, `${JSON.stringify(value, null, 2)}\n`, JSON_MIME_TYPE)
}

async function ensureVersionsFolder(oauthClient: OAuth2Client): Promise<string> {
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFolder = await findFileInFolder(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME)

  return resolveVersionsFolderId(oauthClient, storageFolderId, existingFolder)
}

function resolveVersionsFolderId(
  oauthClient: OAuth2Client,
  storageFolderId: string,
  existingFolder: GoogleDriveFileResponse | null
): Promise<string> {
  if (existingFolder?.id) {
    return Promise.resolve(existingFolder.id)
  }

  return createDriveFile(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME, GOOGLE_DRIVE_FOLDER_MIME_TYPE)
}

async function findVersionsFolder(oauthClient: OAuth2Client): Promise<string | null> {
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFolder = await findFileInFolder(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME)

  return existingFolder?.id ?? null
}

async function createAuthenticatedDriveClient(): Promise<OAuth2Client> {
  const authSession = await ensureGoogleDriveAuthSession()

  return createAuthenticatedGoogleOAuthClient(authSession.tokens)
}

async function getConfiguredDriveFolderId(): Promise<string> {
  const settings = await readCloudStorageSettings()
  const folderId = settings.googleDrive.folder?.folderId

  if (!folderId) {
    throw new GoogleDriveError('Google Drive folder is not configured.', GoogleDriveErrorCode.FolderNotFound)
  }

  return folderId
}

async function findFileInFolder(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  fileName: string
): Promise<GoogleDriveFileResponse | null> {
  const files = await listFilesInFolder(oauthClient, parentFolderId, fileName)

  return files[0] ?? null
}

async function listFilesInFolder(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  fileName?: string
): Promise<GoogleDriveFileResponse[]> {
  const queryParts = [`'${escapeGoogleDriveQueryValue(parentFolderId)}' in parents`, 'trashed = false']

  if (fileName) {
    queryParts.push(`name = '${escapeGoogleDriveQueryValue(fileName)}'`)
  }

  const searchParams = new URLSearchParams({
    fields: 'files(id,name,mimeType,trashed,createdTime)',
    pageSize: fileName ? '1' : '100',
    q: queryParts.join(' and '),
    spaces: 'drive'
  })
  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.fetch<GoogleDriveFileListResponse>(
      `${GOOGLE_DRIVE_API_BASE_URL}/files?${searchParams.toString()}`
    )
  )

  if (!response.data.files?.length) {
    await assertGoogleDriveFolderIsAccessible(oauthClient, parentFolderId)
  }

  return response.data.files ?? []
}

async function assertGoogleDriveFolderIsAccessible(
  oauthClient: OAuth2Client,
  folderId: string
): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(folderId)}?fields=id`)
  )
}

async function runGoogleDriveFileRequest<Result>(request: () => Promise<Result>): Promise<Result> {
  try {
    return await request()
  } catch (error) {
    if (isGoogleDriveAccessError(error)) {
      throw new GoogleDriveError(
        'Your access to this shared world was revoked, or its Google Drive files are unavailable.',
        GoogleDriveErrorCode.PermissionDenied
      )
    }

    throw error
  }
}

function isGoogleDriveAccessError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false
  }

  const response = error.response

  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    (response.status === 403 || response.status === 404)
  )
}

async function createDriveFile(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.fetch<GoogleDriveFileResponse>(`${GOOGLE_DRIVE_API_BASE_URL}/files?fields=id,name,mimeType`, {
      body: JSON.stringify({
        mimeType,
        name: fileName,
        parents: [parentFolderId]
      }),
      headers: {
        'Content-Type': JSON_MIME_TYPE
      },
      method: 'POST'
    })
  )

  return resolveGoogleDriveFileId(response.data, fileName)
}

async function uploadDriveFileMedia(
  oauthClient: OAuth2Client,
  fileId: string,
  body: NodeJS.ReadableStream | string,
  mimeType: string
): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.request({
      data: body,
      headers: {
        'Content-Type': mimeType
      },
      method: 'PATCH',
      url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`
    })
  )
}

async function renameDriveFile(oauthClient: OAuth2Client, fileId: string, name: string): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
      body: JSON.stringify({ name }),
      headers: {
        'Content-Type': JSON_MIME_TYPE
      },
      method: 'PATCH'
    })
  )
}

async function deleteDriveFile(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    })
  )
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

function toServerSaveVersionFiles(files: GoogleDriveFileResponse[]): ServerSaveVersionFile[] {
  return files
    .map((file) => parseServerSaveVersionFile(file.name ?? ''))
    .filter((file): file is ServerSaveVersionFile => file !== null)
    .sort((a, b) => a.saveVersion - b.saveVersion)
}

function findFileByName(files: GoogleDriveFileResponse[], fileName: string): GoogleDriveFileResponse | null {
  return files.find((file) => file.name === fileName) ?? null
}

function resolveGoogleDriveFileId(file: GoogleDriveFileResponse, fileName: string): string {
  if (!file.id) {
    throw new GoogleDriveError(
      `Google Drive did not return a file ID for ${fileName}.`,
      GoogleDriveErrorCode.RequestFailed
    )
  }

  return file.id
}

function escapeGoogleDriveQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}
