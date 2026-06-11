import { ipcMain } from 'electron'
import { DASHBOARD_SNAPSHOT_CHANNEL } from '../../shared/ipc-channels'
import { getDashboardSnapshot } from '../dashboard/dashboard-service'

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle(DASHBOARD_SNAPSHOT_CHANNEL, () => getDashboardSnapshot())
}
