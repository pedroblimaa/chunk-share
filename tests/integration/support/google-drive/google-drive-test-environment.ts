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

interface GoogleTestDriveFile {
  content: string | Uint8Array
  id: string
  mimeType: string
  name: string
  parents: string[]
  revisions: GoogleTestDriveRevision[]
}

interface GoogleTestDriveRevision {
  content: string | Uint8Array
  id: string
  modifiedTime: string
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
  private files = new Map<string, GoogleTestDriveFile>()
  private lastPickerFileIds: string[] | null = null
  private nextFileNumber = 1
  private nextPermissionNumber = 1
  private nextRevisionNumber = 1
  private permissions = new Map<string, GoogleTestPermission>()

  public writersCanShare = true
  public lastPermissionNotificationEnabled: boolean | null = null

  public reset(): void {
    this.activeAccountName = 'owner'
    this.appAuthorizedFileIds = new Map([
      ['owner', new Set([GOOGLE_TEST_IDS.controlFile, GOOGLE_TEST_IDS.folder, GOOGLE_TEST_IDS.worldFile])]
    ])
    this.files = new Map([
      [
        GOOGLE_TEST_IDS.controlFile,
        createDriveFile(
          GOOGLE_TEST_IDS.controlFile,
          'control.json',
          'application/json',
          JSON.stringify(TEST_CONTROL)
        )
      ],
      [
        GOOGLE_TEST_IDS.worldFile,
        createDriveFile(GOOGLE_TEST_IDS.worldFile, 'world.zip', 'application/zip', 'test-world-zip')
      ]
    ])
    this.lastPickerFileIds = null
    this.nextFileNumber = 1
    this.nextPermissionNumber = 1
    this.nextRevisionNumber = 1
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

  public getFileContentByName(fileName: string): string | Uint8Array | null {
    return [...this.files.values()].find((file) => file.name === fileName)?.content ?? null
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

  public listWorldFiles(
    accountName: GoogleTestAccountName,
    fileName?: string
  ): GoogleDriveFileResponse[] | null {
    if (!this.accountCanAccessFile(accountName, GOOGLE_TEST_IDS.folder)) {
      return null
    }

    return [...this.files.values()]
      .filter(
        (file) => file.parents.includes(GOOGLE_TEST_IDS.folder) && (!fileName || file.name === fileName)
      )
      .map((file) => this.getFileMetadata(accountName, file.id))
      .filter((file): file is GoogleDriveFileResponse => file !== null)
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

    const file = this.files.get(fileId)
    if (!file) {
      return null
    }

    const canEdit = this.getAccountRole(accountName) === 'writer' || ownedByMe

    return {
      capabilities: {
        canDownload: true,
        canEdit
      },
      id: fileId,
      mimeType: file.mimeType,
      name: file.name,
      ownedByMe,
      parents: file.parents,
      trashed: false
    }
  }

  public getFileContent(
    accountName: GoogleTestAccountName,
    fileId: string,
    revisionId?: string
  ): string | Uint8Array | null {
    if (!this.accountCanAccessFile(accountName, fileId)) {
      return null
    }

    const file = this.files.get(fileId)
    if (!file) {
      return null
    }

    if (!revisionId) {
      return file.content
    }

    return file.revisions.find((revision) => revision.id === revisionId)?.content ?? null
  }

  public createFile(
    accountName: GoogleTestAccountName,
    input: { mimeType: string; name: string; parents?: string[] }
  ): GoogleDriveFileResponse | null {
    if (accountName !== 'owner') {
      return null
    }

    const fileId = `created-drive-file-${this.nextFileNumber}`
    this.nextFileNumber += 1
    this.files.set(fileId, createDriveFile(fileId, input.name, input.mimeType, '', input.parents ?? []))
    this.appAuthorizedFileIds.get(accountName)?.add(fileId)

    return this.getFileMetadata(accountName, fileId)
  }

  public uploadFile(
    accountName: GoogleTestAccountName,
    fileId: string,
    content: string | Uint8Array,
    keepRevisionForever: boolean
  ): boolean {
    const file = this.files.get(fileId)
    if (accountName !== 'owner' || !file) {
      return false
    }

    file.content = content

    if (keepRevisionForever) {
      file.revisions.push({
        content,
        id: `revision-${this.nextRevisionNumber}`,
        modifiedTime: new Date(this.nextRevisionNumber * 1_000).toISOString()
      })
      this.nextRevisionNumber += 1
    }

    return true
  }

  public listRevisions(accountName: GoogleTestAccountName, fileId: string): GoogleTestDriveRevision[] | null {
    const file = this.files.get(fileId)
    return accountName === 'owner' && file ? [...file.revisions] : null
  }

  public deleteRevision(accountName: GoogleTestAccountName, fileId: string, revisionId: string): boolean {
    const file = this.files.get(fileId)
    if (accountName !== 'owner' || !file) {
      return false
    }

    const revisionIndex = file.revisions.findIndex((revision) => revision.id === revisionId)
    if (revisionIndex === -1) {
      return false
    }

    file.revisions.splice(revisionIndex, 1)
    return true
  }

  public deleteFile(accountName: GoogleTestAccountName, fileId: string): boolean {
    if (accountName !== 'owner') {
      return false
    }

    this.appAuthorizedFileIds.get(accountName)?.delete(fileId)
    return this.files.delete(fileId)
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

function createDriveFile(
  id: string,
  name: string,
  mimeType: string,
  content: string | Uint8Array,
  parents: string[] = [GOOGLE_TEST_IDS.folder]
): GoogleTestDriveFile {
  return {
    content,
    id,
    mimeType,
    name,
    parents,
    revisions: []
  }
}
