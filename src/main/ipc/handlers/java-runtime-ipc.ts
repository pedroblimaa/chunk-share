import { dialog } from 'electron'
import {
  JAVA_RUNTIME_BROWSE_CHANNEL,
  JAVA_RUNTIME_GET_STATUS_CHANNEL,
  JAVA_RUNTIME_GET_WORLD_STATUS_CHANNEL,
  JAVA_RUNTIME_SAVE_CONFIG_CHANNEL
} from '../../../shared/ipc-channels'
import { isWorldId } from '../../../shared/world'
import {
  getJavaRuntimeStatus,
  getWorldJavaRuntimeStatus,
  saveJavaConfig
} from '../../java-runtime/java-runtime-service'
import { StorageError } from '../../storage/core/support/storage-error'
import { handleIpc } from '../typed-ipc'

export function registerJavaRuntimeIpcHandlers(): void {
  handleIpc(JAVA_RUNTIME_GET_STATUS_CHANNEL, (_, request: unknown) => getJavaRuntimeStatus(request))
  handleIpc(JAVA_RUNTIME_GET_WORLD_STATUS_CHANNEL, (_, worldId: unknown, minecraftVersion?: unknown) => {
    if (!isWorldId(worldId) || (minecraftVersion !== undefined && typeof minecraftVersion !== 'string')) {
      throw new StorageError('Invalid Java world status payload.')
    }
    return getWorldJavaRuntimeStatus(worldId, minecraftVersion)
  })
  handleIpc(JAVA_RUNTIME_SAVE_CONFIG_CHANNEL, (_, request: unknown) => saveJavaConfig(request))
  handleIpc(JAVA_RUNTIME_BROWSE_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java executable', extensions: ['exe'] }] : []
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
