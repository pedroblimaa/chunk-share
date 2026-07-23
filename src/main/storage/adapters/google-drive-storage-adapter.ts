import { createReadStream, createWriteStream } from 'fs'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import type { OAuth2Client } from 'google-auth-library'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import { ensureGoogleDriveAuthSession } from '../../auth/auth-service'
import { createAuthenticatedGoogleOAuthClient } from '../../auth/google-oauth-client'
import {
  GOOGLE_DRIVE_API_BASE_URL,
  GoogleDriveErrorCode,
  type GoogleDriveFileListResponse,
  type GoogleDriveFileResponse,
  type GoogleDriveRevisionListResponse,
  type GoogleDriveRevisionResponse
} from '../../cloud-storage/google-drive.model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import {
  DEFAULT_LATEST_SAVE,
  DEFAULT_SERVER_LOCK,
  DEFAULT_STORAGE_CONTROL
} from '../core/support/storage-defaults'
import { isStorageControl } from '../core/support/storage-validation'
import { readCloudStorageSettings } from '../persistence/cloud-storage-settings-store'
import type {
  ServerLockUpdate,
  ServerSavesReplacement,
  ServerSyncStorageData,
  StorageControl,
  StorageAdapter
} from './storage-adapter.model'

const CONTROL_FILE_NAME = 'control.json'
const WORLD_FILE_NAME = 'world.zip'
const JSON_MIME_TYPE = 'application/json'
const ZIP_MIME_TYPE = 'application/zip'
const MAX_RETAINED_WORLD_REVISIONS = 2
const MUTATION_LOCK_STALE_MS = 60 * 60 * 1000

export const googleDriveStorageAdapter: StorageAdapter = {
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

export async function readGoogleDriveStorageData(folderId: string): Promise<ServerSyncStorageData> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFiles = await listFilesInFolder(oauthClient, folderId)
  const controlFile = findFileByName(storageFiles, CONTROL_FILE_NAME)
  const worldFile = findFileByName(storageFiles, WORLD_FILE_NAME)
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    controlFile,
    CONTROL_FILE_NAME,
    DEFAULT_STORAGE_CONTROL,
    isStorageControl
  )

  return {
    latestSave: control.latestSave,
    serverLock: control.serverLock,
    worldFileExists: Boolean(worldFile?.id)
  }
}

async function runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result> {
  const operationId = randomUUID()
  await acquireExclusiveMutationLock(operationId)

  try {
    return await executeMutation()
  } finally {
    await releaseExclusiveMutationLock(operationId)
  }
}

