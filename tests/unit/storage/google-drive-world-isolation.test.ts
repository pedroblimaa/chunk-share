import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGoogleDriveStorageAdapter,
  deleteGoogleDriveWorldFilesIfOwned
} from '../../../src/main/storage/adapters/google-drive-storage-adapter'
import {
  createDefaultLocalWorldState,
  createDefaultStorageControl
} from '../../../src/main/storage/core/support/storage-defaults'
import { createWorldContext } from '../../../src/main/storage/core/world-context'
import type { WorldContext } from '../../../src/main/storage/core/world-context'
import type { LatestSave } from '../../../src/shared/domain'

const WORLD_A_ID = 'c3a765cc-ef4a-4398-88d8-c60835540859'
const WORLD_B_ID = 'ee1a5480-bf99-4f2f-84f1-327c4807af6f'
const CONTROL_A_ID = 'drive-control-a'
const CONTROL_B_ID = 'drive-control-b'
const WORLD_FILE_A_ID = `world-file-${WORLD_A_ID}`
const WORLD_FILE_B_ID = `world-file-${WORLD_B_ID}`

const driveMock = vi.hoisted(() => ({
  controls: new Map<string, string>(),
  deletedFileIds: [] as string[],
  metadata: new Map<
    string,
    {
      capabilities: { canDownload: boolean; canEdit: boolean }
      id: string
      mimeType: string
      name: string
      ownedByMe: boolean
      parents: string[]
      trashed: boolean
    }
  >(),
  fetch: vi.fn(async (url: string, options?: { method?: string }) => {
    const fileId = decodeURIComponent(url.match(/files\/([^?]+)/)?.[1] ?? '')

    if (options?.method === 'DELETE') {
      driveMock.deletedFileIds.push(fileId)
      return { data: {} }
    }

    return { data: driveMock.metadata.get(fileId) ?? {} }
  }),
  request: vi.fn(async (request: { data?: unknown; method?: string; url: string }) => {
    const fileId = decodeURIComponent(request.url.match(/files\/([^?]+)/)?.[1] ?? '')

    if (request.method === 'PATCH') {
      driveMock.controls.set(fileId, String(request.data))
      return { data: {} }
    }

    return { data: driveMock.controls.get(fileId) ?? '' }
  })
}))

vi.mock('../../../src/main/auth/auth-service', () => ({
  ensureGoogleDriveAuthSession: vi.fn(async () => ({
    player: { id: 'test-player' },
    tokens: {}
  }))
}))

vi.mock('../../../src/main/auth/google-oauth-client', () => ({
  createAuthenticatedGoogleOAuthClient: vi.fn(() => ({
    fetch: driveMock.fetch,
    request: driveMock.request
  }))
}))

describe('Google Drive world isolation', () => {
  beforeEach(() => {
    driveMock.fetch.mockClear()
    driveMock.request.mockClear()
    driveMock.controls.clear()
    driveMock.deletedFileIds.length = 0
    driveMock.metadata.clear()
    driveMock.controls.set(
      CONTROL_A_ID,
      JSON.stringify({
        ...createDefaultStorageControl(WORLD_A_ID),
        latestSave: createLatestSave(1)
      })
    )
    driveMock.controls.set(
      CONTROL_B_ID,
      JSON.stringify({
        ...createDefaultStorageControl(WORLD_B_ID),
        latestSave: createLatestSave(7)
      })
    )
    saveDriveMetadata(CONTROL_A_ID, WORLD_A_ID, 'control.json', 'application/json')
    saveDriveMetadata(CONTROL_B_ID, WORLD_B_ID, 'control.json', 'application/json')
    saveDriveMetadata(WORLD_FILE_A_ID, WORLD_A_ID, 'world.zip', 'application/zip')
    saveDriveMetadata(WORLD_FILE_B_ID, WORLD_B_ID, 'world.zip', 'application/zip')
  })

  it('reads and updates only the control file bound to its world context', async () => {
    const adapterA = createGoogleDriveStorageAdapter(createDriveWorldContext(WORLD_A_ID, CONTROL_A_ID))
    const adapterB = createGoogleDriveStorageAdapter(createDriveWorldContext(WORLD_B_ID, CONTROL_B_ID))

    await expect(adapterA.readLatestSave()).resolves.toMatchObject({ saveVersion: 1 })
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
    await adapterA.writeLatestSave(createLatestSave(2))

    await expect(adapterA.readLatestSave()).resolves.toMatchObject({ saveVersion: 2 })
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
    expect(JSON.parse(driveMock.controls.get(CONTROL_A_ID) ?? '{}')).toMatchObject({
      worldId: WORLD_A_ID
    })
    expect(JSON.parse(driveMock.controls.get(CONTROL_B_ID) ?? '{}')).toMatchObject({
      worldId: WORLD_B_ID
    })

    driveMock.controls.set(CONTROL_A_ID, driveMock.controls.get(CONTROL_B_ID) ?? '')

    await expect(adapterA.readLatestSave()).rejects.toThrow('Invalid data shape')
    await expect(adapterB.readLatestSave()).resolves.toMatchObject({ saveVersion: 7 })
  })

  it('rejects server sync data from a control file belonging to another world', async () => {
    const adapterA = createGoogleDriveStorageAdapter(createDriveWorldContext(WORLD_A_ID, CONTROL_A_ID))
    driveMock.controls.set(CONTROL_A_ID, driveMock.controls.get(CONTROL_B_ID) ?? '')

    await expect(adapterA.readServerSyncData()).rejects.toThrow('belong to a different world')
  })

  it('does not delete configured Drive files when the control belongs to another world', async () => {
    const contextA = createDriveWorldContext(WORLD_A_ID, CONTROL_A_ID)
    driveMock.controls.set(CONTROL_A_ID, driveMock.controls.get(CONTROL_B_ID) ?? '')

    await expect(deleteGoogleDriveWorldFilesIfOwned(contextA)).rejects.toThrow('belong to a different world')
    expect(driveMock.deletedFileIds).toEqual([])
  })
})

function createDriveWorldContext(worldId: string, controlFileId: string): WorldContext {
  const world = {
    ...createDefaultLocalWorldState(worldId),
    googleDrive: {
      configuredAt: '2026-07-28T12:00:00.000Z',
      folderId: `folder-${worldId}`,
      ownerAccountId: 'test-player',
      validatedAt: '2026-07-28T12:00:00.000Z',
      worldFileIds: {
        controlFileId,
        worldFileId: `world-file-${worldId}`
      }
    }
  }

  return createWorldContext(world)
}

function createLatestSave(saveVersion: number): Exclude<LatestSave, null> {
  return {
    minecraftVersion: '1.21.8',
    saveVersion,
    serverName: `World ${saveVersion}`,
    serverType: 'vanilla' as const,
    uploadedAt: '2026-07-28T12:00:00.000Z',
    uploadedBy: {
      avatarInitials: 'TP',
      avatarUrl: null,
      displayName: 'Test Player',
      email: 'test@example.com',
      id: 'test-player'
    }
  }
}

function saveDriveMetadata(fileId: string, worldId: string, name: string, mimeType: string): void {
  driveMock.metadata.set(fileId, {
    capabilities: { canDownload: true, canEdit: true },
    id: fileId,
    mimeType,
    name,
    ownedByMe: true,
    parents: [`folder-${worldId}`],
    trashed: false
  })
}
