import { isFabricRuntime } from '../../../shared/fabric'
import {
  isSupportedServerType,
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupServerInput,
  type SetupServerResult
} from '../../../shared/server-setup'
import {
  SERVER_SETUP_CREATE_CHANNEL,
  SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL,
  SERVER_SETUP_FABRIC_VERSIONS_CHANNEL,
  SERVER_SETUP_LIST_VERSIONS_CHANNEL,
  SERVER_SETUP_OPEN_FOLDER_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL
} from '../../../shared/ipc-channels'
import {
  getFabricVersionOptions,
  listFabricReleaseVersions
} from '../../server-setup/fabric-version-resolver'
import { openServerFolder } from '../../server-setup/server-folder-service'
import { downloadSharedServer, setupNewServer } from '../../server-setup/server-setup-service'
import { listVanillaReleaseVersions } from '../../server-setup/vanilla-version-resolver'
import { StorageError } from '../../storage/core/support/storage-error'
import { isJavaConfig } from '../../storage/core/support/storage-validation'
import { getStorageSnapshot } from '../../storage/core/storage-service'
import { handleIpc, sendIpcEvent } from '../typed-ipc'

export function registerServerSetupIpcHandlers(): void {
  handleIpc(SERVER_SETUP_LIST_VERSIONS_CHANNEL, (_, serverType: unknown) => {
    if (!isSupportedServerType(serverType)) {
      throw new StorageError('Unsupported server type.')
    }

    return serverType === 'fabric' ? listFabricReleaseVersions() : listVanillaReleaseVersions()
  })

  handleIpc(SERVER_SETUP_FABRIC_VERSIONS_CHANNEL, (_, minecraftVersion: unknown) => {
    if (!isString(minecraftVersion)) {
      throw new StorageError('Invalid Minecraft version.')
    }

    return getFabricVersionOptions(minecraftVersion)
  })

  handleIpc(SERVER_SETUP_OPEN_FOLDER_CHANNEL, (_, worldId) => openServerFolder(worldId))

  handleIpc(SERVER_SETUP_CREATE_CHANNEL, async (event, payload: unknown) => {
    if (!isSetupServerInput(payload)) {
      throw new StorageError('Invalid server setup payload.')
    }

    const sendProgress = (progressEvent: ServerSetupProgressEvent): void => {
      sendIpcEvent(event.sender, SERVER_SETUP_PROGRESS_CHANNEL, progressEvent)
    }

    try {
      const setupResult = await setupNewServer(payload, sendProgress)

      return {
        localState: setupResult.localState,
        worldId: setupResult.worldId
      } satisfies SetupServerResult
    } catch (error) {
      const storageSnapshot = await getStorageSnapshot()

      if (storageSnapshot.localState.serverSetup.status === 'error') {
        return { localState: storageSnapshot.localState, worldId: null } satisfies SetupServerResult
      }

      throw error
    }
  })

  handleIpc(SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL, async (_, payload: unknown) => {
    if (!isDownloadSharedServerInput(payload)) {
      throw new StorageError('Invalid shared server download payload.')
    }

    await downloadSharedServer(payload)

    return getStorageSnapshot()
  })
}

function isSetupServerInput(value: unknown): value is SetupServerInput {
  if (!isRecord(value) || !isSupportedServerType(value.serverType)) {
    return false
  }

  const hasValidFabricRuntime =
    value.serverType === 'fabric' ? isFabricRuntime(value.fabric) : value.fabric === undefined

  return (
    hasValidFabricRuntime &&
    isString(value.name) &&
    isString(value.minecraftVersion) &&
    isOptionalString(value.minecraftVersionMetadataUrl) &&
    typeof value.port === 'number' &&
    typeof value.eulaAccepted === 'boolean' &&
    isJavaConfig(value.javaConfig)
  )
}

function isDownloadSharedServerInput(value: unknown): value is DownloadSharedServerInput {
  return isRecord(value) && typeof value.eulaAccepted === 'boolean'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}
