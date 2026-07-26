import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { setupVanillaServer } from '../../../src/main/server-setup/server-setup-service'
import { writeLocalState } from '../../../src/main/storage/persistence/local-state-store'
import { localServerFolderPath } from '../../../src/main/storage/core/support/storage-paths'
import { DEFAULT_LOCAL_STATE } from '../../../src/main/storage/core/support/storage-defaults'
import { GOOGLE_TEST_ACCOUNTS } from '../../support/google-drive/google-drive-test-environment'
import {
  TEST_MINECRAFT_METADATA_URL,
  TEST_MINECRAFT_VERSION
} from './minecraft/minecraft-download-mock-handlers'

export const TEST_WORLD_NAME = 'Integration Test World'
export const TEST_WORLD_PORT = 25570
export const TEST_WORLD_DATA = 'integration test level data'

export async function createLocalTestWorld(): Promise<void> {
  await writeLocalState({
    ...DEFAULT_LOCAL_STATE,
    player: GOOGLE_TEST_ACCOUNTS.owner.session.player
  })

  await setupVanillaServer({
    eulaAccepted: true,
    minecraftVersion: TEST_MINECRAFT_VERSION,
    minecraftVersionMetadataUrl: TEST_MINECRAFT_METADATA_URL,
    name: TEST_WORLD_NAME,
    port: TEST_WORLD_PORT
  })

  const worldFolderPath = join(localServerFolderPath, 'world')
  await mkdir(worldFolderPath, { recursive: true })
  await writeFile(join(worldFolderPath, 'level.dat'), TEST_WORLD_DATA)
}
