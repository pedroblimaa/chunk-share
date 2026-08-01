import { createReadStream, createWriteStream } from 'fs'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import type { OAuth2Client } from 'google-auth-library'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { LatestSave, ServerLock } from '../../../shared/domain'
import type {
  GoogleDriveWorldFileIds,
  GoogleDriveWorldReference,
  GoogleDriveWorldState
} from '../../../shared/cloud-storage.model'
import type { WorldContext } from '../core/world-context'
import { getSelectedWorldContext } from '../core/world-context'
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
  createDefaultStorageControl,
  DEFAULT_LATEST_SAVE,
  DEFAULT_SERVER_LOCK
} from '../core/support/storage-defaults'
import { isRecoverableStorageControl, isStorageControl } from '../core/support/storage-validation'
import type {
  RecoverableStorageControl,
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

interface DriveStorageContext {
  folder: GoogleDriveWorldState
  defaultControl: StorageControl
  worldId: string
}

export function createGoogleDriveStorageAdapter(context: WorldContext): StorageAdapter {
  const storageContext: DriveStorageContext = {
    folder: getContextDriveFolder(context),
    defaultControl: createDefaultStorageControl(context.worldId),
    worldId: context.worldId
  }

  return {
    assertNoStorageMutationInProgress: () => assertNoStorageMutationInProgress(storageContext),
    downloadWorld: (localDestinationPath) => downloadWorld(storageContext, localDestinationPath),
    readLatestSave: () => readLatestSave(storageContext),
    readServerLock: () => readServerLock(storageContext),
    readServerSyncData: () => readServerSyncData(storageContext),
    resetServerLock: () => resetServerLock(storageContext),
    resetServerSaves: () => resetServerSaves(storageContext),
    runExclusiveStorageMutation: (executeMutation) =>
      runExclusiveStorageMutation(storageContext, executeMutation),
    stageServerSavesReplacement: () => stageServerSavesReplacement(storageContext),
    uploadWorld: (localZipPath) => uploadWorld(storageContext, localZipPath),
    updateServerLock: (update) => updateServerLock(storageContext, update),
    worldFileExists: () => worldFileExists(storageContext),
    writeLatestSave: (latestSave) => writeLatestSave(storageContext, latestSave)
  }
}

export async function resolveGoogleDriveWorldFileIds(folderId: string): Promise<GoogleDriveWorldFileIds> {
  const oauthClient = await createAuthenticatedDriveClient()
  const storageFiles = await listFilesInFolder(oauthClient, folderId)
  const controlFile = findFileByName(storageFiles, CONTROL_FILE_NAME)
  const worldFile = findFileByName(storageFiles, WORLD_FILE_NAME)

  if (!controlFile?.id || !worldFile?.id) {
    throw new GoogleDriveError('Publish this world before inviting a friend.')
  }

  return {
    controlFileId: controlFile.id,
    worldFileId: worldFile.id
  }
}

export async function deleteGoogleDriveWorldFilesIfOwned(context?: WorldContext): Promise<void> {
  const resolvedContext = context ?? (await getSelectedWorldContext())
  const folder = getContextDriveFolder(resolvedContext)

  if (!folder.ownerAccountId) {
    return
  }

  const authSession = await ensureGoogleDriveAuthSession()

  if (folder.ownerAccountId !== authSession.player.id) {
    return
  }

  const oauthClient = createAuthenticatedGoogleOAuthClient(authSession.tokens)
  if (folder.worldFileIds) {
    const world = await validateSharedGoogleDriveWorld({
      folderId: folder.folderId,
      ...folder.worldFileIds
    })
    assertGoogleDriveWorldId(world.worldId, resolvedContext.worldId)

    await Promise.all(
      [folder.worldFileIds.controlFileId, folder.worldFileIds.worldFileId].map((fileId) =>
        deleteDriveFileIfExists(oauthClient, fileId)
      )
    )
    return
  }

  const [controlFile, worldFile] = await Promise.all([
    findConfiguredFile(oauthClient, folder, CONTROL_FILE_NAME),
    findConfiguredFile(oauthClient, folder, WORLD_FILE_NAME)
  ])
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    controlFile,
    CONTROL_FILE_NAME,
    undefined,
    isStorageControl
  )
  assertGoogleDriveWorldId(control.worldId, resolvedContext.worldId)
  const fileIds = [controlFile?.id, worldFile?.id].filter((fileId): fileId is string => Boolean(fileId))

  await Promise.all(fileIds.map((fileId) => deleteDriveFileIfExists(oauthClient, fileId)))
}

