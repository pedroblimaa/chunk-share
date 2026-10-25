import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { createGoogleDriveMockHandlers } from './support/google-drive/google-drive-mock-handlers'
import { googleDriveTestEnvironment } from '../support/google-drive/google-drive-test-environment'
import {
  createFabricMetaMockHandlers,
  resetFabricLauncherDownloadCount
} from './support/minecraft/fabric-meta-mock-handlers'
import { createMinecraftDownloadMockHandlers } from './support/minecraft/minecraft-download-mock-handlers'
import {
  cleanIntegrationTestStorage,
  configureIntegrationTestStorage
} from './support/integration-test-storage'

const integrationMockServer = setupServer(
  ...createGoogleDriveMockHandlers(),
  ...createMinecraftDownloadMockHandlers(),
  ...createFabricMetaMockHandlers()
)

configureIntegrationTestStorage()
process.env.CHUNKSHARE_GOOGLE_CLIENT_ID = 'integration-test-client-id'
process.env.CHUNKSHARE_GOOGLE_CLIENT_SECRET = 'integration-test-client-secret'

beforeAll(() => {
  integrationMockServer.listen({ onUnhandledRequest: 'error' })
})

beforeEach(async () => {
  integrationMockServer.resetHandlers()
  resetFabricLauncherDownloadCount()
  googleDriveTestEnvironment.reset()
  await cleanIntegrationTestStorage()
})

afterAll(async () => {
  integrationMockServer.close()
  await cleanIntegrationTestStorage()
})
