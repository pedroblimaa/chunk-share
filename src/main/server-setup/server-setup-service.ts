import { unlink } from 'fs/promises'
import { CloudStorageProvider } from '../../shared/cloud-storage.model'
import type { LocalState, ServerConfig } from '../../shared/domain'
import { isFabricRuntime } from '../../shared/fabric'
import {
  isSupportedServerType,
  ServerSetupProgressStep as Step,
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupServerInput,
  type SetupVanillaServerInput
} from '../../shared/server-setup'
import { getSharedServerName } from '../../shared/server-save'
import { ExclusiveStorageOperation } from '../../shared/storage-operation'
import type { WorldId } from '../../shared/world'
import { validateJavaRuntime } from '../java-runtime/java-runtime-service'
import { getServerRuntimeSnapshot, trackSharedServerDownload } from '../server-runtime/server-runtime-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { runExclusiveStorageOperation } from '../storage/core/operations/operation-coordinator'
import {
  createNewWorldOperationContext,
  getOrCreateSelectedWorldOperationContext,
  getSelectedWorldOperationContext,
  type WorldOperationContext
} from '../storage/core/world-operation-context'
import {
  readAppState,
  readWorldLocalState,
  saveWorldJavaConfig,
  saveWorldRestoredServerSetupResult,
  saveWorldServerSetupResult,
  saveWorldServerSetupState
} from '../storage/persistence/local-state-store'
import { getFabricFilesFingerprint, saveFabricBaseline } from '../storage/server-save/fabric-local-files'
import { backupServerFolder } from '../storage/server-save/server-folder-backup'
import type { RestoreServerSaveProgressListener } from '../storage/server-save/server-save-restore.model'
import { restoreLatestServerSave } from '../storage/server-save/server-save-restorer'
import { writeAcceptedEula, writeServerProperties } from './server-configuration'
import { installServerDistribution } from './server-distribution'
import { ServerSetupError } from './server-setup-error'

type ServerSetupProgressListener = (event: ServerSetupProgressEvent) => void

export async function setupVanillaServer(
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<LocalState> {
  const result = await runServerSetupOperation(
    { ...input, serverType: 'vanilla' },
    onProgress,
    getOrCreateSelectedWorldOperationContext
  )
  return result.localState
}

export interface NewServerSetupResult {
  worldId: WorldId
  localState: LocalState
}

export function setupNewServer(
  input: SetupServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<NewServerSetupResult> {
  return runServerSetupOperation(input, onProgress, createNewWorldOperationContext)
}

function runServerSetupOperation(
  input: SetupServerInput,
  onProgress: ServerSetupProgressListener | undefined,
  getOperationContext: (worldName?: string) => Promise<WorldOperationContext>
): Promise<NewServerSetupResult> {
  validateSetupInput(input)

  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.ServerSetup,
    new ServerSetupError('Cannot set up a server while another storage operation is in progress.'),
    async () => {
      assertNoWorldIsRunning()
      onProgress?.({ step: Step.CreatingFolder })
      await validateJavaRuntime(input.javaConfig, input.minecraftVersion, input.minecraftVersionMetadataUrl)
      const { activeProvider } = await readAppState()

      if (activeProvider === CloudStorageProvider.GoogleDrive) {
        onProgress?.({ step: Step.SettingUpGoogleDrive })
      }

      return runServerSetup(input, onProgress, getOperationContext)
    }
  )
}

async function runServerSetup(
  input: SetupServerInput,
  onProgress: ServerSetupProgressListener | undefined,
  getOperationContext: (worldName?: string) => Promise<WorldOperationContext>
): Promise<NewServerSetupResult> {
  const operationContext = await getOperationContext(input.name)

  await saveWorldJavaConfig(operationContext.worldId, input.javaConfig)

  await markSetupDownloading(operationContext.worldId)

  try {
    const serverConfig = await prepareServer(operationContext, input, onProgress)
    const localState = await markSetupReady(operationContext.worldId, serverConfig)
    onProgress?.({ step: Step.Ready })

    return { localState, worldId: operationContext.worldId }
  } catch (error) {
    await removeTempServerJar(operationContext.paths.serverJarFile)
    const errorMessage = getErrorMessage(error)
    await markSetupError(operationContext.worldId, errorMessage)
    throw error
  }
}

export async function downloadSharedServer(input: DownloadSharedServerInput): Promise<LocalState> {
  if (!input.eulaAccepted) {
    throw new ServerSetupError('Minecraft EULA must be accepted before downloading the server.')
  }

  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.ServerDownload,
    new ServerSetupError('Cannot download a shared server while another storage operation is in progress.'),
    async () => {
      assertNoWorldIsRunning()
      const operationContext = await getSelectedWorldOperationContext()

      return trackSharedServerDownload(operationContext.worldId, (onProgress) =>
        installSharedServer(operationContext, onProgress)
      )
    }
  )
}

