import { randomUUID } from 'crypto'
import { lstat, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  LatestSave,
  ServerConfig,
  ServerSetupState,
  ServerStorageSnapshot
} from '../../../shared/domain'
import { isFabricRuntime, type FabricRuntime } from '../../../shared/fabric'
import { getSharedServerName } from '../../../shared/server-save'
import { validateJavaRuntime } from '../../java-runtime/java-runtime-service'
import {
  localizeSharedServerProperties,
  writeAcceptedEula,
  writeServerProperties
} from '../../server-setup/server-configuration'
import { installFabricRuntime } from '../../server-setup/server-distribution'
import { renameWithRetry } from '../core/support/file-system-utils'
import { StorageError } from '../core/support/storage-error'
import { getServerFilePaths } from '../core/support/storage-paths'
import type { WorldOperationContext } from '../core/world-operation-context'
import { saveWorldRestoredSave } from '../persistence/local-state-store'
import { getFabricFilesFingerprint } from './fabric-local-files'
import { assertFabricFilesCanBeReplaced } from './fabric-save-conflict'
import { extractFabricSavePackage } from './fabric-save-package'
import { isMissingFile } from './save-file-inventory'
import { SERVER_PROPERTIES_FILE_NAME } from './server-save-layout'
import type { RestoreServerSaveOptions } from './server-save-restore.model'

const REPLACED_ENTRIES = ['world', 'mods', 'config', '.fabric-baseline.json'] as const
const LAUNCHER_ENTRY = 'server.jar'
const EULA_ENTRY = 'eula.txt'