export async function validateSharedGoogleDriveWorld(
  reference: GoogleDriveWorldReference
): Promise<ServerSyncStorageData & { ownerAccountId: string | null; worldId: string }> {
  const authSession = await ensureGoogleDriveAuthSession()
  const oauthClient = createAuthenticatedGoogleOAuthClient(authSession.tokens)
  const world = await readValidatedSharedGoogleDriveWorld(oauthClient, reference)

  return {
    ownerAccountId: world.controlFile.ownedByMe ? authSession.player.id : null,
    worldId: world.control.worldId,
    latestSave: world.control.latestSave,
    serverLock: world.control.serverLock,
    worldFileExists: true
  }
}

async function readValidatedSharedGoogleDriveWorld(
  oauthClient: OAuth2Client,
  reference: GoogleDriveWorldReference
): Promise<{ control: StorageControl; controlFile: GoogleDriveFileResponse }> {
  const [controlFile, worldFile] = await Promise.all([
    readDriveFileMetadata(oauthClient, reference.controlFileId),
    readDriveFileMetadata(oauthClient, reference.worldFileId)
  ])

  assertSharedWorldFile(
    controlFile,
    reference.controlFileId,
    CONTROL_FILE_NAME,
    JSON_MIME_TYPE,
    reference.folderId
  )
  assertSharedWorldFile(worldFile, reference.worldFileId, WORLD_FILE_NAME, ZIP_MIME_TYPE, reference.folderId)

  const control = await readJsonDriveFileWithClient(
    oauthClient,
    controlFile,
    CONTROL_FILE_NAME,
    undefined,
    isStorageControl
  )

  return { control, controlFile }
}

async function readGoogleDriveStorageData(context: DriveStorageContext): Promise<ServerSyncStorageData> {
  const { folder } = context
  if (folder.worldFileIds) {
    const world = await validateSharedGoogleDriveWorld({
      folderId: folder.folderId,
      ...folder.worldFileIds
    })
    assertGoogleDriveWorldId(world.worldId, context.worldId)

    return {
      latestSave: world.latestSave,
      serverLock: world.serverLock,
      worldFileExists: world.worldFileExists
    }
  }

  const oauthClient = await createAuthenticatedDriveClient()
  const storageFiles = await listFilesInFolder(oauthClient, folder.folderId)
  const controlFile = findFileByName(storageFiles, CONTROL_FILE_NAME)
  const worldFile = findFileByName(storageFiles, WORLD_FILE_NAME)
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    controlFile,
    CONTROL_FILE_NAME,
    context.defaultControl,
    (value): value is StorageControl => isStorageControl(value) && value.worldId === context.worldId
  )

  return {
    latestSave: control.latestSave,
    serverLock: control.serverLock,
    worldFileExists: Boolean(worldFile?.id)
  }
}

async function runExclusiveStorageMutation<Result>(
  context: DriveStorageContext,
  executeMutation: () => Promise<Result>
): Promise<Result> {
  const operationId = randomUUID()
  await acquireExclusiveMutationLock(context, operationId)

  try {
    return await executeMutation()
  } finally {
    await releaseExclusiveMutationLock(context, operationId)
  }
}

