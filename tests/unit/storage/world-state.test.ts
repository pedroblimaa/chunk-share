import { describe, expect, it } from 'vitest'
import { CloudStorageProvider } from '../../../src/shared/cloud-storage.model'
import {
  DEFAULT_APP_STATE,
  createDefaultLocalWorldState,
  createDefaultStorageControl
} from '../../../src/main/storage/core/support/storage-defaults'
import {
  isAppState,
  isLocalWorldState,
  isStorageControl
} from '../../../src/main/storage/core/support/storage-validation'

const WORLD_ID = '3f93b975-260f-4e44-ad58-30fb8b9c7769'
const CREATED_AT = '2026-07-28T12:00:00.000Z'

describe('multi-world local state', () => {
  it('creates a valid default world with independent local state', () => {
    const world = createDefaultLocalWorldState(WORLD_ID, CREATED_AT)

    expect(isLocalWorldState(world)).toBe(true)
    expect(world).toMatchObject({
      id: WORLD_ID,
      createdAt: CREATED_AT,
      localSaveVersion: null,
      activeSessionId: null,
      dirty: false,
      googleDrive: null,
      serverSetup: { status: 'not-configured' }
    })
    expect(world.serverConfig).not.toHaveProperty('serverFolderPath')
    expect(world.javaConfig).toEqual({ mode: 'system', executablePath: null })

    const otherWorld = createDefaultLocalWorldState('00000000-0000-4000-8000-000000000002')
    world.javaConfig = { mode: 'custom', executablePath: 'C:\\Java\\bin\\java.exe' }
    expect(otherWorld.javaConfig).toEqual({ mode: 'system', executablePath: null })
  })

  it('accepts an empty catalog and rejects duplicate world IDs', () => {
    expect(isAppState(DEFAULT_APP_STATE)).toBe(true)
    expect(DEFAULT_APP_STATE).not.toHaveProperty('formatVersion')

    const world = createDefaultLocalWorldState(WORLD_ID, CREATED_AT)
    const stateWithDuplicates = {
      player: null,
      selectedWorldId: WORLD_ID,
      activeProvider: CloudStorageProvider.Local,
      googleDrive: DEFAULT_APP_STATE.googleDrive,
      worlds: [world, { ...world }]
    }

    expect(isAppState(stateWithDuplicates)).toBe(false)
  })

  it('stores the stable world ID in its control file', () => {
    const control = createDefaultStorageControl(WORLD_ID)

    expect(isStorageControl(control)).toBe(true)
    expect(control).toMatchObject({
      formatVersion: 1,
      worldId: WORLD_ID,
      latestSave: null,
      storageMutation: null
    })
    expect(control).not.toHaveProperty('javaConfig')
  })
})
