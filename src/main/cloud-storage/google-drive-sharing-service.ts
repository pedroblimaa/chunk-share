import type { OAuth2Client } from 'google-auth-library'
import { CloudStorageProvider, type GoogleDriveFolderConfig } from '../../shared/cloud-storage.model'
import type {
  GoogleDriveMember,
  GoogleDriveMemberRole,
  GoogleDriveInviteResult,
  GoogleDriveRevokeResult,
  GoogleDriveSharingAvailability,
  GoogleDriveSharingState
} from '../../shared/drive-sharing.model'
import { ServerLockStatus } from '../../shared/domain'
import { ensureGoogleDriveAuthSession } from '../auth/auth-service'
import { createAuthenticatedGoogleOAuthClient } from '../auth/google-oauth-client'
import { getStorageAdapterForProvider } from '../storage/adapters/storage-adapter-service'
import { hasValidGoogleDriveFolder } from '../storage/core/support/storage-validation'
import { readCloudStorageSettings } from '../storage/persistence/cloud-storage-settings-store'
import { GoogleDriveError } from './google-drive-error'
import { GOOGLE_DRIVE_API_BASE_URL, type GoogleDriveFileResponse } from './google-drive.model'

interface DrivePermission {
  deleted?: boolean
  displayName?: string
  emailAddress?: string
  id?: string
  role?: string
  type?: string
}

interface DrivePermissionList {
  permissions?: DrivePermission[]
}

interface OwnerFolderContext {
  folderId: string
  folderName: string
  oauthClient: OAuth2Client
  ownerEmail: string
}

export async function getGoogleDriveSharingAvailability(): Promise<GoogleDriveSharingAvailability> {
  const folder = await readActiveGoogleDriveFolder()

  if (!folder) {
    return { isGoogleDriveActive: false, sharingState: null }
  }

  const context = await getOwnerFolderContext(folder)

  return {
    isGoogleDriveActive: true,
    sharingState: context ? await buildSharingState(context) : null
  }
}

export async function inviteGoogleDriveMember(email: string): Promise<GoogleDriveInviteResult> {
  const context = await requireOwnerFolderContext()
  if (email === context.ownerEmail.toLowerCase()) {
    throw new GoogleDriveError('The folder owner already has access to this world.')
  }

  await disableWriterSharing(context)

  const permissions = await listPermissions(context)
  const existingPermission = permissions.find(
    (permission) => permission.type === 'user' && permission.emailAddress?.toLowerCase() === email
  )

  if (!existingPermission) {
    await createWriterPermission(context, email)
  } else if (existingPermission.id && existingPermission.role !== 'writer') {
    await updatePermissionToWriter(context, existingPermission.id)
  }

  return {
    joinLink: `chunkshare://join?v=1&folderId=${encodeURIComponent(context.folderId)}`,
    sharingState: await buildSharingState(context)
  }
}

