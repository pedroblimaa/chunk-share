import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_STATE } from '../../src/main/storage/core/support/storage-defaults'
import { readLocalStateSnapshot, writeLocalState } from '../../src/main/storage/persistence/local-state-store'
import { integrationTestDataPath } from './support/integration-test-storage'

const DEVELOPMENT_LOCAL_STATE_PATH = resolve('localState.json')
const TEST_PLAYER = {
  id: 'integration-test-player',
  displayName: 'Integration Test',
  email: 'integration-test@example.com',
  avatarUrl: null,
  avatarInitials: 'IT'
}

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
})

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
