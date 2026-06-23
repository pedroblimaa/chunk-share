import { localStorageAdapter } from './local-storage-adapter'
import type { StorageAdapter } from './storage-adapter.model'

export async function getActiveStorageAdapter(): Promise<StorageAdapter> {
  return localStorageAdapter
}
