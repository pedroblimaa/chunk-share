import type { LatestSave, ServerLock } from '../../../shared/domain'

export interface ServerSaveVersionFile {
  fileName: string
  saveVersion: number
}

export interface ServerSyncStorageData {
  latestSave: LatestSave
  serverLock: ServerLock
  versionFiles: ServerSaveVersionFile[]
}

export interface StorageAdapter {
  assertNoStorageMutationInProgress(): Promise<void>
  runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result>
  readServerSyncData(): Promise<ServerSyncStorageData>

  readLatestSave(): Promise<LatestSave>
  writeLatestSave(latestSave: LatestSave): Promise<void>

  readServerLock(): Promise<ServerLock>
  writeServerLock(serverLock: ServerLock): Promise<void>
  resetServerLock(): Promise<void>

  listServerSaveVersions(): Promise<ServerSaveVersionFile[]>
  serverSaveVersionExists(fileName: string): Promise<boolean>
  uploadServerSaveVersion(fileName: string, localZipPath: string): Promise<void>
  downloadServerSaveVersion(fileName: string, localDestinationPath: string): Promise<void>
  deleteServerSaveVersion(fileName: string): Promise<void>
  resetServerSaves(): Promise<void>
}
