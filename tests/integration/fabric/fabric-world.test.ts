import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadLatestSharedSave,
  getServerRuntimeSnapshot,
  startMinecraftServer,
  stopMinecraftServer
} from '../../../src/main/server-runtime/server-runtime-service'
import { getFabricVersionOptions } from '../../../src/main/server-setup/fabric-version-resolver'
import { downloadSharedServer, setupNewServer } from '../../../src/main/server-setup/server-setup-service'
import { getFabricGameJarFile } from '../../../src/main/storage/core/support/storage-paths'
import { getSelectedWorldContext, type WorldContext } from '../../../src/main/storage/core/world-context'
import {
  readLocalState,
  savePlayer,
  saveWorldLocalSaveVersion,
  saveWorldServerSetupState
} from '../../../src/main/storage/persistence/local-state-store'
import { confirmSaveDownload } from '../../../src/main/storage/server-save/confirm-save-download'
import { FabricSaveConflictError } from '../../../src/main/storage/server-save/fabric-save-conflict'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import type { ServerSaveConflict } from '../../../src/shared/server-save'
import { GOOGLE_TEST_ACCOUNTS } from '../../support/google-drive/google-drive-test-environment'
import {
  LATEST_FABRIC_RUNTIME,
  TEST_FABRIC_RUNTIME,
  getFabricLauncherDownloadCount
} from '../support/minecraft/fabric-meta-mock-handlers'
import {
  TEST_MINECRAFT_METADATA_URL,
  TEST_MINECRAFT_VERSION
} from '../support/minecraft/minecraft-download-mock-handlers'
import {
  getMinecraftProcessMock,
  getMinecraftSpawnInvocation,
  resetMinecraftProcessMock
} from '../support/minecraft/minecraft-process-mock'

const PUBLISHED_LEVEL_DATA = 'published level'

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  const processMock = await import('../support/minecraft/minecraft-process-mock')

  return {
    ...actual,
    execFile: processMock.inspectJavaProcess,
    spawn: processMock.spawnMinecraftProcess
  }
})

describe('Fabric worlds', () => {
  beforeEach(resetMinecraftProcessMock)

  it('recommends the latest stable Fabric versions and keeps older releases selectable', async () => {
    await expect(getFabricVersionOptions(TEST_MINECRAFT_VERSION)).resolves.toEqual({
      loaders: [LATEST_FABRIC_RUNTIME.loaderVersion, TEST_FABRIC_RUNTIME.loaderVersion],
      installerVersion: LATEST_FABRIC_RUNTIME.installerVersion
    })
  })

  it('creates a Fabric server with launcher, mod folders, and a mod baseline', async () => {
    const { localState } = await setupFabricWorld()
    const { paths } = await getSelectedWorldContext()

    expect(localState.serverConfig).toMatchObject({ serverType: 'fabric', fabric: TEST_FABRIC_RUNTIME })
    expect(getFabricLauncherDownloadCount()).toBe(1)
    await expect(stat(paths.serverJarFile)).resolves.toMatchObject({ size: expect.any(Number) })
    await expect(stat(paths.serverModsFolder)).resolves.toMatchObject({})
    await expect(stat(paths.serverConfigFolder)).resolves.toMatchObject({})
    await expect(readFile(paths.fabricBaselineFile, 'utf8')).resolves.toContain('fingerprint')
  })

  it('downloads the Minecraft server jar before launching the Fabric launcher', async () => {
    const { paths } = await publishFabricWorldWithMods()

    await startMinecraftServer()

    await expect(
      stat(getFabricGameJarFile(paths.serverFolder, TEST_MINECRAFT_VERSION))
    ).resolves.toMatchObject({ size: expect.any(Number) })
    expect(getMinecraftSpawnInvocation().options.cwd).toBe(paths.serverFolder)
    expect(getServerRuntimeSnapshot().logs.map(({ message }) => message)).toContain(
      `Downloading the Minecraft ${TEST_MINECRAFT_VERSION} server for Fabric...`
    )

    await stopRunningServer()
  })

  it('restores the shared save without asking when local mods are unchanged', async () => {
    const context = await publishFabricWorldWithMods()
    await writeFile(join(context.paths.serverWorldFolder, 'level.dat'), 'unpublished level')
    await writeFile(context.paths.serverPropertiesFile, 'difficulty=easy')
    await saveWorldLocalSaveVersion(context.worldId, null)

    await downloadLatestSharedSave()

    await expect(readFile(context.paths.serverPropertiesFile, 'utf8')).resolves.toContain('difficulty=hard')

    await expect(readFile(join(context.paths.serverWorldFolder, 'level.dat'), 'utf8')).resolves.toBe(
      PUBLISHED_LEVEL_DATA
    )
    await expect(readdir(context.paths.serverModsFolder)).resolves.toEqual(['shared-mod.jar'])
    await expect(readLocalState()).resolves.toMatchObject({ localSaveVersion: 1 })
    expect(getFabricLauncherDownloadCount()).toBe(1)
  })

  it('asks before replacing changed local mods and restores after confirmation', async () => {
    const context = await publishFabricWorldWithMods()
    await replaceLocalMod(context, 'local-mod.jar')
    await saveWorldLocalSaveVersion(context.worldId, null)

    const conflict = await getSaveConflict(downloadLatestSharedSave())

    expect(conflict).toMatchObject({ worldId: context.worldId, saveVersion: 1 })
    await expect(readdir(context.paths.serverModsFolder)).resolves.toEqual(['local-mod.jar'])

    await confirmSaveDownload(conflict.token)

    await expect(readdir(context.paths.serverModsFolder)).resolves.toEqual(['shared-mod.jar'])
    await expect(readLocalState()).resolves.toMatchObject({ localSaveVersion: 1 })
  })

  it('rejects a confirmation when local mods change again before it is used', async () => {
    const context = await publishFabricWorldWithMods()
    await replaceLocalMod(context, 'local-mod.jar')
    await saveWorldLocalSaveVersion(context.worldId, null)
    const conflict = await getSaveConflict(downloadLatestSharedSave())

    await replaceLocalMod(context, 'another-mod.jar')

    await expect(confirmSaveDownload(conflict.token)).rejects.toThrow('Local files changed')
    await expect(readdir(context.paths.serverModsFolder)).resolves.toEqual(['another-mod.jar'])
    await expect(confirmSaveDownload(conflict.token)).rejects.toThrow('confirmation expired')
  })

  it('downloads a shared Fabric server pinned to versions that are no longer the latest', async () => {
    const context = await publishFabricWorldWithMods()
    await saveWorldServerSetupState(context.worldId, {
      status: 'not-configured',
      errorMessage: null,
      completedAt: null
    })

    const localState = await downloadSharedServer({ eulaAccepted: true })

    expect(localState).toMatchObject({
      serverConfig: { serverType: 'fabric', fabric: TEST_FABRIC_RUNTIME },
      serverSetup: { status: 'ready' },
      localSaveVersion: 1
    })
    expect(getFabricLauncherDownloadCount()).toBe(2)
    await expect(readdir(context.paths.serverModsFolder)).resolves.toEqual(['shared-mod.jar'])
    await expect(readFile(context.paths.serverEulaFile, 'utf8')).resolves.toContain('eula=true')
    await expect(readdir(context.paths.backupsFolder)).resolves.toHaveLength(1)
    expect(getServerRuntimeSnapshot()).toMatchObject({ status: 'stopped', runtimeWorldId: context.worldId })
    expect(getServerRuntimeSnapshot().logs.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        'Downloading the shared server.',
        'Downloading the shared save...',
        'Verifying the shared save...',
        'Installing the server runtime...',
        'Replacing local server files...',
        'Shared server is ready to host.'
      ])
    )
  })
})

