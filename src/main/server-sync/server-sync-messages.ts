import { ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'

export function getSyncStartBlockedMessage(serverSync: ServerSyncSnapshot): string {
  const blockedMessages: Record<ServerSyncStatus, string> = {
    ready: 'Server is ready to start.',
    'no-cloud-save': 'Server is ready to start because no shared save has been published yet.',
    'update-available': 'Shared save is newer. ChunkShare will update this device before hosting.',
    'locked-by-other': `This server is already hosted by ${
      serverSync.lockedBy?.displayName ?? 'another user'
    }.`,
    'stale-lock': 'The previous host lock is stale. Starting is allowed.',
    incompatible: 'The shared save does not match this local server version or type.',
    'local-newer': 'This device has a newer save. ChunkShare will publish it before hosting.',
    'missing-cloud-file': serverSync.latestSave
      ? `The shared save file ${serverSync.latestSave.fileName} is missing.`
      : 'The shared save file is missing.'
  }

  return blockedMessages[serverSync.status]
}
