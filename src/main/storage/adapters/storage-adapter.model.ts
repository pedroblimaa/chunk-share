import type { LatestSave, ServerLock } from '../../../shared/domain'
import type { WorldId } from '../../../shared/world'

export interface StorageMutationLock {
  operationId: string
  startedAt: string
}

export interface StorageControl {
  formatVersion: 1
  latestSave: LatestSave
  serverLock: ServerLock
  storageMutation: StorageMutationLock | null
}

// TODO(multiple-worlds/subtask-2): Replace StorageControl with this world-aware shape when adapters are bound to a world.
export interface WorldStorageControl extends StorageControl {
  worldId: WorldId
}

export type RecoverableStorageControl = Omit<StorageControl, 'serverLock'> & {
  serverLock: unknown
}

export type ServerLockUpdate = (serverLock: ServerLock) => ServerLock | null

export interface ServerSyncStorageData {
  latestSave: LatestSave
  serverLock: ServerLock
  worldFileExists: boolean
}

export interface ServerSavesReplacement {
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface StorageAdapter {
  assertNoStorageMutationInProgress(): Promise<void>
  runExclusiveStorageMutation<Result>(executeMutation: () => Promise<Result>): Promise<Result>
  readServerSyncData(): Promise<ServerSyncStorageData>

  readLatestSave(): Promise<LatestSave>
  writeLatestSave(latestSave: LatestSave): Promise<void>

  readServerLock(): Promise<ServerLock>
  updateServerLock(update: ServerLockUpdate): Promise<boolean>
  resetServerLock(): Promise<void>

  stageServerSavesReplacement(): Promise<ServerSavesReplacement>

  worldFileExists(): Promise<boolean>
  uploadWorld(localZipPath: string): Promise<Error | null>
  downloadWorld(localDestinationPath: string): Promise<void>
  resetServerSaves(): Promise<void>
}
