import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { createGoogleDriveMockHandlers } from './support/google-drive-mock-handlers'
import { googleDriveTestEnvironment } from './support/google-drive-test-environment'
import {
  cleanIntegrationTestStorage,
  configureIntegrationTestStorage
} from './support/integration-test-storage'

const googleDriveMockServer = setupServer(...createGoogleDriveMockHandlers())

configureIntegrationTestStorage()
process.env.CHUNKSHARE_GOOGLE_CLIENT_ID = 'integration-test-client-id'
process.env.CHUNKSHARE_GOOGLE_CLIENT_SECRET = 'integration-test-client-secret'

beforeAll(() => {
  googleDriveMockServer.listen({ onUnhandledRequest: 'error' })
})

beforeEach(async () => {
  googleDriveMockServer.resetHandlers()
  googleDriveTestEnvironment.reset()
  await cleanIntegrationTestStorage()
})

afterAll(async () => {
  googleDriveMockServer.close()
  await cleanIntegrationTestStorage()
})