async function assertNoStorageMutationInProgress(context: DriveStorageContext): Promise<void> {
  const control = await readStorageControl(context)

  if (storageMutationIsActive(control)) {
    throw new GoogleDriveError(
      'Storage data is being moved. Try again after the switch finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }

  if (control.storageMutation) {
    await releaseExclusiveMutationLock(context, control.storageMutation.operationId)
  }
}

async function readLatestSave(context: DriveStorageContext): Promise<LatestSave> {
  return (await readStorageControl(context)).latestSave
}

async function writeLatestSave(context: DriveStorageContext, latestSave: LatestSave): Promise<void> {
  await updateStorageControl(context, (control) => ({ ...control, latestSave }))
}

async function readServerLock(context: DriveStorageContext): Promise<ServerLock> {
  return (await readStorageControl(context)).serverLock
}

async function readServerSyncData(context: DriveStorageContext): Promise<ServerSyncStorageData> {
  return readGoogleDriveStorageData(context)
}

async function updateServerLock(context: DriveStorageContext, update: ServerLockUpdate): Promise<boolean> {
  return updateStorageControl(context, (control) => {
    const serverLock = update(control.serverLock)

    if (!serverLock) {
      return control
    }

    return { ...control, serverLock }
  })
}

async function resetServerLock(context: DriveStorageContext): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  const existingFile = await findConfiguredFile(oauthClient, folder, CONTROL_FILE_NAME)
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    existingFile,
    CONTROL_FILE_NAME,
    context.defaultControl,
    (value): value is RecoverableStorageControl =>
      isRecoverableStorageControl(value) && value.worldId === context.worldId
  )
  const fileId =
    existingFile?.id ??
    (await createDriveFile(oauthClient, folder.folderId, CONTROL_FILE_NAME, JSON_MIME_TYPE))

  await uploadDriveFileMedia(
    oauthClient,
    fileId,
    `${JSON.stringify({ ...control, serverLock: DEFAULT_SERVER_LOCK }, null, 2)}\n`,
    JSON_MIME_TYPE
  )
}

async function stageServerSavesReplacement(context: DriveStorageContext): Promise<ServerSavesReplacement> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  await assertConfiguredWorldFilesMatchContext(oauthClient, context)
  const [previousControl, worldFile] = await Promise.all([
    readStorageControl(context),
    findConfiguredFile(oauthClient, folder, WORLD_FILE_NAME)
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
      const replacementWorld = await findFileInFolder(oauthClient, folder.folderId, WORLD_FILE_NAME)

      if (replacementWorld?.id) {
        await deleteDriveFile(oauthClient, replacementWorld.id)
      }
    }

    await updateStorageControl(context, (control) => ({
      ...control,
      latestSave: previousControl.latestSave,
      serverLock: previousControl.serverLock
    }))
    isResolved = true
  }

  return { commit, rollback }
}

