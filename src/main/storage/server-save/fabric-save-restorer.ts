import { validateJavaRuntime } from '../../java-runtime/java-runtime-service'
import { writeServerProperties, writeAcceptedEula } from '../../server-setup/server-configuration'
import { randomUUID } from 'crypto'
import { mkdir, rm, lstat, writeFile } from 'fs/promises'
import { join } from 'path'
import { renameWithRetry } from '../core/support/file-system-utils'
import { isFabricRuntime } from '../../../shared/fabric'
import type { ServerConfig, ServerStorageSnapshot } from '../../../shared/domain'
import { installFabricRuntime } from '../../server-setup/server-distribution'
import type { WorldOperationContext } from '../core/world-operation-context'
import { getServerFilePaths } from '../core/support/storage-paths'
import { StorageError } from '../core/support/storage-error'
import { saveWorldRestoredSave } from '../persistence/local-state-store'
import { extractFabricSavePackage } from './fabric-save-package'
import { getFabricFilesFingerprint } from './fabric-local-files'
import { assertFabricFilesCanBeReplaced } from './fabric-save-conflict'
import { isMissingFile } from './save-file-inventory'

const REPLACED_ENTRIES = ['world', 'mods', 'config', 'server.jar', '.fabric-baseline.json'] as const

export interface FabricRestoreOptions {
  confirmedFingerprint?: string
  initializeServer?: boolean
}

export async function restoreFabricServerSave(
  context: WorldOperationContext,
  snapshot: ServerStorageSnapshot,
  options: FabricRestoreOptions = {}
): Promise<void> {
  const latestSave = snapshot.latestSave
  if (!latestSave || latestSave.serverType !== 'fabric' || !isFabricRuntime(latestSave.fabric))
    throw new StorageError('A Fabric save is required.')
  const fingerprint = await assertFabricFilesCanBeReplaced(context, latestSave, options)
  const staging = join(context.paths.backupsFolder, `.restore-${randomUUID()}`)
  const extracted = join(staging, 'server')
  const archive = join(staging, 'world.zip')
  const config: ServerConfig = {
    ...snapshot.localState.serverConfig,
    name: options.initializeServer
      ? (latestSave.serverName ?? 'Shared Minecraft Server')
      : snapshot.localState.serverConfig.name,
    serverType: 'fabric',
    minecraftVersion: latestSave.minecraftVersion,
    fabric: latestSave.fabric
  }
  await mkdir(extracted, { recursive: true })
  try {
    await validateJavaRuntime(snapshot.localState.javaConfig, latestSave.minecraftVersion)
    await context.storageAdapter.downloadWorld(archive)
    const baseline = await extractFabricSavePackage(archive, extracted, context, latestSave)
    const serverPaths = getServerFilePaths(extracted)
    await installFabricRuntime(serverPaths, config)
    if (options.initializeServer) {
      await writeServerProperties(serverPaths.serverPropertiesFile, config.port)
      await writeAcceptedEula(serverPaths.serverEulaFile)
    }
    await writeFile(
      join(extracted, '.fabric-baseline.json'),
      JSON.stringify({ fingerprint: baseline }),
      'utf8'
    )
    const currentSave = await context.storageAdapter.readLatestSave()
    if (JSON.stringify(currentSave) !== JSON.stringify(latestSave)) {
      throw new StorageError('The shared save changed during download. Download again.')
    }
    if ((await getFabricFilesFingerprint(context.paths.serverFolder)) !== fingerprint) {
      throw new StorageError('Local mods or configuration changed during download. Download again.')
    }
    const entries = options.initializeServer
      ? [...REPLACED_ENTRIES, 'server.properties', 'eula.txt']
      : REPLACED_ENTRIES
    await replaceFabricServerFiles(context, extracted, entries, async () => {
      const serverSetup = options.initializeServer
        ? { status: 'ready' as const, errorMessage: null, completedAt: new Date().toISOString() }
        : undefined
      await saveWorldRestoredSave(context.worldId, config, latestSave.saveVersion, serverSetup)
    })
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function replaceFabricServerFiles(
  context: WorldOperationContext,
  source: string,
  entries: readonly string[],
  commit: () => Promise<void>
): Promise<void> {
  const backup = join(context.paths.backupsFolder, `fabric-before-restore-${Date.now()}-${randomUUID()}`)
  await mkdir(backup, { recursive: true })
  await mkdir(context.paths.serverFolder, { recursive: true })
  const previous: string[] = []
  const installed: string[] = []
  try {
    for (const name of entries) {
      const target = join(context.paths.serverFolder, name)
      if (await entryExists(target)) {
        await renameWithRetry(target, join(backup, name))
        previous.push(name)
      }
      await renameWithRetry(join(source, name), target)
      installed.push(name)
    }
    await commit()
  } catch (error) {
    try {
      for (const name of installed.reverse()) {
        await rm(join(context.paths.serverFolder, name), { recursive: true, force: true })
      }
      for (const name of previous.reverse()) {
        await renameWithRetry(join(backup, name), join(context.paths.serverFolder, name))
      }
    } catch (rollbackError) {
      throw new StorageError(
        `Restore failed and rollback could not finish. Recover the server from ${backup}. ${String(rollbackError)}`
      )
    }
    throw error
  }
}

async function entryExists(path: string): Promise<boolean> {
  return lstat(path)
    .then(() => true)
    .catch((error: unknown) => {
      if (isMissingFile(error)) return false
      throw error
    })
}
