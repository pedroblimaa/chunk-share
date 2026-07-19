import { ipcMain } from 'electron'
import {
  DRIVE_SHARING_GET_AVAILABILITY_CHANNEL,
  DRIVE_SHARING_INVITE_MEMBER_CHANNEL,
  DRIVE_SHARING_REVOKE_MEMBER_CHANNEL
} from '../../../shared/ipc-channels'
import {
  getGoogleDriveSharingAvailability,
  inviteGoogleDriveMember,
  revokeGoogleDriveMember
} from '../../cloud-storage/google-drive-sharing-service'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'

export function registerDriveSharingIpcHandlers(): void {
  ipcMain.handle(DRIVE_SHARING_GET_AVAILABILITY_CHANNEL, () => getGoogleDriveSharingAvailability())

  ipcMain.handle(DRIVE_SHARING_INVITE_MEMBER_CHANNEL, (_, email: unknown) => {
    return inviteGoogleDriveMember(normalizeGoogleEmail(email))
  })

  ipcMain.handle(DRIVE_SHARING_REVOKE_MEMBER_CHANNEL, (_, permissionId: unknown) => {
    assertNonEmptyString(permissionId, 'Invalid Google Drive member permission.')
    return revokeGoogleDriveMember(permissionId)
  })
}

function normalizeGoogleEmail(email: unknown): string {
  if (typeof email !== 'string') {
    throw new GoogleDriveError('Enter a valid Google account email address.')
  }

  const normalizedEmail = email.trim().toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new GoogleDriveError('Enter a valid Google account email address.')
  }

  return normalizedEmail
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GoogleDriveError(message)
  }
}
