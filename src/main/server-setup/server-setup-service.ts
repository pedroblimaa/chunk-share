import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import type { LocalState, ServerConfig } from '../../shared/domain'
import type { WorldId } from '../../shared/world'
import { getServerRuntimeSnapshot } from '../server-runtime/server-runtime-service'
import {
  ServerSetupProgressStep as Step,
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupVanillaServerInput
} from '../../shared/server-setup'
import {
  saveWorldRestoredServerSetupResult,
  saveWorldServerSetupResult,
  saveWorldServerSetupState
} from '../storage/persistence/local-state-store'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { runExclusiveStorageOperation } from '../storage/core/operations/operation-coordinator'
import { ExclusiveStorageOperation } from '../../shared/storage-operation'
import { backupServerFolder } from '../storage/server-save/server-folder-backup'
import { restoreLatestServerSave } from '../storage/server-save/server-save-restorer'
import {
  createNewWorldOperationContext,
  getOrCreateSelectedWorldOperationContext,
  getSelectedWorldOperationContext,
  type WorldOperationContext
} from '../storage/core/world-operation-context'
import { ServerSetupError } from './server-setup-error'
import { resolveVanillaServerDownload } from './vanilla-version-resolver'
import { validateJavaRuntime } from '../java-runtime/java-runtime-service'
import { saveWorldJavaConfig } from '../storage/persistence/local-state-store'

const DEFAULT_LEVEL_NAME = 'world'
const DEFAULT_MOTD = 'ChunkShare Minecraft Server'
type ServerSetupProgressListener = (event: ServerSetupProgressEvent) => void

export async function setupVanillaServer(
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<LocalState> {
  return runVanillaServerSetupOperation(input, onProgress, getOrCreateSelectedWorldOperationContext)
}

export async function setupNewVanillaServer(
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<LocalState> {
  return runVanillaServerSetupOperation(input, onProgress, createNewWorldOperationContext)
}

function runVanillaServerSetupOperation(
  input: SetupVanillaServerInput,
  onProgress: ServerSetupProgressListener | undefined,
  getOperationContext: () => Promise<WorldOperationContext>
): Promise<LocalState> {
  validateSetupInput(input)

  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.ServerSetup,
    new ServerSetupError('Cannot set up a server while another storage operation is in progress.'),
    async () => {
      assertNoWorldIsRunning()
      await validateJavaRuntime(input.javaConfig, input.minecraftVersion, input.minecraftVersionMetadataUrl)
      return runVanillaServerSetup(input, onProgress, getOperationContext)
    }
  )
}

async function runVanillaServerSetup(
  input: SetupVanillaServerInput,
  onProgress: ServerSetupProgressListener | undefined,
  getOperationContext: () => Promise<WorldOperationContext>
): Promise<LocalState> {
  const operationContext = await getOperationContext()

  await saveWorldJavaConfig(operationContext.worldId, input.javaConfig)

  await markSetupDownloading(operationContext.worldId)

  try {
    const serverConfig = await prepareVanillaServer(operationContext, input, onProgress)
    const localState = await markSetupReady(operationContext.worldId, serverConfig)
    onProgress?.({ step: Step.Ready })

    return localState
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
      return runSharedServerDownload(await getSelectedWorldOperationContext())
    }
  )
}

