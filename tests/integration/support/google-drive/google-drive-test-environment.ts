import { AuthError } from '../../../../src/main/auth/auth-error'
import { AuthErrorCode, type AuthSession } from '../../../../src/main/auth/auth-model'
import { GOOGLE_DRIVE_SCOPE } from '../../../../src/main/auth/auth-constants'
import type { GoogleDriveFileResponse } from '../../../../src/main/cloud-storage/google-drive.model'
import { ServerLockStatus, type Player } from '../../../../src/shared/domain'
import type { StorageControl } from '../../../../src/main/storage/adapters/storage-adapter.model'

export type GoogleTestAccountName = 'friend' | 'owner' | 'uninvited'
export type GoogleTestPermissionRole = 'owner' | 'reader' | 'writer'

export interface GoogleTestAccount {
  session: AuthSession
  token: string
}

export interface GoogleTestPermission {
  displayName: string
  emailAddress: string
  id: string
  role: GoogleTestPermissionRole
  type: 'user'
}

export const GOOGLE_TEST_IDS = {
  controlFile: 'test-control-file-id',
  folder: 'test-world-folder-id',
  worldFile: 'test-world-file-id'
} as const

export const GOOGLE_TEST_ACCOUNTS: Record<GoogleTestAccountName, GoogleTestAccount> = {
  friend: createGoogleTestAccount('friend', 'Friend Player', 'friend@example.com', 'FP'),
  owner: createGoogleTestAccount('owner', 'Owner Player', 'owner@example.com', 'OP'),
  uninvited: createGoogleTestAccount('uninvited', 'Uninvited Player', 'uninvited@example.com', 'UP')
}

const OWNER_PERMISSION: GoogleTestPermission = {
  displayName: GOOGLE_TEST_ACCOUNTS.owner.session.player.displayName,
  emailAddress: GOOGLE_TEST_ACCOUNTS.owner.session.player.email,
  id: 'owner-permission-id',
  role: 'owner',
  type: 'user'
}

const TEST_CONTROL: StorageControl = {
  formatVersion: 1,
  latestSave: {
    minecraftVersion: '1.21.8',
    saveVersion: 1,
    serverName: 'Shared Test World',
    serverType: 'vanilla',
    uploadedAt: '2026-07-25T12:00:00.000Z',
    uploadedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player
  },
  serverLock: {
    status: ServerLockStatus.Unlocked
  },
  storageMutation: null
}

export class GoogleDriveTestEnvironment {
  private activeAccountName: GoogleTestAccountName = 'owner'
  private appAuthorizedFileIds = new Map<GoogleTestAccountName, Set<string>>()
  private lastPickerFileIds: string[] | null = null
  private nextPermissionNumber = 1
  private permissions = new Map<string, GoogleTestPermission>()

  public writersCanShare = true
  public lastPermissionNotificationEnabled: boolean | null = null

  public reset(): void {
    this.activeAccountName = 'owner'
    this.appAuthorizedFileIds = new Map([
      ['owner', new Set([GOOGLE_TEST_IDS.controlFile, GOOGLE_TEST_IDS.folder, GOOGLE_TEST_IDS.worldFile])]
    ])
    this.lastPickerFileIds = null
    this.nextPermissionNumber = 1
    this.permissions = new Map([[OWNER_PERMISSION.id, OWNER_PERMISSION]])
    this.writersCanShare = true
    this.lastPermissionNotificationEnabled = null
  }

  public setActiveAccount(accountName: GoogleTestAccountName): void {
    this.activeAccountName = accountName
  }

  public getActiveSession(): AuthSession {
    return GOOGLE_TEST_ACCOUNTS[this.activeAccountName].session
  }

  public getLastPickerFileIds(): string[] | null {
    return this.lastPickerFileIds
  }

  public authorizeGoogleDriveFiles(expectedFileIds: string[]): Promise<void> {
    this.lastPickerFileIds = [...expectedFileIds]

    if (!sameValues(expectedFileIds, [GOOGLE_TEST_IDS.controlFile, GOOGLE_TEST_IDS.worldFile])) {
      throw new AuthError(
        'Select both ChunkShare files shown by Google Drive.',
        AuthErrorCode.InvalidCallback
      )
    }

    if (!this.accountHasFolderAccess(this.activeAccountName)) {
      throw new AuthError(
        'Google Drive did not confirm both world files. Make sure you use an invited account.',
        AuthErrorCode.Cancelled
      )
    }

    this.appAuthorizedFileIds.set(this.activeAccountName, new Set(expectedFileIds))
    return Promise.resolve()
  }

  public resolveAccount(request: Request): GoogleTestAccountName | null {
    const authorization = request.headers.get('authorization')
    const token = authorization?.match(/^Bearer (.+)$/)?.[1]

    return (
      (Object.entries(GOOGLE_TEST_ACCOUNTS).find(([, account]) => account.token === token)?.[0] as
        | GoogleTestAccountName
        | undefined) ?? null
    )
  }