export async function restoreFabricServerSave(
  context: WorldOperationContext,
  snapshot: ServerStorageSnapshot,
  options: RestoreServerSaveOptions = {}
): Promise<void> {
  const { latestSave, localState } = snapshot

  if (latestSave?.serverType !== 'fabric' || !isFabricRuntime(latestSave.fabric)) {
    throw new StorageError('A Fabric save is required.')
  }

  const fingerprint = await assertFabricFilesCanBeReplaced(context, latestSave, options.confirmedFingerprint)
  const config = getRestoredServerConfig(localState.serverConfig, latestSave, latestSave.fabric, options)
  const shouldInstallLauncher =
    options.initializeServer === true ||
    !hasSameFabricRuntime(localState.serverConfig, config) ||
    !(await entryExists(context.paths.serverJarFile))
  const staging = join(context.paths.backupsFolder, `.restore-${randomUUID()}`)
  const extractedFolder = join(staging, 'server')
  const archive = join(staging, 'world.zip')

  await mkdir(extractedFolder, { recursive: true })

  try {
    await validateJavaRuntime(localState.javaConfig, latestSave.minecraftVersion)
    options.onProgress?.('downloading')
    await context.storageAdapter.downloadWorld(archive)

    options.onProgress?.('extracting')

    const baseline = await extractFabricSavePackage(archive, extractedFolder, context.worldId, latestSave)
    const serverPaths = getServerFilePaths(extractedFolder)

    if (shouldInstallLauncher) {
      options.onProgress?.('installing-server')
      await installFabricRuntime(serverPaths, config)
    }

    const hasSharedProperties = await localizeSharedServerProperties(
      serverPaths.serverPropertiesFile,
      context.paths.serverPropertiesFile,
      config.port
    )

    if (options.initializeServer && !hasSharedProperties) {
      await writeServerProperties(serverPaths.serverPropertiesFile, config.port)
    }

    if (options.initializeServer) {
      await writeAcceptedEula(serverPaths.serverEulaFile)
    }

    await writeFile(serverPaths.fabricBaselineFile, JSON.stringify({ fingerprint: baseline }), 'utf8')
    await assertRestoreSourcesUnchanged(context, latestSave, fingerprint)

    const entries = [
      ...REPLACED_ENTRIES,
      ...(shouldInstallLauncher ? [LAUNCHER_ENTRY] : []),
      ...(hasSharedProperties || options.initializeServer ? [SERVER_PROPERTIES_FILE_NAME] : []),
      ...(options.initializeServer ? [EULA_ENTRY] : [])
    ]

    const serverSetup: ServerSetupState | undefined = options.initializeServer
      ? { status: 'ready', errorMessage: null, completedAt: new Date().toISOString() }
      : undefined

    options.onProgress?.('replacing-files')
    await replaceFabricServerFiles(context, extractedFolder, entries, async () => {
      await saveWorldRestoredSave(context.worldId, config, latestSave.saveVersion, serverSetup)
    })
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

function getRestoredServerConfig(
  localConfig: ServerConfig,
  latestSave: NonNullable<LatestSave>,
  fabric: FabricRuntime,
  options: RestoreServerSaveOptions
): ServerConfig {
  return {
    ...localConfig,
    name: options.initializeServer ? getSharedServerName(latestSave) : localConfig.name,
    serverType: 'fabric',
    minecraftVersion: latestSave.minecraftVersion,
    fabric
  }
}

function hasSameFabricRuntime(localConfig: ServerConfig, restoredConfig: ServerConfig): boolean {
  return (
    localConfig.serverType === 'fabric' &&
    localConfig.minecraftVersion === restoredConfig.minecraftVersion &&
    localConfig.fabric?.loaderVersion === restoredConfig.fabric?.loaderVersion &&
    localConfig.fabric?.installerVersion === restoredConfig.fabric?.installerVersion
  )
}

async function assertRestoreSourcesUnchanged(
  context: WorldOperationContext,
  latestSave: NonNullable<LatestSave>,
  localFingerprint: string
): Promise<void> {
  const [currentSave, currentFingerprint] = await Promise.all([
    context.storageAdapter.readLatestSave(),
    getFabricFilesFingerprint(context.paths.serverFolder)
  ])

  if (JSON.stringify(currentSave) !== JSON.stringify(latestSave)) {
    throw new StorageError('The shared save changed during download. Download again.')
  }

  if (currentFingerprint !== localFingerprint) {
    throw new StorageError('Local mods or configuration changed during download. Download again.')
  }
}

async function replaceFabricServerFiles(
  context: WorldOperationContext,
  sourceFolder: string,
  entries: readonly string[],
  commit: () => Promise<void>
): Promise<void> {
  const { serverFolder, backupsFolder } = context.paths
  const backupFolder = join(backupsFolder, `fabric-before-restore-${Date.now()}-${randomUUID()}`)
  const backedUpEntries: string[] = []
  const installedEntries: string[] = []

  await mkdir(serverFolder, { recursive: true })

  try {
    for (const entry of entries) {
      const target = join(serverFolder, entry)

      if (await entryExists(target)) {
        await mkdir(backupFolder, { recursive: true })
        await renameWithRetry(target, join(backupFolder, entry))
        backedUpEntries.push(entry)
      }

      await renameWithRetry(join(sourceFolder, entry), target)
      installedEntries.push(entry)
    }

    await commit()
  } catch (error) {
    await rollbackReplacedEntries(serverFolder, backupFolder, installedEntries, backedUpEntries)
    throw error
  }
}

async function rollbackReplacedEntries(
  serverFolder: string,
  backupFolder: string,
  installedEntries: string[],
  backedUpEntries: string[]
): Promise<void> {
  try {
    for (const entry of installedEntries.reverse()) {
      await rm(join(serverFolder, entry), { recursive: true, force: true })
    }

    for (const entry of backedUpEntries.reverse()) {
      await renameWithRetry(join(backupFolder, entry), join(serverFolder, entry))
    }
  } catch (rollbackError) {
    throw new StorageError(
      `Restore failed and rollback could not finish. Recover the server from ${backupFolder}. ${String(rollbackError)}`
    )
  }
}

async function entryExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissingFile(error)) {
      return false
    }

    throw error
  }
}
