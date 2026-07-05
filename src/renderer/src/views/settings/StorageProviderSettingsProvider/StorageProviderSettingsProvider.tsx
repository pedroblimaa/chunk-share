import { StorageProviderSettingsContext } from '../storage-provider-settings-context'
import { useStorageProviderSettingsController } from '../hooks/useStorageProviderSettingsController'
import type { StorageProviderSettingsProviderProps } from '../settings.model'

function StorageProviderSettingsProvider({
  children
}: StorageProviderSettingsProviderProps): React.JSX.Element {
  const controller = useStorageProviderSettingsController()

  return (
    <StorageProviderSettingsContext.Provider value={controller}>
      {children}
    </StorageProviderSettingsContext.Provider>
  )
}

export default StorageProviderSettingsProvider