  public listWorldFiles(accountName: GoogleTestAccountName): GoogleDriveFileResponse[] | null {
    if (!this.accountCanAccessFile(accountName, GOOGLE_TEST_IDS.folder)) {
      return null
    }

    return [
      this.getFileMetadata(accountName, GOOGLE_TEST_IDS.controlFile),
      this.getFileMetadata(accountName, GOOGLE_TEST_IDS.worldFile)
    ].filter((file): file is GoogleDriveFileResponse => file !== null)
  }

  public getFileMetadata(accountName: GoogleTestAccountName, fileId: string): GoogleDriveFileResponse | null {
    if (!this.accountCanAccessFile(accountName, fileId)) {
      return null
    }

    const ownedByMe = accountName === 'owner'

    if (fileId === GOOGLE_TEST_IDS.folder) {
      return {
        capabilities: {
          canAddChildren: true,
          canEdit: true,
          canShare: ownedByMe
        },
        id: fileId,
        mimeType: 'application/vnd.google-apps.folder',
        name: 'Shared Test World',
        ownedByMe,
        trashed: false
      }
    }

    const canEdit = this.getAccountRole(accountName) === 'writer' || ownedByMe
    const name = fileId === GOOGLE_TEST_IDS.controlFile ? 'control.json' : 'world.zip'
    const mimeType = fileId === GOOGLE_TEST_IDS.controlFile ? 'application/json' : 'application/zip'

    return {
      capabilities: {
        canDownload: true,
        canEdit
      },
      id: fileId,
      mimeType,
      name,
      ownedByMe,
      parents: [GOOGLE_TEST_IDS.folder],
      trashed: false
    }
  }

  public getFileContent(accountName: GoogleTestAccountName, fileId: string): string | null {
    if (!this.accountCanAccessFile(accountName, fileId)) {
      return null
    }

    if (fileId === GOOGLE_TEST_IDS.controlFile) {
      return JSON.stringify(TEST_CONTROL)
    }

    return fileId === GOOGLE_TEST_IDS.worldFile ? 'test-world-zip' : null
  }

  public listPermissions(accountName: GoogleTestAccountName): GoogleTestPermission[] | null {
    return accountName === 'owner' ? [...this.permissions.values()] : null
  }

  public createWriterPermission(
    accountName: GoogleTestAccountName,
    email: string,
    notificationEnabled: boolean
  ): GoogleTestPermission | null {
    if (accountName !== 'owner') {
      return null
    }

    const permission: GoogleTestPermission = {
      displayName: email,
      emailAddress: email,
      id: `friend-permission-${this.nextPermissionNumber}`,
      role: 'writer',
      type: 'user'
    }

    this.nextPermissionNumber += 1
    this.permissions.set(permission.id, permission)
    this.lastPermissionNotificationEnabled = notificationEnabled

    return permission
  }

  public deletePermission(accountName: GoogleTestAccountName, permissionId: string): boolean {
    if (accountName !== 'owner' || permissionId === OWNER_PERMISSION.id) {
      return false
    }

    return this.permissions.delete(permissionId)
  }

  private accountCanAccessFile(accountName: GoogleTestAccountName, fileId: string): boolean {
    if (!this.accountHasFolderAccess(accountName)) {
      return false
    }

    return (
      fileId === GOOGLE_TEST_IDS.folder || Boolean(this.appAuthorizedFileIds.get(accountName)?.has(fileId))
    )
  }

  private accountHasFolderAccess(accountName: GoogleTestAccountName): boolean {
    return accountName === 'owner' || this.getAccountRole(accountName) !== null
  }

  private getAccountRole(accountName: GoogleTestAccountName): GoogleTestPermissionRole | null {
    const accountEmail = GOOGLE_TEST_ACCOUNTS[accountName].session.player.email

    return (
      [...this.permissions.values()].find((permission) => permission.emailAddress === accountEmail)?.role ??
      null
    )
  }
}

export const googleDriveTestEnvironment = new GoogleDriveTestEnvironment()
googleDriveTestEnvironment.reset()

function createGoogleTestAccount(
  id: string,
  displayName: string,
  email: string,
  avatarInitials: string
): GoogleTestAccount {
  const player: Player = {
    avatarInitials,
    avatarUrl: null,
    displayName,
    email,
    id
  }
  const token = `${id}-access-token`

  return {
    session: {
      player,
      tokens: {
        accessToken: token,
        expiresAt: '2099-01-01T00:00:00.000Z',
        refreshToken: `${id}-refresh-token`,
        scope: GOOGLE_DRIVE_SCOPE
      }
    },
    token
  }
}

function sameValues(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === right.length &&
    right.every((value) => left.includes(value))
  )
}
