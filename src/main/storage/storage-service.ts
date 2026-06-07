import type { ServerConfig, StorageSnapshot } from '../../shared/domain'
import { readLocalMockCloudSnapshot } from './local-mock-cloud-storage'
import { readLocalStateSnapshot, saveServerConfig } from './local-state-store'

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const [mockCloudSnapshot, localStateSnapshot] = await Promise.all([
    readLocalMockCloudSnapshot(),
    readLocalStateSnapshot()
  ])

  return {
    latestWorld: mockCloudSnapshot.latestWorld,
    serverLock: mockCloudSnapshot.serverLock,
    localState: localStateSnapshot.localState
  }
}

export async function updateServerConfig(serverConfig: ServerConfig): Promise<StorageSnapshot> {
  await saveServerConfig(serverConfig)

  return getStorageSnapshot()
}
