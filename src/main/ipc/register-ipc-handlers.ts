import { registerAuthIpcHandlers } from './handlers/auth-ipc'
import { registerDashboardIpcHandlers } from './handlers/dashboard-ipc'
import { registerDriveJoinIpcHandlers } from './handlers/drive-join-ipc'
import { registerDriveSharingIpcHandlers } from './handlers/drive-sharing-ipc'
import { registerServerRuntimeIpcHandlers } from './handlers/server-runtime-ipc'
import { registerServerSetupIpcHandlers } from './handlers/server-setup-ipc'
import { registerStorageIpcHandlers } from './handlers/storage-ipc'
import { registerJavaRuntimeIpcHandlers } from './handlers/java-runtime-ipc'

export function registerIpcHandlers(): void {
  registerDashboardIpcHandlers()
  registerDriveJoinIpcHandlers()
  registerDriveSharingIpcHandlers()
  registerAuthIpcHandlers()
  registerStorageIpcHandlers()
  registerJavaRuntimeIpcHandlers()
  registerServerSetupIpcHandlers()
  registerServerRuntimeIpcHandlers()
}