export async function revokeGoogleDriveMember(permissionId: string): Promise<GoogleDriveRevokeResult> {
  const context = await requireOwnerFolderContext()
  const member = (await listPermissions(context))
    .map(toMember)
    .find((candidate) => candidate?.permissionId === permissionId)

  if (!member) {
    throw new GoogleDriveError('This member no longer has access to the world folder.')
  }

  try {
    await context.oauthClient.fetch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(context.folderId)}/permissions/${encodeURIComponent(permissionId)}`,
      { method: 'DELETE' }
    )
  } catch {
    throw new GoogleDriveError('Unable to revoke access for this member.')
  }

  const storageAdapter = await getStorageAdapterForProvider(CloudStorageProvider.GoogleDrive)
  const memberIsHosting = await storageAdapter
    .updateServerLock((serverLock) => {
      const isMemberLock =
        serverLock.status === ServerLockStatus.Locked &&
        serverLock.lockedBy.email.toLowerCase() === member.email.toLowerCase()

      return isMemberLock ? { status: ServerLockStatus.Unlocked } : null
    })
    .catch(() => {
      throw new GoogleDriveError(
        "Access was revoked, but ChunkShare could not clear this member's hosting lock."
      )
    })

  return {
    revokedMemberWasHosting: memberIsHosting,
    sharingState: await buildSharingState(context)
  }
}

async function readActiveGoogleDriveFolder(): Promise<GoogleDriveFolderConfig | null> {
  const settings = await readCloudStorageSettings()

  const hasActiveGoogleDriveFolder =
    settings.activeProvider === CloudStorageProvider.GoogleDrive &&
    hasValidGoogleDriveFolder(settings.googleDrive)

  return hasActiveGoogleDriveFolder ? settings.googleDrive.folder : null
}

async function getOwnerFolderContext(folder: GoogleDriveFolderConfig): Promise<OwnerFolderContext | null> {
  const authSession = await ensureGoogleDriveAuthSession()
  const oauthClient = createAuthenticatedGoogleOAuthClient(authSession.tokens)
  const { folderId, folderName } = folder
  const response = await oauthClient.fetch<GoogleDriveFileResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(folderId)}?fields=name,ownedByMe,capabilities(canShare)`
  )

  if (!response.data.ownedByMe) {
    return null
  }

  if (!response.data.capabilities?.canShare) {
    throw new GoogleDriveError('Google Drive does not allow this account to share the world folder.')
  }

  return {
    folderId,
    folderName: response.data.name ?? folderName,
    oauthClient,
    ownerEmail: authSession.player.email
  }
}

async function requireOwnerFolderContext(): Promise<OwnerFolderContext> {
  const folder = await readActiveGoogleDriveFolder()
  const context = folder ? await getOwnerFolderContext(folder) : null

  if (!context) {
    throw new GoogleDriveError('Only the owner of the active Google Drive world can manage sharing.')
  }

  return context
}

async function buildSharingState(context: OwnerFolderContext): Promise<GoogleDriveSharingState> {
  const members = (await listPermissions(context))
    .map(toMember)
    .filter((member): member is GoogleDriveMember => member !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  return {
    folderName: context.folderName,
    members
  }
}

async function listPermissions(context: OwnerFolderContext): Promise<DrivePermission[]> {
  const fields = encodeURIComponent('permissions(id,type,role,emailAddress,displayName,deleted)')
  const response = await context.oauthClient.fetch<DrivePermissionList>(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(context.folderId)}/permissions?fields=${fields}`
  )

  return response.data.permissions ?? []
}

async function disableWriterSharing(context: OwnerFolderContext): Promise<void> {
  try {
    await context.oauthClient.fetch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(context.folderId)}`,
      {
        body: JSON.stringify({ writersCanShare: false }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      }
    )
  } catch {
    throw new GoogleDriveError('Unable to restrict sharing for this world folder.')
  }
}

async function updatePermissionToWriter(context: OwnerFolderContext, permissionId: string): Promise<void> {
  try {
    await context.oauthClient.fetch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(context.folderId)}/permissions/${encodeURIComponent(permissionId)}`,
      {
        body: JSON.stringify({ role: 'writer' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      }
    )
  } catch {
    throw new GoogleDriveError('Unable to grant writer access to this Google account.')
  }
}

async function createWriterPermission(context: OwnerFolderContext, email: string): Promise<void> {
  try {
    await context.oauthClient.fetch(
      `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(context.folderId)}/permissions?sendNotificationEmail=false`,
      {
        body: JSON.stringify({ emailAddress: email, role: 'writer', type: 'user' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }
    )
  } catch {
    throw new GoogleDriveError('Unable to invite this Google account. Check the email and try again.')
  }
}

function toMember(permission: DrivePermission): GoogleDriveMember | null {
  if (
    permission.type !== 'user' ||
    permission.deleted ||
    !permission.id ||
    !permission.emailAddress ||
    !isMemberRole(permission.role)
  ) {
    return null
  }

  return {
    permissionId: permission.id,
    displayName: permission.displayName ?? permission.emailAddress,
    email: permission.emailAddress,
    role: permission.role
  }
}

function isMemberRole(role: string | undefined): role is GoogleDriveMemberRole {
  return role === 'commenter' || role === 'reader' || role === 'writer'
}