async function installSharedServer(
  operationContext: WorldOperationContext,
  onProgress: RestoreServerSaveProgressListener
): Promise<LocalState> {
  const storageSnapshot = await getServerSyncSnapshot(operationContext)
  const latestSave = storageSnapshot.latestSave

  if (!latestSave) {
    throw new ServerSetupError('The active storage provider does not contain a shared server save.')
  }

  if (!isSupportedServerType(latestSave.serverType)) {
    throw new ServerSetupError('This server type is not supported.')
  }

  await validateJavaRuntime(operationContext.world.javaConfig, latestSave.minecraftVersion)
  await markSetupDownloading(operationContext.worldId)

  try {
    await backupServerFolder(
      operationContext.paths.serverFolder,
      operationContext.paths.backupsFolder,
      getSharedServerName(latestSave)
    )

    if (latestSave.serverType === 'fabric') {
      await restoreLatestServerSave(operationContext, storageSnapshot, { initializeServer: true, onProgress })
      return readWorldLocalState(operationContext.worldId)
    }

    const serverConfig: ServerConfig = {
      name: getSharedServerName(latestSave),
      serverType: 'vanilla',
      minecraftVersion: latestSave.minecraftVersion,
      port: operationContext.world.serverConfig.port
    }

    onProgress('installing-server')
    await prepareServerRuntime(operationContext, {
      ...serverConfig,
      serverType: 'vanilla',
      eulaAccepted: true,
      javaConfig: operationContext.world.javaConfig
    })
    await restoreLatestServerSave(operationContext, storageSnapshot, { onProgress })

    return saveWorldRestoredServerSetupResult(operationContext.worldId, serverConfig, {
      status: 'ready',
      errorMessage: null,
      completedAt: new Date().toISOString()
    })
  } catch (error) {
    await markSetupError(operationContext.worldId, getErrorMessage(error))
    throw error
  }
}

async function prepareServer(
  operationContext: WorldOperationContext,
  input: SetupServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<ServerConfig> {
  const { storageAdapter, paths } = operationContext

  await backupServerFolder(paths.serverFolder, paths.backupsFolder, input.name)
  await storageAdapter.resetServerState()

  await prepareServerRuntime(operationContext, input, onProgress)

  return {
    name: input.name.trim(),
    serverType: input.serverType,
    ...(input.serverType === 'fabric' && input.fabric ? { fabric: input.fabric } : {}),
    minecraftVersion: input.minecraftVersion.trim(),
    port: input.port
  }
}

async function prepareServerRuntime(
  operationContext: WorldOperationContext,
  input: SetupServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<void> {
  const { paths } = operationContext

  await installServerDistribution(paths, input, {
    ...(input.minecraftVersionMetadataUrl ? { metadataUrl: input.minecraftVersionMetadataUrl } : {}),
    ...(onProgress ? { onProgress } : {})
  })

  if (input.serverType === 'fabric') {
    await saveFabricBaseline(operationContext, await getFabricFilesFingerprint(paths.serverFolder))
  }

  onProgress?.({ step: Step.WritingProperties })
  await writeServerProperties(paths.serverPropertiesFile, input.port)

  onProgress?.({ step: Step.WritingEula })
  await writeAcceptedEula(paths.serverEulaFile)
}

function validateSetupInput(input: SetupServerInput): void {
  if (!isSupportedServerType(input.serverType)) {
    throw new ServerSetupError('Unsupported server type.')
  }

  if (input.serverType === 'fabric' && !isFabricRuntime(input.fabric)) {
    throw new ServerSetupError('Select a valid Fabric loader and installer.')
  }

  if (!input.eulaAccepted) {
    throw new ServerSetupError('Minecraft EULA must be accepted before setup can continue.')
  }

  if (!input.name.trim()) {
    throw new ServerSetupError('Server name is required.')
  }

  if (!input.minecraftVersion.trim()) {
    throw new ServerSetupError('Minecraft version is required.')
  }

  if (input.minecraftVersionMetadataUrl !== undefined && !input.minecraftVersionMetadataUrl.trim()) {
    throw new ServerSetupError('Minecraft version metadata URL cannot be empty.')
  }

  if (!Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new ServerSetupError('Server port must be between 1 and 65535.')
  }

  if (
    (input.javaConfig.mode === 'custom' && !input.javaConfig.executablePath?.trim()) ||
    (input.javaConfig.mode === 'system' && input.javaConfig.executablePath !== null)
  ) {
    throw new ServerSetupError('Invalid Java selection.')
  }
}

function assertNoWorldIsRunning(): void {
  if (getServerRuntimeSnapshot().runningWorldId) {
    throw new ServerSetupError('Stop the running Minecraft server before changing server setup.')
  }
}

function markSetupDownloading(worldId: WorldId): Promise<LocalState> {
  return saveWorldServerSetupState(worldId, {
    status: 'downloading',
    errorMessage: null,
    completedAt: null
  })
}

function markSetupReady(worldId: WorldId, serverConfig: ServerConfig): Promise<LocalState> {
  return saveWorldServerSetupResult(worldId, serverConfig, {
    status: 'ready',
    errorMessage: null,
    completedAt: new Date().toISOString()
  })
}

function markSetupError(worldId: WorldId, errorMessage: string): Promise<LocalState> {
  return saveWorldServerSetupState(worldId, {
    status: 'error',
    errorMessage,
    completedAt: null
  })
}

async function removeTempServerJar(serverJarFilePath: string): Promise<void> {
  try {
    await unlink(getServerJarTempFilePath(serverJarFilePath))
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function getServerJarTempFilePath(serverJarFilePath: string): string {
  return `${serverJarFilePath}.tmp`
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown setup error.'
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
