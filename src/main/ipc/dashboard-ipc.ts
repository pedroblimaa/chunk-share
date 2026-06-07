import { ipcMain } from 'electron'
import { DASHBOARD_SNAPSHOT_CHANNEL } from '../../shared/ipc-channels'
import { getMockDashboardSnapshot } from '../mock-dashboard'

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle(DASHBOARD_SNAPSHOT_CHANNEL, () => getMockDashboardSnapshot())
}
