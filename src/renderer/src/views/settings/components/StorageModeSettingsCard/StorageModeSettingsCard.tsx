import './StorageModeSettingsCard.css'

import { useState } from 'react'
import {
  CloudStorageProvider,
  StorageSwitchDataMode,
  type CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import Toast from '../../../../components/shared/Toast/Toast'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import GoogleDriveStoragePanel from '../GoogleDriveStoragePanel/GoogleDriveStoragePanel'
import LocalStoragePanel from '../LocalStoragePanel/LocalStoragePanel'
import StorageProviderOption from '../StorageProviderOption/StorageProviderOption'
import StorageProviderSwitchDialog from '../StorageProviderSwitchDialog/StorageProviderSwitchDialog'
import { STORAGE_MODE_INFO } from './storage-mode-settings.constants'
import { storageProviderHasData } from '../../settings-helpers'

function StorageModeSettingsCard(): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const [selectedProvider, setSelectedProvider] = useState<CloudStorageProvider | null>(null)
  const [switchTargetProvider, setSwitchTargetProvider] = useState<CloudStorageProvider | null>(null)
  const activeProvider = storage.activeStorageProvider
  const displayedProvider = selectedProvider ?? activeProvider
  const isLoading = activeProvider === null

  const cancelProviderSwitch = (): void => {
    setSwitchTargetProvider(null)
    storage.resetStorageProviderSwitchPreview()
    storage.dismissStorageError()
  }

  const finishProviderSwitch = (didSwitch: boolean): void => {
    if (!didSwitch) {
      return
    }

    setSelectedProvider(null)
    setSwitchTargetProvider(null)
    storage.resetStorageProviderSwitchPreview()
  }

  const beginProviderActivation = async (provider: CloudStorageProvider): Promise<void> => {
    const preview = await storage.requestStorageProviderSwitchPreview(provider)

    if (!preview) {
      setSwitchTargetProvider(provider)
      return
    }

    if (targetCanBeActivatedWithoutChoice(preview)) {
      const didSwitch = await storage.requestStorageProviderSwitch(
        provider,
        StorageSwitchDataMode.UseTargetAsIs
      )
      finishProviderSwitch(didSwitch)
      return
    }

    setSwitchTargetProvider(provider)
  }

  const activateTargetProvider = async (): Promise<void> => {
    if (!switchTargetProvider) {
      return
    }

    const didSwitch = await storage.requestStorageProviderSwitch(
      switchTargetProvider,
      StorageSwitchDataMode.UseTargetAsIs
    )
    finishProviderSwitch(didSwitch)
  }

  const copyCurrentDataToTargetProvider = async (): Promise<void> => {
    if (!switchTargetProvider || !storage.storageProviderSwitchPreview) {
      return
    }

    const didSwitch = await storage.requestStorageProviderSwitch(
      switchTargetProvider,
      StorageSwitchDataMode.CopyCurrentToTarget,
      storage.storageProviderSwitchPreview
    )
    finishProviderSwitch(didSwitch)
  }

  const retryProviderSwitch = (): void => {
    if (switchTargetProvider) {
      storage.requestStorageProviderSwitchPreview(switchTargetProvider)
    }
  }

  return (
    <Card as="article" className="settings-storage-card">
      {storage.operationState.errorMessage !== null && switchTargetProvider === null && (
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

      {isLoading && storage.operationState.errorMessage !== null && (
        <div className="settings-storage-actions">
          <Button
            fullWidth
            disabled={storage.operationState.isBusy}
            icon="refresh"
            onClick={storage.requestStorageProviderSettingsLoad}
          >
            Retry loading storage settings
          </Button>
        </div>
      )}

      {!isLoading && (
        <>
          <div className="settings-storage-options" aria-label="Storage provider">
            <StorageProviderOption
              icon="hard_drive"
              isSelected={displayedProvider === CloudStorageProvider.Local}
              label="Local"
              provider={CloudStorageProvider.Local}
              onSelect={setSelectedProvider}
            />
            <StorageProviderOption
              describedBy="settings-cloud-switch-note"
              icon="cloud"
              isSelected={displayedProvider === CloudStorageProvider.GoogleDrive}
              label="Google Drive"
              provider={CloudStorageProvider.GoogleDrive}
              onSelect={setSelectedProvider}
            />
          </div>

          {displayedProvider === CloudStorageProvider.Local && (
            <LocalStoragePanel onActivate={() => beginProviderActivation(CloudStorageProvider.Local)} />
          )}
          {displayedProvider === CloudStorageProvider.GoogleDrive && (
            <GoogleDriveStoragePanel
              onActivate={() => beginProviderActivation(CloudStorageProvider.GoogleDrive)}
            />
          )}

          {switchTargetProvider && (
            <StorageProviderSwitchDialog
              errorMessage={storage.operationState.errorMessage}
              operation={storage.operationState.operation}
              preview={storage.storageProviderSwitchPreview}
              progress={storage.storageProviderCopyProgress}
              onActivateTarget={activateTargetProvider}
              onCancel={cancelProviderSwitch}
              onCopyCurrentData={copyCurrentDataToTargetProvider}
              onRetry={retryProviderSwitch}
            />
          )}
        </>
      )}
    </Card>
  )
}

function targetCanBeActivatedWithoutChoice(preview: CloudStorageProviderSwitchPreview): boolean {
  return !storageProviderHasData(preview.source) && storageProviderHasData(preview.target)
}

export default StorageModeSettingsCard
