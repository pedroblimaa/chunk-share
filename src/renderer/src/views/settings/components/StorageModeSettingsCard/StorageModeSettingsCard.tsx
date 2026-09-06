import './StorageModeSettingsCard.css'

import { useState } from 'react'
import {
  CloudStorageProvider,
  StorageSwitchDataMode,
  type CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import InfoTooltip from '../../../../components/shared/InfoTooltip/InfoTooltip'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Toast from '../../../../components/shared/Toast/Toast'
import { getErrorMessage } from '../../../../utils/error-message'
import { storageProviderHasData } from '../../settings-helpers'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import GoogleDriveStoragePanel from '../GoogleDriveStoragePanel/GoogleDriveStoragePanel'
import LocalStoragePanel from '../LocalStoragePanel/LocalStoragePanel'
import StorageProviderOption from '../StorageProviderOption/StorageProviderOption'
import StorageProviderSwitchDialog from '../StorageProviderSwitchDialog/StorageProviderSwitchDialog'
import type { StorageModeSettingsCardProps } from './StorageModeSettingsCard.model'
import { STORAGE_MODE_INFO } from './storage-mode-settings.constants'
import { ExclusiveStorageOperation } from '../../../../../../shared/storage-operation'

function StorageModeSettingsCard({
  onStorageProviderChange
}: StorageModeSettingsCardProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const [selectedProvider, setSelectedProvider] = useState<CloudStorageProvider | null>(null)
  const [switchTargetProvider, setSwitchTargetProvider] = useState<CloudStorageProvider | null>(null)
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(null)
  const activeProvider = storage.activeStorageProvider
  const displayedProvider = selectedProvider ?? activeProvider
  const isLoading = activeProvider === null
  const storageErrorMessage = storage.operationState.errorMessage ?? refreshErrorMessage
  const blockingMessage = getBlockingStorageOperationMessage(storage.operationState.blockingOperation)

  const cancelProviderSwitch = (): void => {
    setSwitchTargetProvider(null)
    setRefreshErrorMessage(null)
    storage.resetStorageProviderSwitchPreview()
    storage.dismissStorageError()
  }

  const finishProviderSwitch = async (didSwitch: boolean): Promise<void> => {
    if (!didSwitch) {
      return
    }

    setSelectedProvider(null)
    setSwitchTargetProvider(null)
    storage.resetStorageProviderSwitchPreview()

    try {
      await onStorageProviderChange()
    } catch (error: unknown) {
      setRefreshErrorMessage(
        getErrorMessage(error, 'Storage provider changed, but the server list did not refresh.')
      )
    }
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
      await finishProviderSwitch(didSwitch)
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
    await finishProviderSwitch(didSwitch)
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
    await finishProviderSwitch(didSwitch)
  }

  const retryProviderSwitch = (): void => {
    if (switchTargetProvider) {
      storage.requestStorageProviderSwitchPreview(switchTargetProvider)
    }
  }

  return (
    <Card as="article" className="settings-storage-card">
      {storageErrorMessage !== null && switchTargetProvider === null && (
        <Toast
          message={storageErrorMessage}
          title="Storage update failed"
          tone="error"
          onClose={cancelProviderSwitch}
        />
      )}

      <div className="settings-card-heading settings-storage-heading">
        <div>
          <MaterialIcon name="folder" />
          <h2>Storage Mode</h2>
        </div>
        <InfoTooltip ariaLabel="About storage mode" content={STORAGE_MODE_INFO} placement="left" />
      </div>

      {blockingMessage && (
        <p className="settings-storage-note" role="status">
          {blockingMessage}
        </p>
      )}

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

function getBlockingStorageOperationMessage(operation: ExclusiveStorageOperation | null): string | null {
  switch (operation) {
    case ExclusiveStorageOperation.ServerDelete:
      return 'Server removal is still finishing. Storage settings will unlock automatically.'
    case ExclusiveStorageOperation.ServerDownload:
      return 'A server download is still finishing. Storage settings will unlock automatically.'
    case ExclusiveStorageOperation.ServerSetup:
      return 'Server setup is still finishing. Storage settings will unlock automatically.'
    case ExclusiveStorageOperation.ServerStart:
      return 'Minecraft startup is still finishing. Storage settings will unlock automatically.'
    case ExclusiveStorageOperation.StorageSettingsChange:
      return 'Another storage settings update is still finishing.'
    case null:
      return null
  }
}

export default StorageModeSettingsCard
