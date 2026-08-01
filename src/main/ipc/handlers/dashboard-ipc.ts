import { ipcMain } from 'electron'
import { DASHBOARD_SELECT_WORLD_CHANNEL, DASHBOARD_SNAPSHOT_CHANNEL } from '../../../shared/ipc-channels'
import { isWorldId } from '../../../shared/world'
import { getServerDisplayState } from '../../dashboard/dashboard-service'
import { selectWorld } from '../../storage/persistence/local-state-store'
import { StorageError } from '../../storage/core/support/storage-error'

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle(DASHBOARD_SNAPSHOT_CHANNEL, () => getServerDisplayState())

  ipcMain.handle(DASHBOARD_SELECT_WORLD_CHANNEL, async (_, worldId: unknown) => {
    if (!isWorldId(worldId)) {
      throw new StorageError('Invalid world selection payload.')
    }

    await selectWorld(worldId)

    return getServerDisplayState()
  })
}
