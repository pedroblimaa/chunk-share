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
    label: 'Ready',
    tone: ServerSyncTone.Success,
    actionLabel: 'Start server',
    message: 'Local save matches the latest cloud save.'
  },
  [ServerSyncStatus.NoCloudSave]: {
    label: 'First publish pending',
    tone: ServerSyncTone.Neutral,
    actionLabel: 'Start server',
    message: 'No shared save has been published yet.'
  },
  [ServerSyncStatus.UpdateAvailable]: {
    label: 'Update available',
    tone: ServerSyncTone.Warning,
    actionLabel: 'Update and start',
    message: 'A newer cloud save is available.'
  },
  [ServerSyncStatus.LockedByOther]: {
    label: 'Hosted by someone',
    tone: ServerSyncTone.Danger,
    actionLabel: 'Wait for host',
    message: 'Another user is actively hosting this server save.'
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
    label: 'Local save newer',
    tone: ServerSyncTone.Warning,
    actionLabel: 'Review local save',
    message: 'The local save version is newer than the cloud metadata.'
  },
  [ServerSyncStatus.MissingCloudFile]: {
    label: 'Cloud file missing',
    tone: ServerSyncTone.Danger,
    actionLabel: 'Cannot start',
    message: 'The latest save metadata points to a file that was not found.'
  }
} satisfies Record<ServerSyncStatus, ServerSyncView>