async function stopRunningServer(): Promise<void> {
  getMinecraftProcessMock().emitReady()
  await vi.waitFor(() => expect(getServerRuntimeSnapshot().status).toBe('running'))
  await stopMinecraftServer()
  await vi.waitFor(() => expect(getServerRuntimeSnapshot().status).toBe('stopped'))
}

async function setupFabricWorld(): ReturnType<typeof setupNewServer> {
  await savePlayer(GOOGLE_TEST_ACCOUNTS.owner.session.player)

  return setupNewServer({
    serverType: 'fabric',
    fabric: TEST_FABRIC_RUNTIME,
    eulaAccepted: true,
    minecraftVersion: TEST_MINECRAFT_VERSION,
    minecraftVersionMetadataUrl: TEST_MINECRAFT_METADATA_URL,
    name: 'Fabric Test World',
    port: 25571,
    javaConfig: { mode: 'system', executablePath: null }
  })
}

async function publishFabricWorldWithMods(): Promise<WorldContext> {
  await setupFabricWorld()
  const context = await getSelectedWorldContext()

  await mkdir(context.paths.serverWorldFolder, { recursive: true })
  await writeFile(join(context.paths.serverWorldFolder, 'level.dat'), PUBLISHED_LEVEL_DATA)
  await writeFile(join(context.paths.serverModsFolder, 'shared-mod.jar'), 'shared mod')
  await writeFile(join(context.paths.serverConfigFolder, 'shared-mod.json'), '{}')
  await writeFile(context.paths.serverPropertiesFile, 'difficulty=hard')
  await publishServerSave()

  return context
}

async function replaceLocalMod(context: WorldContext, modFileName: string): Promise<void> {
  await rm(context.paths.serverModsFolder, { recursive: true, force: true })
  await mkdir(context.paths.serverModsFolder)
  await writeFile(join(context.paths.serverModsFolder, modFileName), modFileName)
}

async function getSaveConflict(operation: Promise<unknown>): Promise<ServerSaveConflict> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason
  )

  if (!(error instanceof FabricSaveConflictError)) {
    throw new Error('Expected the download to require confirmation.')
  }

  return error.conflict
}
