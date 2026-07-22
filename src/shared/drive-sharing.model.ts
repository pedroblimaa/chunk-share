export type GoogleDriveMemberRole = 'commenter' | 'reader' | 'writer'

export interface GoogleDriveMember {
  permissionId: string
  displayName: string
  email: string
  role: GoogleDriveMemberRole
}

export interface GoogleDriveSharingState {
  folderName: string
  members: GoogleDriveMember[]
}

export interface GoogleDriveInviteResult {
  joinLink: string
  sharingState: GoogleDriveSharingState
}

export interface GoogleDriveRevokeResult {
  revokedMemberWasHosting: boolean
  sharingState: GoogleDriveSharingState
}

export interface GoogleDriveSharingAvailability {
  isGoogleDriveActive: boolean
  sharingState: GoogleDriveSharingState | null
}
