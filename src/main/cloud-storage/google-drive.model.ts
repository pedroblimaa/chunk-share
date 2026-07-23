export enum GoogleDriveErrorCode {
  FolderNotFound = 'folder-not-found',
  NotAFolder = 'not-a-folder',
  PermissionDenied = 'permission-denied',
  RequestFailed = 'request-failed'
}

export const DEFAULT_GOOGLE_DRIVE_FOLDER_NAME = 'ChunkShare'
export const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3'
export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
export const GOOGLE_DRIVE_TEMP_FOLDER_PREFIX = 'ChunkShare access check'

export interface GoogleDriveFileResponse {
  createdTime?: string
  id?: string
  name?: string
  mimeType?: string
  trashed?: boolean
  ownedByMe?: boolean
  capabilities?: {
    canAddChildren?: boolean
    canEdit?: boolean
    canShare?: boolean
  }
}

export interface GoogleDriveFileListResponse {
  files?: GoogleDriveFileResponse[]
}

export interface GoogleDriveRevisionResponse {
  id?: string
  keepForever?: boolean
  modifiedTime?: string
}

export interface GoogleDriveRevisionListResponse {
  revisions?: GoogleDriveRevisionResponse[]
}

export interface GoogleDriveCreateFolderInput {
  name: string
  parentFolderId?: string
}
