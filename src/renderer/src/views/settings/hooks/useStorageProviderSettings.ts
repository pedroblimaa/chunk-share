import { useContext } from 'react'
import type { StorageProviderSettingsController } from '../settings.model'
import { StorageProviderSettingsContext } from '../storage-provider-settings-context'

export function useStorageProviderSettings(): StorageProviderSettingsController {
  const controller = useContext(StorageProviderSettingsContext)

  if (!controller) {
    throw new Error('useStorageProviderSettings must be used inside StorageProviderSettingsProvider.')
  }

  return controller
}