async function assertNoStorageMutationInProgress(): Promise<void> {
  const control = await readStorageControl()

  if (storageMutationIsActive(control)) {
    throw new GoogleDriveError(
      'Storage data is being moved. Try again after the switch finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }

  if (control.storageMutation) {
    await releaseExclusiveMutationLock(control.storageMutation.operationId)
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

async function readServerSyncData(): Promise<ServerSyncStorageData> {
  const storageFolderId = await getConfiguredDriveFolderId()

  return readGoogleDriveStorageData(storageFolderId)
}

async function updateServerLock(update: ServerLockUpdate): Promise<boolean> {
  return updateStorageControl((control) => {
    const serverLock = update(control.serverLock)

    if (!serverLock) {
      return control
    }

    return { ...control, serverLock }
  })
}

async function resetServerLock(): Promise<void> {
  await updateServerLock(() => DEFAULT_SERVER_LOCK)
}

async function stageServerSavesReplacement(): Promise<ServerSavesReplacement> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const [previousControl, worldFile] = await Promise.all([
    readStorageControl(),
    findFileInFolder(oauthClient, storageFolderId, WORLD_FILE_NAME)
  ])
  const worldFileId = worldFile?.id ?? null
  const previousRevisionId = worldFileId ? await getCurrentRevisionId(oauthClient, worldFileId) : null

  let isResolved = false

  const commit = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    isResolved = true
  }

  const rollback = async (): Promise<void> => {
    if (isResolved) {
      return
    }

    if (worldFileId && previousRevisionId) {
      await restoreDriveRevision(oauthClient, worldFileId, previousRevisionId)
    } else if (!worldFileId) {
      const replacementWorld = await findFileInFolder(oauthClient, storageFolderId, WORLD_FILE_NAME)

      if (replacementWorld?.id) {
        await deleteDriveFile(oauthClient, replacementWorld.id)
      }
    }

    await updateStorageControl((control) => ({
      ...control,
      latestSave: previousControl.latestSave,
      serverLock: previousControl.serverLock
    }))
    isResolved = true
  }

  return { commit, rollback }
}

async function acquireExclusiveMutationLock(operationId: string): Promise<void> {
  await updateStorageControl((control) => {
    if (storageMutationIsActive(control)) {
      throw new GoogleDriveError(
        'Storage data is already being moved. Try again after it finishes.',
        GoogleDriveErrorCode.RequestFailed
      )
    }

    return {
      ...control,
      storageMutation: {
        operationId,
        startedAt: new Date().toISOString()
      }
    }
  })

  const control = await readStorageControl()

  if (control.storageMutation?.operationId !== operationId) {
    throw new GoogleDriveError(
      'Storage data is already being moved. Try again after it finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }
}

async function releaseExclusiveMutationLock(operationId: string): Promise<void> {
  await updateStorageControl((control) =>
    control.storageMutation?.operationId === operationId ? { ...control, storageMutation: null } : control
  )
}

function storageMutationIsActive(control: StorageControl): boolean {
  if (!control.storageMutation) {
    return false
  }

  const lockAgeMs = Date.now() - Date.parse(control.storageMutation.startedAt)

  return Number.isFinite(lockAgeMs) && lockAgeMs <= MUTATION_LOCK_STALE_MS
}

async function worldFileExists(): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()

  return (await findFileInFolder(oauthClient, storageFolderId, WORLD_FILE_NAME)) !== null
}

async function uploadWorld(localZipPath: string): Promise<Error | null> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFile = await findFileInFolder(oauthClient, storageFolderId, WORLD_FILE_NAME)
  const fileId =
    existingFile?.id ?? (await createDriveFile(oauthClient, storageFolderId, WORLD_FILE_NAME, ZIP_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, createReadStream(localZipPath), ZIP_MIME_TYPE, true)

  try {
    await pruneWorldRevisions(oauthClient, fileId)
    return null
  } catch (error) {
    return error instanceof Error ? error : new Error('Unable to clean up old Google Drive revisions.')
  }
}

async function downloadWorld(localDestinationPath: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const file = await findFileInFolder(oauthClient, storageFolderId, WORLD_FILE_NAME)

  if (!file?.id) {
    throw new GoogleDriveError(
      'The shared world file was not found in Google Drive.',
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  await downloadDriveFile(oauthClient, file.id, localDestinationPath)
}

async function resetServerSaves(): Promise<void> {
  await writeLatestSave(DEFAULT_LATEST_SAVE)
}

async function readStorageControl(): Promise<StorageControl> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const file = await findFileInFolder(oauthClient, storageFolderId, CONTROL_FILE_NAME)

  return readJsonDriveFileWithClient(
    oauthClient,
    file,
    CONTROL_FILE_NAME,
    DEFAULT_STORAGE_CONTROL,
    isStorageControl
  )
}

async function updateStorageControl(update: (control: StorageControl) => StorageControl): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFolderId = await getConfiguredDriveFolderId()
  const existingFile = await findFileInFolder(oauthClient, storageFolderId, CONTROL_FILE_NAME)
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    existingFile,
    CONTROL_FILE_NAME,
    DEFAULT_STORAGE_CONTROL,
    isStorageControl
  )
  const nextControl = update(control)

  if (nextControl === control) {
    return false
  }

  if (!isStorageControl(nextControl)) {
    throw new GoogleDriveError(
      `Refusing to write invalid data shape to ${CONTROL_FILE_NAME}.`,
      GoogleDriveErrorCode.RequestFailed
    )
  }

  const fileId =
    existingFile?.id ??
    (await createDriveFile(oauthClient, storageFolderId, CONTROL_FILE_NAME, JSON_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, `${JSON.stringify(nextControl, null, 2)}\n`, JSON_MIME_TYPE)
  return true
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
  mimeType: string,
  keepRevisionForever = false
): Promise<void> {
  const searchParams = new URLSearchParams({ uploadType: 'media' })

  if (keepRevisionForever) {
    searchParams.set('keepRevisionForever', 'true')
  }

  await runGoogleDriveFileRequest(() =>
    oauthClient.request({
      data: body,
      headers: {
        'Content-Type': mimeType
      },
      method: 'PATCH',
      url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?${searchParams.toString()}`
    })
  )
}

async function downloadDriveFile(
  oauthClient: OAuth2Client,
  fileId: string,
  localDestinationPath: string,
  revisionId?: string
): Promise<void> {
  await mkdir(dirname(localDestinationPath), { recursive: true })
  const encodedFileId = encodeURIComponent(fileId)
  const resourcePath = revisionId
    ? `files/${encodedFileId}/revisions/${encodeURIComponent(revisionId)}`
    : `files/${encodedFileId}`
  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.request<Readable>({
      responseType: 'stream',
      url: `${GOOGLE_DRIVE_API_BASE_URL}/${resourcePath}?alt=media`
    })
  )

  await pipeline(response.data, createWriteStream(localDestinationPath))
}

async function restoreDriveRevision(
  oauthClient: OAuth2Client,
  fileId: string,
  revisionId: string
): Promise<void> {
  const tempFolderPath = await mkdtemp(join(tmpdir(), 'chunkshare-drive-rollback-'))
  const tempWorldPath = join(tempFolderPath, WORLD_FILE_NAME)

  try {
    await downloadDriveFile(oauthClient, fileId, tempWorldPath, revisionId)
    await uploadDriveFileMedia(oauthClient, fileId, createReadStream(tempWorldPath), ZIP_MIME_TYPE, true)
    await pruneWorldRevisions(oauthClient, fileId)
  } finally {
    await rm(tempFolderPath, { recursive: true, force: true })
  }
}

async function getCurrentRevisionId(oauthClient: OAuth2Client, fileId: string): Promise<string | null> {
  return (await listWorldRevisions(oauthClient, fileId)).at(-1)?.id ?? null
}

async function pruneWorldRevisions(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  const revisions = await listWorldRevisions(oauthClient, fileId)
  const revisionsToDelete = revisions.slice(0, -MAX_RETAINED_WORLD_REVISIONS)

  for (const revision of revisionsToDelete) {
    if (revision.id) {
      await deleteDriveRevision(oauthClient, fileId, revision.id)
    }
  }
}

async function listWorldRevisions(
  oauthClient: OAuth2Client,
  fileId: string
): Promise<GoogleDriveRevisionResponse[]> {
  const searchParams = new URLSearchParams({
    fields: 'revisions(id,keepForever,modifiedTime)',
    pageSize: '100'
  })
  const response = await runGoogleDriveFileRequest(() =>
    oauthClient.fetch<GoogleDriveRevisionListResponse>(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}/revisions?${searchParams.toString()}`
    )
  )

  return (response.data.revisions ?? []).sort(
    (left, right) => Date.parse(left.modifiedTime ?? '') - Date.parse(right.modifiedTime ?? '')
  )
}

async function deleteDriveRevision(
  oauthClient: OAuth2Client,
  fileId: string,
  revisionId: string
): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.fetch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}`,
      { method: 'DELETE' }
    )
  )
}

async function deleteDriveFile(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  await runGoogleDriveFileRequest(() =>
    oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    })
  )
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
