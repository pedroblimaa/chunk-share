import { ServerSyncStatus } from '../../../shared/server-sync'

export enum ServerSyncTone {
  Neutral = 'neutral',
  Success = 'success',
  Warning = 'warning',
  Danger = 'danger'
}

export interface ServerSyncView {
  label: string
  tone: ServerSyncTone
  actionLabel: string
  message: string
}

export const SERVER_SYNC_VIEW_BY_STATUS = {
  [ServerSyncStatus.Ready]: {
    label: 'Synced',
    tone: ServerSyncTone.Success,
    actionLabel: 'Start server',
    message: 'Local save matches the shared save.'
  },
  [ServerSyncStatus.NoCloudSave]: {
    label: 'First publish pending',
    tone: ServerSyncTone.Neutral,
    actionLabel: 'Start server',
    message: 'No shared save has been published yet.'
  },
  [ServerSyncStatus.UpdateAvailable]: {
    label: 'Cloud ahead',
    tone: ServerSyncTone.Warning,
    actionLabel: 'Download Update',
    message: 'A newer shared save is available. Download it before hosting.'
  },
  [ServerSyncStatus.LockedByOther]: {
    label: 'Online with someone',
    tone: ServerSyncTone.Success,
    actionLabel: 'Join server',
    message: 'This server is online. Open connection details to join.'
  },
  [ServerSyncStatus.StaleLock]: {
    label: 'Stale lock',
    tone: ServerSyncTone.Warning,
    actionLabel: 'Take over',
    message: 'The previous host stopped sending heartbeat updates.'
  },
  [ServerSyncStatus.Incompatible]: {
    label: 'Version mismatch',
    tone: ServerSyncTone.Danger,
    actionLabel: 'Cannot start',
    message: 'The cloud save does not match this local server configuration.'
  },
  [ServerSyncStatus.LocalNewer]: {
    label: 'Local ahead',
    tone: ServerSyncTone.Warning,
    actionLabel: 'Publish and start',
    message: 'This device has a newer save. ChunkShare will publish it before hosting.'
  },
  [ServerSyncStatus.MissingCloudFile]: {
    label: 'Cloud file missing',
    tone: ServerSyncTone.Danger,
    actionLabel: 'Cannot start',
    message: 'The latest save metadata points to a file that was not found.'
  }
} satisfies Record<ServerSyncStatus, ServerSyncView>