async function runSharedServerDownload(operationContext: WorldOperationContext): Promise<LocalState> {
  const storageSnapshot = await getServerSyncSnapshot(operationContext)
  const latestSave = storageSnapshot.latestSave

  if (!latestSave) {
    throw new ServerSetupError('The active storage provider does not contain a shared server save.')
  }

  if (latestSave.serverType !== 'vanilla') {
    throw new ServerSetupError('Only shared Vanilla servers can be downloaded in this version.')
  }

  await validateJavaRuntime(operationContext.world.javaConfig, latestSave.minecraftVersion)
  await markSetupDownloading(operationContext.worldId)

  try {
    const serverConfig: ServerConfig = {
      name: latestSave.serverName ?? 'Shared Minecraft Server',
      serverType: latestSave.serverType,
      minecraftVersion: latestSave.minecraftVersion,
      port: operationContext.world.serverConfig.port
    }
    const setupInput: SetupVanillaServerInput = {
      ...serverConfig,
      eulaAccepted: true,
      javaConfig: operationContext.world.javaConfig
    }

    await backupServerFolder(
      operationContext.paths.serverFolder,
      operationContext.paths.backupsFolder,
      serverConfig.name
    )
    await prepareVanillaServerRuntime(operationContext, setupInput)
    await restoreLatestServerSave(operationContext, storageSnapshot)

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

async function prepareVanillaServer(
  operationContext: WorldOperationContext,
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<ServerConfig> {
  onProgress?.({ step: Step.CreatingFolder })
  const { storageAdapter, paths } = operationContext

  await backupServerFolder(paths.serverFolder, paths.backupsFolder, input.name)
  await storageAdapter.resetServerSaves()
  await storageAdapter.resetServerLock()

  await prepareVanillaServerRuntime(operationContext, input, onProgress)

  return {
    name: input.name.trim(),
    serverType: 'vanilla',
    minecraftVersion: input.minecraftVersion.trim(),
    port: input.port
  }
}

async function prepareVanillaServerRuntime(
  operationContext: WorldOperationContext,
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<void> {
  const { paths } = operationContext
  const serverJarTempFilePath = getServerJarTempFilePath(paths.serverJarFile)

  await mkdir(paths.serverFolder, { recursive: true })

  onProgress?.({ step: Step.ResolvingVersion })
  const serverDownload = await resolveVanillaServerDownload(
    input.minecraftVersion,
    input.minecraftVersionMetadataUrl
  )

  onProgress?.({ step: Step.DownloadingJar })
  await downloadServerJar(serverDownload.serverJarUrl, serverJarTempFilePath)

  onProgress?.({ step: Step.VerifyingJar })
  await verifyServerJar(serverJarTempFilePath, serverDownload.size, serverDownload.sha1)
  await rename(serverJarTempFilePath, paths.serverJarFile)

  onProgress?.({ step: Step.WritingProperties })
  await writeServerProperties(paths.serverPropertiesFile, input)

  onProgress?.({ step: Step.WritingEula })
  await writeAcceptedEula(paths.serverEulaFile)
}

function validateSetupInput(input: SetupVanillaServerInput): void {
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

async function downloadServerJar(serverJarUrl: string, serverJarTempFilePath: string): Promise<void> {
  let response: Response

  try {
    response = await fetch(serverJarUrl)
  } catch (error) {
    throw new ServerSetupError(`Unable to download Minecraft server jar: ${getErrorMessage(error)}`)
  }

  if (!response.ok) {
    throw new ServerSetupError(`Unable to download Minecraft server jar. Received HTTP ${response.status}.`)
  }

  if (!response.body) {
    throw new ServerSetupError('Minecraft server jar response did not include a body.')
  }

  await pipeline(
    Readable.fromWeb(response.body as NodeReadableStream),
    createWriteStream(serverJarTempFilePath)
  )
}

async function verifyServerJar(
  serverJarTempFilePath: string,
  expectedSize: number,
  expectedSha1: string
): Promise<void> {
  const fileStats = await stat(serverJarTempFilePath)

  if (fileStats.size !== expectedSize) {
    throw new ServerSetupError(
      `Downloaded server jar has unexpected size. Expected ${expectedSize} bytes, received ${fileStats.size} bytes.`
    )
  }

  const serverJar = await readFile(serverJarTempFilePath)
  const actualSha1 = createHash('sha1').update(serverJar).digest('hex')

  if (actualSha1 !== expectedSha1) {
    throw new ServerSetupError('Downloaded server jar failed integrity verification.')
  }
}

async function writeServerProperties(
  serverPropertiesFilePath: string,
  input: SetupVanillaServerInput
): Promise<void> {
  const properties = [
    '# Generated by ChunkShare.',
    `server-port=${input.port}`,
    `level-name=${DEFAULT_LEVEL_NAME}`,
    `motd=${DEFAULT_MOTD}`,
    'online-mode=false',
    'enable-command-block=false',
    'spawn-protection=16'
  ].join('\n')

  await writeFile(serverPropertiesFilePath, `${properties}\n`, 'utf-8')
}

async function writeAcceptedEula(serverEulaFilePath: string): Promise<void> {
  const eula = ['# Accepted through ChunkShare setup wizard.', 'eula=true'].join('\n')

  await writeFile(serverEulaFilePath, `${eula}\n`, 'utf-8')
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
