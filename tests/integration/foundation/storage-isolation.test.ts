import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOCAL_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import {
  createWorld,
  readLocalStateSnapshot,
  writeLocalState
} from '../../../src/main/storage/persistence/local-state-store'
import { getWorldContext } from '../../../src/main/storage/core/world-context'
import {
  createGoogleDriveStorageAdapter,
  deleteGoogleDriveWorldFilesIfOwned
} from '../../../src/main/storage/adapters/google-drive-storage-adapter'
import { createLocalStorageAdapter } from '../../../src/main/storage/adapters/local-storage-adapter'
import { ServerLockStatus, type LatestSave } from '../../../src/shared/domain'
import { integrationTestDataPath } from '../support/integration-test-storage'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS,
  googleDriveTestEnvironment
} from '../../support/google-drive/google-drive-test-environment'
import { createDefaultLocalWorldState } from '../../../src/main/storage/core/support/storage-defaults'
import { createWorldContext } from '../../../src/main/storage/core/world-context'

const DEVELOPMENT_LOCAL_STATE_PATH = resolve('localState.json')
const TEST_PLAYER = {
  id: 'integration-test-player',
  displayName: 'Integration Test',
  email: 'integration-test@example.com',
  avatarUrl: null,
  avatarInitials: 'IT'
}
const WORLD_A_ID = 'c3a765cc-ef4a-4398-88d8-c60835540859'
const WORLD_B_ID = 'ee1a5480-bf99-4f2f-84f1-327c4807af6f'

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('integration test storage', () => {
  it('writes through the real store without changing development data', async () => {
    const developmentStateBefore = await readOptionalFile(DEVELOPMENT_LOCAL_STATE_PATH)

    await writeLocalState({
      ...DEFAULT_LOCAL_STATE,
      player: TEST_PLAYER
    })

    const snapshot = await readLocalStateSnapshot()

    expect(snapshot.paths.localStateFile).toBe(join(integrationTestDataPath, 'localState.json'))
    expect(snapshot.localState.player).toEqual(TEST_PLAYER)
    expect(await readOptionalFile(DEVELOPMENT_LOCAL_STATE_PATH)).toEqual(developmentStateBefore)
  })

  it('isolates local control and world files by world ID', async () => {
    await createWorld(WORLD_A_ID)
    await createWorld(WORLD_B_ID)
    const [contextA, contextB] = await Promise.all([getWorldContext(WORLD_A_ID), getWorldContext(WORLD_B_ID)])
    const adapterA = createLocalStorageAdapter(contextA)
    const adapterB = createLocalStorageAdapter(contextB)
    const sourceA = join(integrationTestDataPath, 'source-a.zip')
    const sourceB = join(integrationTestDataPath, 'source-b.zip')

    await Promise.all([writeFile(sourceA, 'world-a'), writeFile(sourceB, 'world-b')])
    await adapterA.writeLatestSave(createLatestSave(1))
    await adapterB.writeLatestSave(createLatestSave(7))
    await Promise.all([adapterA.uploadWorld(sourceA), adapterB.uploadWorld(sourceB)])

    await expect(adapterA.readLatestSave()).resolves.toMatchObject({ saveVersion: 1 })
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
    await expect(readFile(contextA.paths.storageWorldFile, 'utf8')).resolves.toBe('world-a')
    await expect(readFile(contextB.paths.storageWorldFile, 'utf8')).resolves.toBe('world-b')
    await expect(readControlWorldId(contextA.paths.storageControlFile)).resolves.toBe(WORLD_A_ID)
    await expect(readControlWorldId(contextB.paths.storageControlFile)).resolves.toBe(WORLD_B_ID)

    await adapterA.resetServerSaves()

    await expect(adapterA.worldFileExists()).resolves.toBe(false)
    await expect(adapterB.worldFileExists()).resolves.toBe(true)
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })

    await writeFile(contextA.paths.storageControlFile, await readFile(contextB.paths.storageControlFile))
    await expect(adapterA.readLatestSave()).rejects.toThrow('Invalid data shape')
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
  })

  it('refuses to overwrite a stable Drive world file from another folder', async () => {
    googleDriveTestEnvironment.setActiveAccount('owner')
    const foreignWorldFile = googleDriveTestEnvironment.createFile('owner', {
      mimeType: 'application/zip',
      name: 'world.zip',
      parents: ['foreign-world-folder']
    })

    if (!foreignWorldFile?.id) {
      throw new Error('Expected the mocked foreign world file to be created.')
    }

    googleDriveTestEnvironment.uploadFile('owner', foreignWorldFile.id, 'foreign-world', false)
    const sourceWorldFile = join(integrationTestDataPath, 'replacement-world.zip')
    await mkdir(integrationTestDataPath, { recursive: true })
    await writeFile(sourceWorldFile, 'replacement-world')
    const world = {
      ...createDefaultLocalWorldState(GOOGLE_TEST_IDS.world),
      googleDrive: {
        configuredAt: '2026-07-29T12:00:00.000Z',
        folderId: GOOGLE_TEST_IDS.folder,
        ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
        validatedAt: '2026-07-29T12:00:00.000Z',
        worldFileIds: {
          controlFileId: GOOGLE_TEST_IDS.controlFile,
          worldFileId: foreignWorldFile.id
        }
      }
    }
    const adapter = createGoogleDriveStorageAdapter(createWorldContext(world))

    await expect(adapter.uploadWorld(sourceWorldFile)).rejects.toThrow('does not match')
    expect(googleDriveTestEnvironment.getFileContent('owner', foreignWorldFile.id)).toBe('foreign-world')
  })

  it('keeps reads, publishes, and deletion isolated between two Drive worlds', async () => {
    googleDriveTestEnvironment.setActiveAccount('owner')
    const driveWorldA = createDriveWorld(WORLD_A_ID, 1)
    const driveWorldB = createDriveWorld(WORLD_B_ID, 7)
    const replacementWorld = join(integrationTestDataPath, 'drive-world-a.zip')
    await mkdir(integrationTestDataPath, { recursive: true })
    await writeFile(replacementWorld, 'updated-world-a')

    await expect(driveWorldA.adapter.readServerSyncData()).resolves.toMatchObject({
      latestSave: { saveVersion: 1 }
    })
    await expect(driveWorldB.adapter.readServerSyncData()).resolves.toMatchObject({
      latestSave: { saveVersion: 7 }
    })

    await driveWorldA.adapter.writeLatestSave(createLatestSave(2))
    await driveWorldA.adapter.uploadWorld(replacementWorld)

    await expect(driveWorldA.adapter.readLatestSave()).resolves.toMatchObject({ saveVersion: 2 })
    await expect(driveWorldB.adapter.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
    expect(googleDriveTestEnvironment.getFileContent('owner', driveWorldB.worldFileId)).toBe(
      'world-ee1a5480-bf99-4f2f-84f1-327c4807af6f'
    )

    await deleteGoogleDriveWorldFilesIfOwned(driveWorldA.context)

    expect(googleDriveTestEnvironment.getFileContent('owner', driveWorldA.controlFileId)).toBeNull()
    expect(googleDriveTestEnvironment.getFileContent('owner', driveWorldA.worldFileId)).toBeNull()
    await expect(driveWorldB.adapter.readServerSyncData()).resolves.toMatchObject({
      latestSave: { saveVersion: 7 },
      worldFileExists: true
    })
  })
})

