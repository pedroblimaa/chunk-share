import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import type { LocalState, ServerConfig } from '../../shared/domain'
import {
  ServerSetupProgressStep as Step,
  type DownloadSharedServerInput,
  type ServerSetupProgressEvent,
  type SetupVanillaServerInput
} from '../../shared/server-setup'
import {
  saveRestoredServerSetupResult,
  saveServerSetupResult,
  saveServerSetupState
} from '../storage/persistence/local-state-store'
import {
  localServerEulaFilePath,
  localServerFolderPath,
  localServerJarFilePath,
  localServerPropertiesFilePath
} from '../storage/core/support/storage-paths'
import { getActiveStorageAdapter } from '../storage/adapters/storage-adapter-service'
import { getServerSyncSnapshot } from '../server-sync/server-sync-service'
import { runExclusiveStorageOperation } from '../storage/core/operations/operation-coordinator'
import { ExclusiveStorageOperation } from '../storage/core/operations/operation.model'
import { backupServerFolder } from '../storage/server-save/server-folder-backup'
import { restoreLatestServerSave } from '../storage/server-save/server-save-restorer'
import { ServerSetupError } from './server-setup-error'
import { resolveVanillaServerDownload } from './vanilla-version-resolver'

const SERVER_JAR_TEMP_FILE_PATH = `${localServerJarFilePath}.tmp`
const DEFAULT_LEVEL_NAME = 'world'
const DEFAULT_MOTD = 'ChunkShare Minecraft Server'
const DEFAULT_SERVER_PORT = 25565
type ServerSetupProgressListener = (event: ServerSetupProgressEvent) => void

export async function setupVanillaServer(
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<LocalState> {
  validateSetupInput(input)

  await markSetupDownloading()

  try {
    const serverConfig = await prepareVanillaServer(input, onProgress)
    const localState = await markSetupReady(serverConfig)
    onProgress?.({ step: Step.Ready })

    return localState
  } catch (error) {
    await removeTempServerJar()
    const errorMessage = getErrorMessage(error)
    await markSetupError(errorMessage)
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
    () => runSharedServerDownload()
  )
}

async function runSharedServerDownload(): Promise<LocalState> {
  await markSetupDownloading()

  try {
    const storageSnapshot = await getServerSyncSnapshot()
    const latestSave = storageSnapshot.latestSave

    if (!latestSave) {
      throw new ServerSetupError('The active storage provider does not contain a shared server save.')
    }

    if (latestSave.serverType !== 'vanilla') {
      throw new ServerSetupError('Only shared Vanilla servers can be downloaded in this version.')
    }

    await restoreLatestServerSave(storageSnapshot)
    await assertRestoredServerJarExists()
    await writeAcceptedEula()

    return saveRestoredServerSetupResult(
      {
        name: latestSave.serverName ?? 'Shared Minecraft Server',
        serverType: latestSave.serverType,
        minecraftVersion: latestSave.minecraftVersion,
        port: await readServerPort()
      },
      {
        status: 'ready',
        errorMessage: null,
        completedAt: new Date().toISOString()
      }
    )
  } catch (error) {
    await markSetupError(getErrorMessage(error))
    throw error
  }
}

async function prepareVanillaServer(
  input: SetupVanillaServerInput,
  onProgress?: ServerSetupProgressListener
): Promise<ServerConfig> {
  onProgress?.({ step: Step.CreatingFolder })
  const storageAdapter = await getActiveStorageAdapter()

  await backupServerFolder(localServerFolderPath, input.name)
  await storageAdapter.resetServerSaves()
  await storageAdapter.resetServerLock()
  await mkdir(localServerFolderPath, { recursive: true })

  onProgress?.({ step: Step.ResolvingVersion })
  const serverDownload = await resolveVanillaServerDownload(
    input.minecraftVersion,
    input.minecraftVersionMetadataUrl
  )

  onProgress?.({ step: Step.DownloadingJar })
  await downloadServerJar(serverDownload.serverJarUrl)

  onProgress?.({ step: Step.VerifyingJar })
  await verifyServerJar(serverDownload.size, serverDownload.sha1)
  await rename(SERVER_JAR_TEMP_FILE_PATH, localServerJarFilePath)

  onProgress?.({ step: Step.WritingProperties })
  await writeServerProperties(input)

  onProgress?.({ step: Step.WritingEula })
  await writeAcceptedEula()

  return {
    name: input.name.trim(),
    serverType: 'vanilla',
    minecraftVersion: input.minecraftVersion.trim(),
    port: input.port
  }
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
}

async function downloadServerJar(serverJarUrl: string): Promise<void> {
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
    createWriteStream(SERVER_JAR_TEMP_FILE_PATH)
  )
}

async function verifyServerJar(expectedSize: number, expectedSha1: string): Promise<void> {
  const fileStats = await stat(SERVER_JAR_TEMP_FILE_PATH)

  if (fileStats.size !== expectedSize) {
    throw new ServerSetupError(
      `Downloaded server jar has unexpected size. Expected ${expectedSize} bytes, received ${fileStats.size} bytes.`
    )
  }

  const serverJar = await readFile(SERVER_JAR_TEMP_FILE_PATH)
  const actualSha1 = createHash('sha1').update(serverJar).digest('hex')

  if (actualSha1 !== expectedSha1) {
    throw new ServerSetupError('Downloaded server jar failed integrity verification.')
  }
}

async function writeServerProperties(input: SetupVanillaServerInput): Promise<void> {
  const properties = [
    '# Generated by ChunkShare.',
    `server-port=${input.port}`,
    `level-name=${DEFAULT_LEVEL_NAME}`,
    `motd=${DEFAULT_MOTD}`,
    'online-mode=false',
    'enable-command-block=false',
    'spawn-protection=16'
  ].join('\n')

  await writeFile(localServerPropertiesFilePath, `${properties}\n`, 'utf-8')
}

async function assertRestoredServerJarExists(): Promise<void> {
  const serverJarStats = await stat(localServerJarFilePath).catch(() => {
    throw new ServerSetupError('The shared server save does not contain server.jar.')
  })

  if (!serverJarStats.isFile()) {
    throw new ServerSetupError('The shared server save does not contain server.jar.')
  }
}

async function readServerPort(): Promise<number> {
  const properties = await readFile(localServerPropertiesFilePath, 'utf8')
  const port = Number(properties.match(/^server-port=(\d+)$/m)?.[1] ?? DEFAULT_SERVER_PORT)

  return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_SERVER_PORT
}

async function writeAcceptedEula(): Promise<void> {
  const eula = ['# Accepted through ChunkShare setup wizard.', 'eula=true'].join('\n')

  await writeFile(localServerEulaFilePath, `${eula}\n`, 'utf-8')
}

function markSetupDownloading(): Promise<LocalState> {
  return saveServerSetupState({
    status: 'downloading',
    errorMessage: null,
    completedAt: null
  })
}

function markSetupReady(serverConfig: ServerConfig): Promise<LocalState> {
  return saveServerSetupResult(serverConfig, {
    status: 'ready',
    errorMessage: null,
    completedAt: new Date().toISOString()
  })
}

function markSetupError(errorMessage: string): Promise<LocalState> {
  return saveServerSetupState({
    status: 'error',
    errorMessage,
    completedAt: null
  })
}

async function removeTempServerJar(): Promise<void> {
  try {
    await unlink(SERVER_JAR_TEMP_FILE_PATH)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown setup error.'
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
