import type { LatestSave, Player, ServerLock } from './domain'

export enum ServerSyncStatus {
  Ready = 'ready',
  NoCloudSave = 'no-cloud-save',
  UpdateAvailable = 'update-available',
  LockedByOther = 'locked-by-other',
  StaleLock = 'stale-lock',
  Incompatible = 'incompatible',
  LocalNewer = 'local-newer',
  MissingCloudFile = 'missing-cloud-file'
}

export interface ServerSyncSnapshot {
  status: ServerSyncStatus
  latestSave: LatestSave
  serverLock: ServerLock
  localSaveVersion: number | null
  cloudSaveVersion: number | null
  lockedBy: Player | null
  isStaleLock: boolean
  isStartAllowed: boolean
}
