import type { OAuth2Client } from 'google-auth-library'
import type { GoogleDriveFolderConfig } from '../../shared/cloud-storage.model'
import { ensureGoogleDriveAuthSession } from '../auth/auth-service'
import { createAuthenticatedGoogleOAuthClient } from '../auth/google-oauth-client'
import { GoogleDriveError } from './google-drive-error'
import {
  DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
  GOOGLE_DRIVE_API_BASE_URL,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  GOOGLE_DRIVE_TEMP_FOLDER_PREFIX,
  GoogleDriveErrorCode,
  type GoogleDriveCreateFolderInput,
  type GoogleDriveFileListResponse,
  type GoogleDriveFileResponse
} from './google-drive.model'

export async function createOrReuseDefaultGoogleDriveFolder(): Promise<GoogleDriveFolderConfig> {
  const oauthClient = await createAuthenticatedDriveClient()
  const existingFolder = await findGoogleDriveFolderByName(
    oauthClient,
    DEFAULT_GOOGLE_DRIVE_FOLDER_NAME
  )

  if (existingFolder?.id) {
    return validateGoogleDriveFolderAccess(existingFolder.id)
  }

  const folder = await createGoogleDriveFolder(oauthClient, {
    name: DEFAULT_GOOGLE_DRIVE_FOLDER_NAME
  })

  return validateGoogleDriveFolderAccess(assertGoogleDriveFileId(folder))
}

export async function validateGoogleDriveFolderAccess(
  folderId: string
): Promise<GoogleDriveFolderConfig> {
  const oauthClient = await createAuthenticatedDriveClient()
  const folder = await readGoogleDriveFolder(oauthClient, folderId)

  assertUsableGoogleDriveFolder(folder)
  await validateGoogleDriveFolderWriteAccess(oauthClient, folderId)

  const now = new Date().toISOString()

  return {
    folderId: assertGoogleDriveFileId(folder),
    folderName: folder.name ?? DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
    configuredAt: now,
    validatedAt: now
  }
}

async function createAuthenticatedDriveClient(): Promise<OAuth2Client> {
  const authSession = await ensureGoogleDriveAuthSession()

  return createAuthenticatedGoogleOAuthClient(authSession.tokens)
}

async function findGoogleDriveFolderByName(
  oauthClient: OAuth2Client,
  folderName: string
): Promise<GoogleDriveFileResponse | null> {
  const query = [
    `name = '${escapeGoogleDriveQueryValue(folderName)}'`,
    `mimeType = '${GOOGLE_DRIVE_FOLDER_MIME_TYPE}'`,
    'trashed = false'
  ].join(' and ')
  const searchParams = new URLSearchParams({
    fields: 'files(id,name,mimeType,trashed,capabilities(canAddChildren,canEdit))',
    pageSize: '1',
    q: query,
    spaces: 'drive'
  })
  const response = await oauthClient.fetch<GoogleDriveFileListResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files?${searchParams.toString()}`
  )

  return response.data.files?.[0] ?? null
}

async function readGoogleDriveFolder(
  oauthClient: OAuth2Client,
  folderId: string
): Promise<GoogleDriveFileResponse> {
  try {
    const searchParams = new URLSearchParams({
      fields: 'id,name,mimeType,trashed,capabilities(canAddChildren,canEdit)'
    })
    const response = await oauthClient.fetch<GoogleDriveFileResponse>(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(folderId)}?${searchParams.toString()}`
    )

    return response.data
  } catch (error) {
    throw createGoogleDriveRequestError(
      error,
      'Unable to read this Google Drive folder.',
      GoogleDriveErrorCode.FolderNotFound
    )
  }
}

async function createGoogleDriveFolder(
  oauthClient: OAuth2Client,
  input: GoogleDriveCreateFolderInput
): Promise<GoogleDriveFileResponse> {
  const response = await oauthClient.fetch<GoogleDriveFileResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files?fields=id,name,mimeType`,
    {
      body: JSON.stringify({
        mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
        name: input.name,
        parents: input.parentFolderId ? [input.parentFolderId] : undefined
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    }
  )

  return response.data
}

async function validateGoogleDriveFolderWriteAccess(
  oauthClient: OAuth2Client,
  parentFolderId: string
): Promise<void> {
  const temporaryFolder = await createGoogleDriveFolder(oauthClient, {
    name: `${GOOGLE_DRIVE_TEMP_FOLDER_PREFIX} ${Date.now()}`,
    parentFolderId
  })

  await deleteGoogleDriveFile(oauthClient, assertGoogleDriveFileId(temporaryFolder))
}

async function deleteGoogleDriveFile(oauthClient: OAuth2Client, fileId: string): Promise<void> {
  await oauthClient.fetch(`${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE'
  })
}

function assertUsableGoogleDriveFolder(folder: GoogleDriveFileResponse): void {
  if (folder.trashed) {
    throw new GoogleDriveError(
      'This Google Drive folder is in the trash.',
      GoogleDriveErrorCode.FolderNotFound
    )
  }

  if (folder.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new GoogleDriveError(
      'The selected Google Drive item is not a folder.',
      GoogleDriveErrorCode.NotAFolder
    )
  }

  if (!folder.capabilities?.canAddChildren || !folder.capabilities?.canEdit) {
    throw new GoogleDriveError(
      'ChunkShare does not have permission to write to this Google Drive folder.',
      GoogleDriveErrorCode.PermissionDenied
    )
  }
}

function assertGoogleDriveFileId(file: GoogleDriveFileResponse): string {
  if (!file.id) {
    throw new GoogleDriveError(
      'Google Drive did not return a folder ID.',
      GoogleDriveErrorCode.RequestFailed
    )
  }

  return file.id
}

function escapeGoogleDriveQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function createGoogleDriveRequestError(
  error: unknown,
  fallbackMessage: string,
  errorCode: GoogleDriveErrorCode
): GoogleDriveError {
  if (error instanceof GoogleDriveError) {
    return error
  }

  if (isGoogleApiPermissionError(error)) {
    return new GoogleDriveError(
      'ChunkShare does not have permission to use this Google Drive folder.',
      GoogleDriveErrorCode.PermissionDenied
    )
  }

  return new GoogleDriveError(fallbackMessage, errorCode)
}

function isGoogleApiPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /\b(401|403|permission|forbidden|unauthorized)\b/i.test(error.message)
}