function createDriveWorld(
  worldId: string,
  saveVersion: number
): {
  adapter: ReturnType<typeof createGoogleDriveStorageAdapter>
  context: ReturnType<typeof createWorldContext>
  controlFileId: string
  worldFileId: string
} {
  const folder = googleDriveTestEnvironment.createFile('owner', {
    mimeType: 'application/vnd.google-apps.folder',
    name: `Folder ${worldId}`
  })
  const controlFile = googleDriveTestEnvironment.createFile('owner', {
    mimeType: 'application/json',
    name: 'control.json',
    parents: [requireFileId(folder)]
  })
  const worldFile = googleDriveTestEnvironment.createFile('owner', {
    mimeType: 'application/zip',
    name: 'world.zip',
    parents: [requireFileId(folder)]
  })
  const controlFileId = requireFileId(controlFile)
  const worldFileId = requireFileId(worldFile)
  googleDriveTestEnvironment.uploadFile(
    'owner',
    controlFileId,
    JSON.stringify({
      formatVersion: 1,
      worldId,
      latestSave: createLatestSave(saveVersion),
      serverLock: { status: ServerLockStatus.Unlocked },
      storageMutation: null
    }),
    false
  )
  googleDriveTestEnvironment.uploadFile('owner', worldFileId, `world-${worldId}`, false)

  const world = {
    ...createDefaultLocalWorldState(worldId),
    googleDrive: {
      configuredAt: '2026-07-29T12:00:00.000Z',
      folderId: requireFileId(folder),
      ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
      validatedAt: '2026-07-29T12:00:00.000Z',
      worldFileIds: { controlFileId, worldFileId }
    }
  }
  const context = createWorldContext(world)

  return {
    adapter: createGoogleDriveStorageAdapter(context),
    context,
    controlFileId,
    worldFileId
  }
}

function requireFileId(file: { id?: string | null } | null): string {
  if (!file?.id) {
    throw new Error('Expected the mocked Drive file to be created.')
  }

  return file.id
}

function createLatestSave(saveVersion: number): Exclude<LatestSave, null> {
  return {
    minecraftVersion: '1.21.8',
    saveVersion,
    serverName: `World ${saveVersion}`,
    serverType: 'vanilla' as const,
    uploadedAt: '2026-07-28T12:00:00.000Z',
    uploadedBy: TEST_PLAYER
  }
}

async function readControlWorldId(controlFilePath: string): Promise<string> {
  const control = JSON.parse(await readFile(controlFilePath, 'utf8')) as { worldId: string }

  return control.worldId
}

async function readOptionalFile(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}
