import './StorageModeSettingsCard.css'

import { useState } from 'react'
import {
  CloudStorageProvider,
  GoogleDriveSetupStatus
} from '../../../../../../shared/cloud-storage.model'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import Toast from '../../../../components/shared/Toast/Toast'
import GoogleDriveStoragePanel from '../GoogleDriveStoragePanel/GoogleDriveStoragePanel'
import LocalStoragePanel from '../LocalStoragePanel/LocalStoragePanel'
import StorageProviderOption from '../StorageProviderOption/StorageProviderOption'
import StorageProviderSwitchPanel from '../StorageProviderSwitchPanel/StorageProviderSwitchPanel'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import { STORAGE_MODE_INFO } from './storage-mode-settings.constants'

function StorageModeSettingsCard(): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const [selectedProvider, setSelectedProvider] = useState<CloudStorageProvider | null>(null)
  const [switchTargetProvider, setSwitchTargetProvider] = useState<CloudStorageProvider | null>(
    null
  )
  const activeProvider = storage.activeStorageProvider
  const displayedProvider = selectedProvider ?? activeProvider ?? CloudStorageProvider.Local
  const effectiveSwitchTargetProvider =
    switchTargetProvider === activeProvider ? null : switchTargetProvider
  const googleDriveIsValid =
    storage.storageProviderSettings?.googleDrive.status === GoogleDriveSetupStatus.Valid

  const handleSelectProvider = (provider: CloudStorageProvider): void => {
    setSelectedProvider(provider)

    const isActiveProvider = provider === activeProvider
    const isInvalidGoogleDrive =
      provider === CloudStorageProvider.GoogleDrive && !googleDriveIsValid

    if (isActiveProvider || isInvalidGoogleDrive) {
      cancelProviderSwitch()
      return
    }

    setSwitchTargetProvider(provider)
    storage.requestStorageProviderSwitchPreview(provider)
  }

  const cancelProviderSwitch = (): void => {
    setSwitchTargetProvider(null)
    storage.resetStorageProviderSwitchPreview()
  }

  const retryProviderSwitch = (): void => {
    if (switchTargetProvider) {
      storage.requestStorageProviderSwitchPreview(switchTargetProvider)
    }
  }

  const providerSwitchPanel = (
    <StorageProviderSwitchPanel
      hasError={storage.operationState.errorMessage !== null}
      operation={storage.operationState.operation}
      preview={storage.storageProviderSwitchPreview}
      onActivateTarget={storage.requestStorageProviderSwitch}
      onCancel={cancelProviderSwitch}
      onRetry={retryProviderSwitch}
    />
  )

  return (
    <Card as="article" className="settings-storage-card">
      {storage.operationState.errorMessage !== null && (
        <Toast
          message={storage.operationState.errorMessage}
          title="Storage update failed"
          tone="error"
          onClose={storage.dismissStorageError}
        />
      )}

      <div className="settings-card-heading settings-storage-heading">
        <div>
          <MaterialIcon name="folder" />
          <h2>Storage Mode</h2>
        </div>
        <Tooltip content={STORAGE_MODE_INFO} placement="left">
          <button className="settings-info-button" type="button" aria-label="About storage mode">
            <MaterialIcon name="info" />
          </button>
        </Tooltip>
      </div>

      <div className="settings-storage-options" aria-label="Storage provider">
        <StorageProviderOption
          icon="hard_drive"
          isSelected={displayedProvider === CloudStorageProvider.Local}
          label="Local"
          provider={CloudStorageProvider.Local}
          onSelect={handleSelectProvider}
        />
        <StorageProviderOption
          describedBy="settings-cloud-switch-note"
          icon="cloud"
          isSelected={displayedProvider === CloudStorageProvider.GoogleDrive}
          label="Google Drive"
          provider={CloudStorageProvider.GoogleDrive}
          onSelect={handleSelectProvider}
        />
      </div>

      {displayedProvider === CloudStorageProvider.Local && (
        <LocalStoragePanel>
          {effectiveSwitchTargetProvider === CloudStorageProvider.Local && providerSwitchPanel}
        </LocalStoragePanel>
      )}

      {displayedProvider === CloudStorageProvider.GoogleDrive && (
        <GoogleDriveStoragePanel>
          {effectiveSwitchTargetProvider === CloudStorageProvider.GoogleDrive &&
            providerSwitchPanel}
        </GoogleDriveStoragePanel>
      )}
    </Card>
  )
}

export default StorageModeSettingsCard