async function acquireExclusiveMutationLock(
  context: DriveStorageContext,
  operationId: string
): Promise<void> {
  await updateStorageControl(context, (control) => {
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

  const control = await readStorageControl(context)

  if (control.storageMutation?.operationId !== operationId) {
    throw new GoogleDriveError(
      'Storage data is already being moved. Try again after it finishes.',
      GoogleDriveErrorCode.RequestFailed
    )
  }
}

async function releaseExclusiveMutationLock(
  context: DriveStorageContext,
  operationId: string
): Promise<void> {
  await updateStorageControl(context, (control) =>
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

async function worldFileExists(context: DriveStorageContext): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context

  if (folder.worldFileIds) {
    await assertConfiguredWorldFilesMatchContext(oauthClient, context)
    return true
  }

  return (await findFileInFolder(oauthClient, folder.folderId, WORLD_FILE_NAME)) !== null
}

async function uploadWorld(context: DriveStorageContext, localZipPath: string): Promise<Error | null> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  await assertConfiguredWorldFilesMatchContext(oauthClient, context)
  const existingFile = await findConfiguredFile(oauthClient, folder, WORLD_FILE_NAME)
  const fileId =
    existingFile?.id ?? (await createDriveFile(oauthClient, folder.folderId, WORLD_FILE_NAME, ZIP_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, createReadStream(localZipPath), ZIP_MIME_TYPE, true)

  try {
    await pruneWorldRevisions(oauthClient, fileId)
    return null
  } catch (error) {
    return error instanceof Error ? error : new Error('Unable to clean up old Google Drive revisions.')
  }
}

async function downloadWorld(context: DriveStorageContext, localDestinationPath: string): Promise<void> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  await assertConfiguredWorldFilesMatchContext(oauthClient, context)
  const file = await findConfiguredFile(oauthClient, folder, WORLD_FILE_NAME)

  if (!file?.id) {
    throw new GoogleDriveError(
      'The shared world file was not found in Google Drive.',
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  await downloadDriveFile(oauthClient, file.id, localDestinationPath)
}

async function resetServerSaves(context: DriveStorageContext): Promise<void> {
  await writeLatestSave(context, DEFAULT_LATEST_SAVE)
}

async function readStorageControl(context: DriveStorageContext): Promise<StorageControl> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  const file = await findConfiguredFile(oauthClient, folder, CONTROL_FILE_NAME)

  return readJsonDriveFileWithClient(
    oauthClient,
    file,
    CONTROL_FILE_NAME,
    context.defaultControl,
    (value): value is StorageControl => isStorageControl(value) && value.worldId === context.worldId
  )
}

async function updateStorageControl(
  context: DriveStorageContext,
  update: (control: StorageControl) => StorageControl
): Promise<boolean> {
  const oauthClient = await createAuthenticatedDriveClient()
  const { folder } = context
  const existingFile = await findConfiguredFile(oauthClient, folder, CONTROL_FILE_NAME)
  const control = await readJsonDriveFileWithClient(
    oauthClient,
    existingFile,
    CONTROL_FILE_NAME,
    context.defaultControl,
    (value): value is StorageControl => isStorageControl(value) && value.worldId === context.worldId
  )
  const nextControl = update(control)

  if (nextControl === control) {
    return false
  }

  if (!isStorageControl(nextControl) || nextControl.worldId !== context.worldId) {
    throw new GoogleDriveError(
      `Refusing to write invalid data shape to ${CONTROL_FILE_NAME}.`,
      GoogleDriveErrorCode.RequestFailed
    )
  }

  const fileId =
    existingFile?.id ??
    (await createDriveFile(oauthClient, folder.folderId, CONTROL_FILE_NAME, JSON_MIME_TYPE))

  await uploadDriveFileMedia(oauthClient, fileId, `${JSON.stringify(nextControl, null, 2)}\n`, JSON_MIME_TYPE)
  return true
}

async function readJsonDriveFileWithClient<T>(
  oauthClient: OAuth2Client,
  file: GoogleDriveFileResponse | null,
  fileName: string,
  defaultValue: T | undefined,
  validate: (value: unknown) => value is T
): Promise<T> {
  if (!file?.id) {
    if (defaultValue !== undefined) {
      return defaultValue
    }

    throw new GoogleDriveError(
      `Google Drive file ${fileName} was not found.`,
      GoogleDriveErrorCode.FolderNotFound
    )
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

async function readDriveFileMetadata(
  oauthClient: OAuth2Client,
  fileId: string
): Promise<GoogleDriveFileResponse> {
  return runGoogleDriveFileRequest(() => fetchDriveFileMetadata(oauthClient, fileId))
}

async function fetchDriveFileMetadata(
  oauthClient: OAuth2Client,
  fileId: string
): Promise<GoogleDriveFileResponse> {
  const fields = 'id,name,mimeType,parents,trashed,ownedByMe,capabilities(canDownload,canEdit)'
  const response = await oauthClient.fetch<GoogleDriveFileResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`
  )

  return response.data
}

async function createAuthenticatedDriveClient(): Promise<OAuth2Client> {
  const authSession = await ensureGoogleDriveAuthSession()

  return createAuthenticatedGoogleOAuthClient(authSession.tokens)
}

function getContextDriveFolder(context: WorldContext): GoogleDriveWorldState {
  const googleDrive = context.world.googleDrive

  if (!googleDrive) {
    throw new GoogleDriveError('Google Drive folder is not configured.', GoogleDriveErrorCode.FolderNotFound)
  }

  return {
    folderId: googleDrive.folderId,
    ownerAccountId: googleDrive.ownerAccountId,
    worldFileIds: googleDrive.worldFileIds,
    configuredAt: googleDrive.configuredAt,
    validatedAt: googleDrive.validatedAt
  }
}

async function findConfiguredFile(
  oauthClient: OAuth2Client,
  folder: GoogleDriveWorldState,
  fileName: string
): Promise<GoogleDriveFileResponse | null> {
  const configuredFileId =
    fileName === CONTROL_FILE_NAME ? folder.worldFileIds?.controlFileId : folder.worldFileIds?.worldFileId

  if (configuredFileId) {
    return { id: configuredFileId, name: fileName }
  }

  return findFileInFolder(oauthClient, folder.folderId, fileName)
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
    throwGoogleDriveFileRequestError(error)
  }
}

function throwGoogleDriveFileRequestError(error: unknown): never {
  if (isGoogleDriveAccessError(error)) {
    throw new GoogleDriveError(
      'Your access to this shared world was revoked, or its Google Drive files are unavailable.',
      GoogleDriveErrorCode.PermissionDenied
    )
  }

  throw error
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
  await runGoogleDriveFileRequest(() => requestDriveFileDeletion(oauthClient, fileId))
}

async function deleteDriveFileIfExists(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  try {
    await requestDriveFileDeletion(oauthClient, fileId)
  } catch (error) {
    if (isGoogleApiResponseStatus(error, 404)) {
      return
    }

    throwGoogleDriveFileRequestError(error)
  }
}

async function requestDriveFileDeletion(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  await oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE'
  })
}

function isGoogleApiResponseStatus(error: unknown, status: number): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false
  }

  const response = error.response

  return (
    typeof response === 'object' && response !== null && 'status' in response && response.status === status
  )
}

function findFileByName(files: GoogleDriveFileResponse[], fileName: string): GoogleDriveFileResponse | null {
  return files.find((file) => file.name === fileName) ?? null
}

function assertSharedWorldFile(
  file: GoogleDriveFileResponse,
  expectedFileId: string,
  expectedName: string,
  expectedMimeType: string,
  expectedFolderId: string
): void {
  const isExpectedFile =
    file.id === expectedFileId &&
    file.name === expectedName &&
    file.mimeType === expectedMimeType &&
    !file.trashed &&
    file.parents?.includes(expectedFolderId)

  if (!isExpectedFile) {
    throw new GoogleDriveError(`The selected ${expectedName} does not match this join link.`)
  }

  if (!file.capabilities?.canDownload || !file.capabilities.canEdit) {
    throw new GoogleDriveError(`The selected ${expectedName} requires read and write access.`)
  }
}

function assertGoogleDriveWorldId(actualWorldId: string, expectedWorldId: string): void {
  if (actualWorldId !== expectedWorldId) {
    throw new GoogleDriveError(
      'The configured Google Drive files belong to a different world.',
      GoogleDriveErrorCode.RequestFailed
    )
  }
}

async function assertConfiguredWorldFilesMatchContext(
  oauthClient: OAuth2Client,
  context: DriveStorageContext
): Promise<void> {
  const worldFileIds = context.folder.worldFileIds

  if (!worldFileIds) {
    return
  }

  const world = await readValidatedSharedGoogleDriveWorld(oauthClient, {
    folderId: context.folder.folderId,
    ...worldFileIds
  })
  assertGoogleDriveWorldId(world.control.worldId, context.worldId)
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
