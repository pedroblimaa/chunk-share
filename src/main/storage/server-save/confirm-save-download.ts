import { ServerSyncStatus } from '../../../shared/server-sync'
import { ExclusiveStorageOperation } from '../../../shared/storage-operation'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../../server-sync/server-sync-service'
import { runExclusiveStorageOperation } from '../core/operations/operation-coordinator'
import { StorageError } from '../core/support/storage-error'
import { consumeFabricRestoreConfirmation } from './fabric-save-conflict'
import { restoreLatestServerSave } from './server-save-restorer'

export function confirmSaveDownload(token: string): Promise<void> {
  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.ServerDownload,
    new StorageError('Wait for the current storage operation to finish.'),
    async () => {
      if (getServerRuntimeSnapshot().runningWorldId) {
        throw new StorageError('Stop the running server before downloading.')
      }

      const pending = await consumeFabricRestoreConfirmation(token)
      const snapshot = await getServerSyncSnapshot(pending.context)
      const isSameUpdate =
        JSON.stringify(snapshot.latestSave) === pending.latestSave &&
        snapshot.serverSync.status === ServerSyncStatus.UpdateAvailable

      if (!isSameUpdate) {
        throw new StorageError('The shared save changed or is unavailable. Download again.')
      }

      await restoreLatestServerSave(pending.context, snapshot, {
        confirmedFingerprint: pending.fingerprint
      })
    }
  )
}
