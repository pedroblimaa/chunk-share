import { ipcMain } from 'electron'
import type { ServerSetupProgressEvent, SetupVanillaServerInput } from '../../shared/server-setup'
import {
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL
} from '../../shared/ipc-channels'
import { setupVanillaServer } from '../server-setup/server-setup-service'
import { listVanillaReleaseVersions } from '../server-setup/vanilla-version-resolver'
import { StorageError } from '../storage/core/storage-error'
import { getStorageSnapshot } from '../storage/core/storage-service'
import { isRecord } from '../shared/main-helpers'

export function registerServerSetupIpcHandlers(): void {
  ipcMain.handle(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL, () => listVanillaReleaseVersions())

  ipcMain.handle(SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL, async (event, payload: unknown) => {
    if (!isSetupVanillaServerInput(payload)) {
      throw new StorageError('Invalid server setup payload.')
    }

    const sendProgress = (progressEvent: ServerSetupProgressEvent): void => {
      event.sender.send(SERVER_SETUP_PROGRESS_CHANNEL, progressEvent)
    }

    try {
      await setupVanillaServer(payload, sendProgress)
    } catch (error) {
      const storageSnapshot = await getStorageSnapshot()

      if (storageSnapshot.localState.serverSetup.status === 'error') {
        return storageSnapshot
      }

      throw error
    }

    return getStorageSnapshot()
  })
}

function isSetupVanillaServerInput(value: unknown): value is SetupVanillaServerInput {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.name) &&
    isString(value.minecraftVersion) &&
    isOptionalString(value.minecraftVersionMetadataUrl) &&
    typeof value.port === 'number' &&
    typeof value.eulaAccepted === 'boolean'
  )
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}
