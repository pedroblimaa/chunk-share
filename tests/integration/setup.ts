import { afterAll, beforeEach } from 'vitest'
import {
  cleanIntegrationTestStorage,
  configureIntegrationTestStorage
} from './support/integration-test-storage'

configureIntegrationTestStorage()

beforeEach(cleanIntegrationTestStorage)
afterAll(cleanIntegrationTestStorage)
