import {
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupVanillaServerResult,
  type SetupVanillaServerInput
} from '../../../shared/server-setup'
import {
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL
} from '../../../shared/ipc-channels'
import { downloadSharedServer, setupNewVanillaServer } from '../../server-setup/server-setup-service'
import { listVanillaReleaseVersions } from '../../server-setup/vanilla-version-resolver'
import { StorageError } from '../../storage/core/support/storage-error'
import { isJavaConfig } from '../../storage/core/support/storage-validation'
import { getStorageSnapshot } from '../../storage/core/storage-service'
import { handleIpc, sendIpcEvent } from '../typed-ipc'

export function registerServerSetupIpcHandlers(): void {
  handleIpc(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL, () => listVanillaReleaseVersions())

  handleIpc(SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL, async (_, payload: unknown) => {
    if (!isDownloadSharedServerInput(payload)) {
      throw new StorageError('Invalid shared server download payload.')
    }

    await downloadSharedServer(payload)

    return getStorageSnapshot()
  })

  handleIpc(SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL, async (event, payload: unknown) => {
    if (!isSetupVanillaServerInput(payload)) {
      throw new StorageError('Invalid server setup payload.')
    }

    const sendProgress = (progressEvent: ServerSetupProgressEvent): void => {
      sendIpcEvent(event.sender, SERVER_SETUP_PROGRESS_CHANNEL, progressEvent)
    }

    try {
      const setupResult = await setupNewVanillaServer(payload, sendProgress)

      return {
        localState: setupResult.localState,
        worldId: setupResult.worldId
      } satisfies SetupVanillaServerResult
    } catch (error) {
      const storageSnapshot = await getStorageSnapshot()

      if (storageSnapshot.localState.serverSetup.status === 'error') {
        return { localState: storageSnapshot.localState, worldId: null } satisfies SetupVanillaServerResult
      }

      throw error
    }
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
    typeof value.eulaAccepted === 'boolean' &&
    isJavaConfig(value.javaConfig)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDownloadSharedServerInput(value: unknown): value is DownloadSharedServerInput {
  return isRecord(value) && typeof value.eulaAccepted === 'boolean'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}
