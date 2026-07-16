import { registerAuthIpcHandlers } from './handlers/auth-ipc'
import { registerDashboardIpcHandlers } from './handlers/dashboard-ipc'
import { registerServerRuntimeIpcHandlers } from './handlers/server-runtime-ipc'
import { registerServerSetupIpcHandlers } from './handlers/server-setup-ipc'
import { registerStorageIpcHandlers } from './handlers/storage-ipc'

export function registerIpcHandlers(): void {
  registerDashboardIpcHandlers()
  registerAuthIpcHandlers()
  registerStorageIpcHandlers()
  registerServerSetupIpcHandlers()
  registerServerRuntimeIpcHandlers()
}
