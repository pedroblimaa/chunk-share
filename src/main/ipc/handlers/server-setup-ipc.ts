import { withSaveConflict } from '../server-save-conflict'
import { isFabricRuntime } from '../../../shared/fabric'
import {
  listFabricReleaseVersions,
  getFabricVersionOptions
} from '../../server-setup/fabric-version-resolver'
import { openServerFolder } from '../../server-setup/server-folder-service'
import {
  type SetupServerInput,
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupVanillaServerResult,
  type SetupVanillaServerInput
} from '../../../shared/server-setup'
import {
  SERVER_SETUP_LIST_VERSIONS_CHANNEL,
  SERVER_SETUP_FABRIC_VERSIONS_CHANNEL,
  SERVER_SETUP_CREATE_CHANNEL,
  SERVER_SETUP_OPEN_FOLDER_CHANNEL,
  SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL,
  SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL,
  SERVER_SETUP_PROGRESS_CHANNEL,
  SERVER_SETUP_SETUP_VANILLA_SERVER_CHANNEL
} from '../../../shared/ipc-channels'
import {
  downloadSharedServer,
  setupNewVanillaServer,
  setupNewServer
} from '../../server-setup/server-setup-service'
import { listVanillaReleaseVersions } from '../../server-setup/vanilla-version-resolver'
import { StorageError } from '../../storage/core/support/storage-error'
import { isJavaConfig } from '../../storage/core/support/storage-validation'
import { getStorageSnapshot } from '../../storage/core/storage-service'
import { handleIpc, sendIpcEvent } from '../typed-ipc'

export function registerServerSetupIpcHandlers(): void {
  handleIpc(SERVER_SETUP_LIST_VERSIONS_CHANNEL, (_, serverType) => {
    if (serverType === 'vanilla') return listVanillaReleaseVersions()
    if (serverType === 'fabric') return listFabricReleaseVersions()
    throw new StorageError('Unsupported server type.')
  })
  handleIpc(SERVER_SETUP_FABRIC_VERSIONS_CHANNEL, (_, version) => {
    if (typeof version !== 'string') throw new StorageError('Invalid Minecraft version.')
    return getFabricVersionOptions(version)
  })
  handleIpc(SERVER_SETUP_OPEN_FOLDER_CHANNEL, (_, worldId) => openServerFolder(worldId))
  handleIpc(SERVER_SETUP_CREATE_CHANNEL, async (event, payload: unknown) => {
    if (!isSetupServerInput(payload)) throw new StorageError('Invalid server setup payload.')
    return setupNewServer(payload, (progress) =>
      sendIpcEvent(event.sender, SERVER_SETUP_PROGRESS_CHANNEL, progress)
    )
  })
  handleIpc(SERVER_SETUP_LIST_VANILLA_VERSIONS_CHANNEL, () => listVanillaReleaseVersions())

  handleIpc(SERVER_SETUP_DOWNLOAD_SHARED_SERVER_CHANNEL, async (_, payload: unknown) => {
    if (!isDownloadSharedServerInput(payload)) {
      throw new StorageError('Invalid shared server download payload.')
    }

    return withSaveConflict(async () => {
      await downloadSharedServer(payload)
      return getStorageSnapshot()
    })
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

function isSetupServerInput(value: unknown): value is SetupServerInput {
  return (
    isSetupVanillaServerInput(value) &&
    'serverType' in value &&
    (value.serverType === 'vanilla' ||
      (value.serverType === 'fabric' && 'fabric' in value && isFabricRuntime(value.fabric)))
  )
}
