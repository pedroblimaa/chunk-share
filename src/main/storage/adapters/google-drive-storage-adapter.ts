import { createReadStream } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import type { OAuth2Client } from 'google-auth-library'
import { dirname } from 'path'
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
import { DEFAULT_LATEST_SAVE, DEFAULT_SERVER_LOCK } from '../core/storage-defaults'
import { isLatestSave, isServerLock } from '../core/storage-validation'
import { readCloudStorageSettings } from '../persistence/cloud-storage-settings-store'
import type { ServerSaveVersionFile, ServerSyncStorageData, StorageAdapter } from './storage-adapter.model'

const LATEST_SAVE_FILE_NAME = 'latest.json'
const SERVER_LOCK_FILE_NAME = 'lock.json'
const VERSIONS_FOLDER_NAME = 'versions'
const JSON_MIME_TYPE = 'application/json'
const ZIP_MIME_TYPE = 'application/zip'
const SERVER_SAVE_FILE_PATTERN = /^server-v(\d+)\.zip$/

export const googleDriveStorageAdapter: StorageAdapter = {
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
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const storageFiles = await listFilesInFolder(oauthClient, storageFolderId)
  const versionsFolderId = await getOrCreateVersionsFolderId(
    oauthClient,
    storageFolderId,
    findFileByName(storageFiles, VERSIONS_FOLDER_NAME)
  )

  const [latestSave, serverLock, versionFiles] = await Promise.all([
    readJsonDriveFileWithClient(
      oauthClient,
      storageFolderId,
      findFileByName(storageFiles, LATEST_SAVE_FILE_NAME),
      LATEST_SAVE_FILE_NAME,
      DEFAULT_LATEST_SAVE,
      isLatestSave
    ),
    readJsonDriveFileWithClient(
      oauthClient,
      storageFolderId,
      findFileByName(storageFiles, SERVER_LOCK_FILE_NAME),
      SERVER_LOCK_FILE_NAME,
      DEFAULT_SERVER_LOCK,
      isServerLock
    ),
    listFilesInFolder(oauthClient, versionsFolderId).then(toServerSaveVersionFiles)
  ])

  return {
    latestSave,
    serverLock,
    versionFiles
  }
}

async function writeServerLock(serverLock: ServerLock): Promise<void> {
  await writeJsonDriveFile(SERVER_LOCK_FILE_NAME, serverLock)
}

function resetServerLock(): Promise<void> {
  return writeServerLock(DEFAULT_SERVER_LOCK)
}

async function listServerSaveVersions(): Promise<ServerSaveVersionFile[]> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await ensureVersionsFolder(oauthClient)
  const files = await listFilesInFolder(oauthClient, versionsFolderId)

  return toServerSaveVersionFiles(files)
}

async function serverSaveVersionExists(fileName: string): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await ensureVersionsFolder(oauthClient)

  return (await findFileInFolder(oauthClient, versionsFolderId, fileName)) !== null
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
  const versionsFolderId = await ensureVersionsFolder(oauthClient)
  const file = await findFileInFolder(oauthClient, versionsFolderId, fileName)

  if (!file?.id) {
    throw new GoogleDriveError(
      `Server save version ${fileName} was not found in Google Drive.`,
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  await mkdir(dirname(localDestinationPath), { recursive: true })

  const response = await oauthClient.request<ArrayBuffer>({
    responseType: 'arraybuffer',
    url: `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(file.id)}?alt=media`
  })

  await writeFile(localDestinationPath, Buffer.from(response.data))
}

async function deleteServerSaveVersion(fileName: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const versionsFolderId = await ensureVersionsFolder(oauthClient)
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

  return readJsonDriveFileWithClient(oauthClient, storageFolderId, file, fileName, defaultValue, validate)
}

async function readJsonDriveFileWithClient<T>(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  file: GoogleDriveFileResponse | null,
  fileName: string,
  defaultValue: T,
  validate: (value: unknown) => value is T
): Promise<T> {
  if (!file?.id) {
    await writeJsonDriveFileWithClient(oauthClient, parentFolderId, fileName, defaultValue, null)
    return defaultValue
  }

  const response = await oauthClient.request<string>({
    responseType: 'text',
    url: `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(file.id)}?alt=media`
  })
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

  await writeJsonDriveFileWithClient(oauthClient, storageFolderId, fileName, value, existingFile?.id ?? null)
}

async function writeJsonDriveFileWithClient(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  fileName: string,
  value: unknown,
  existingFileId: string | null
): Promise<void> {
  const fileId =
    existingFileId ?? (await createDriveFile(oauthClient, parentFolderId, fileName, JSON_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, `${JSON.stringify(value, null, 2)}\n`, JSON_MIME_TYPE)
}

async function ensureVersionsFolder(oauthClient: OAuth2Client): Promise<string> {
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFolder = await findFileInFolder(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME)

  return getOrCreateVersionsFolderId(oauthClient, storageFolderId, existingFolder)
}

function getOrCreateVersionsFolderId(
  oauthClient: OAuth2Client,
  storageFolderId: string,
  existingFolder: GoogleDriveFileResponse | null
): Promise<string> {
  if (existingFolder?.id) {
    return Promise.resolve(existingFolder.id)
  }

  return createDriveFile(oauthClient, storageFolderId, VERSIONS_FOLDER_NAME, GOOGLE_DRIVE_FOLDER_MIME_TYPE)
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
    fields: 'files(id,name,mimeType,trashed)',
    pageSize: fileName ? '1' : '100',
    q: queryParts.join(' and '),
    spaces: 'drive'
  })
  const response = await oauthClient.fetch<GoogleDriveFileListResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files?${searchParams.toString()}`
  )

  return response.data.files ?? []
}

async function createDriveFile(
  oauthClient: OAuth2Client,
  parentFolderId: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const response = await oauthClient.fetch<GoogleDriveFileResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files?fields=id,name,mimeType`,
    {
      body: JSON.stringify({
        mimeType,
        name: fileName,
        parents: [parentFolderId]
      }),
      headers: {
        'Content-Type': JSON_MIME_TYPE
      },
      method: 'POST'
    }
  )

  return assertGoogleDriveFileId(response.data, fileName)
}

async function uploadDriveFileMedia(
  oauthClient: OAuth2Client,
  fileId: string,
  body: NodeJS.ReadableStream | string,
  mimeType: string
): Promise<void> {
  await oauthClient.request({
    data: body,
    headers: {
      'Content-Type': mimeType
    },
    method: 'PATCH',
    url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`
  })
}

async function deleteDriveFile(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  await oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE'
  })
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

function assertGoogleDriveFileId(file: GoogleDriveFileResponse, fileName: string): string {
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
