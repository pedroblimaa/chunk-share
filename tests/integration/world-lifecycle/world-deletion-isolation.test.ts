import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudStorageProvider, GoogleDriveSetupStatus } from '../../../src/shared/cloud-storage.model'
import { createDefaultLocalWorldState } from '../../../src/main/storage/core/support/storage-defaults'
import {
  readAppState,
  selectWorld,
  writeAppState
} from '../../../src/main/storage/persistence/local-state-store'
import { deleteConfiguredServer } from '../../../src/main/storage/core/storage-service'
import { createLocalTestWorld } from '../support/world-test-data'
import {
  GOOGLE_TEST_ACCOUNTS,
  GOOGLE_TEST_IDS
} from '../../support/google-drive/google-drive-test-environment'

const WORLD_B_ID = 'ee1a5480-bf99-4f2f-84f1-327c4807af6f'

const driveDeletionGate = vi.hoisted(() => {
  let deletionStarted = false
  let releaseDeletion: (() => void) | null = null
  let reportDeletionStarted: (() => void) | null = null

  return {
    deleteFiles: vi.fn(() => {
      deletionStarted = true
      reportDeletionStarted?.()

      return new Promise<void>((resolve) => {
        releaseDeletion = resolve
      })
    }),
    release(): void {
      releaseDeletion?.()
    },
    reset(): void {
      deletionStarted = false
      releaseDeletion = null
      reportDeletionStarted = null
    },
    waitUntilStarted(): Promise<void> {
      if (deletionStarted) {
        return Promise.resolve()
      }

      return new Promise<void>((resolve) => {
        reportDeletionStarted = resolve
      })
    }
  }
})

vi.mock('../../../src/main/storage/adapters/google-drive-storage-adapter', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../src/main/storage/adapters/google-drive-storage-adapter')
  >()),
  deleteGoogleDriveWorldFilesIfOwned: driveDeletionGate.deleteFiles
}))

vi.mock(
  '../../../src/main/auth/auth-service',
  () => import('../support/google-drive/google-auth-service-mock')
)

describe('world deletion isolation', () => {
  beforeEach(() => {
    driveDeletionGate.reset()
  })

  it('deletes the requested world even if selection changes during Drive deletion', async () => {
    await createLocalTestWorld(GOOGLE_TEST_IDS.world)
    const appState = await readAppState()
    const worldA = appState.worlds.find(({ id }) => id === GOOGLE_TEST_IDS.world)

    if (!worldA) {
      throw new Error('Expected world A to exist.')
    }

    const now = '2026-07-29T12:00:00.000Z'
    await writeAppState({
      ...appState,
      activeProvider: CloudStorageProvider.GoogleDrive,
      googleDrive: {
        errorMessage: null,
        status: GoogleDriveSetupStatus.Valid
      },
      selectedWorldId: worldA.id,
      worlds: [
        {
          ...worldA,
          googleDrive: {
            configuredAt: now,
            folderId: GOOGLE_TEST_IDS.folder,
            ownerAccountId: GOOGLE_TEST_ACCOUNTS.owner.session.player.id,
            validatedAt: now,
            worldFileIds: {
              controlFileId: GOOGLE_TEST_IDS.controlFile,
              worldFileId: GOOGLE_TEST_IDS.worldFile
            }
          }
        },
        createDefaultLocalWorldState(WORLD_B_ID, now)
      ]
    })

    const deletion = deleteConfiguredServer()
    await driveDeletionGate.waitUntilStarted()
    await selectWorld(WORLD_B_ID)
    driveDeletionGate.release()
    await deletion

    const nextState = await readAppState()
    expect(nextState.worlds.map(({ id }) => id)).toEqual([WORLD_B_ID])
    expect(nextState.selectedWorldId).toBe(WORLD_B_ID)
  })
})
