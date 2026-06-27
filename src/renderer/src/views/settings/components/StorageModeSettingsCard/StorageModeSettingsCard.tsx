import './StorageModeSettingsCard.css'

import { useState } from 'react'
import {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  GoogleDriveSetupStatus
} from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import Toast from '../../../../components/shared/Toast/Toast'
import GoogleDriveDisconnectChoice from '../GoogleDriveDisconnectChoice/GoogleDriveDisconnectChoice'
import StorageProviderSwitchPanel from '../StorageProviderSwitchPanel/StorageProviderSwitchPanel'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../../settings.model'
import type { StorageModeProvider, StorageModeSettingsCardProps } from './StorageModeSettingsCard.model'

const STORAGE_MODE_INFO =
  'ChunkShare can store shared saves locally or in the configured Google Drive folder.'
const CLOUD_SWITCH_NOTE =
  'Google Drive must be configured and validated before it can become the active storage provider.'

function StorageModeSettingsCard({
  storageErrorMessage,
  storageProviderSwitchPreview,
  storageProviderSettings,
  activeStorageOperation,
  storageIsBusy,
  googleDriveStatusViewMap,
  onCancelStorageProviderSwitch,
  onClearGoogleDriveFolder,
  onDismissStorageError,
  onPrepareStorageProviderSwitch,
  onSetupDefaultGoogleDriveFolder,
  onSwitchStorageProvider,
  onValidateGoogleDriveFolder
}: StorageModeSettingsCardProps): React.JSX.Element {
  const activeProvider = storageProviderSettings?.activeProvider ?? CloudStorageProvider.Local
  const [selectedProvider, setSelectedProvider] = useState<StorageModeProvider | null>(null)
  const [pendingProvider, setPendingProvider] = useState<StorageModeProvider | null>(null)
  const [googleDriveDisconnectIsPending, setGoogleDriveDisconnectIsPending] = useState(false)
  const displayedProvider = selectedProvider ?? activeProvider
  const effectivePendingProvider = pendingProvider === activeProvider ? null : pendingProvider
  const googleDriveState = storageProviderSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = googleDriveStatusViewMap[googleDriveStatus]
  const googleDriveIsValid = googleDriveStatus === GoogleDriveSetupStatus.Valid
  const localPanelIsSelected = displayedProvider === CloudStorageProvider.Local
  const googleDrivePanelIsSelected = displayedProvider === CloudStorageProvider.GoogleDrive
  const googleDriveCanBeCleared = Boolean(googleDriveState?.folder || googleDriveState?.errorMessage)

  const handleSelectProvider = (provider: StorageModeProvider): void => {
    setSelectedProvider(provider)

    if (provider === activeProvider) {
      cancelProviderSwitch()
      return
    }

    if (provider === CloudStorageProvider.GoogleDrive && !googleDriveIsValid) {
      cancelProviderSwitch()
      return
    }

    setPendingProvider(provider)
    onPrepareStorageProviderSwitch(provider)
  }

  const usePendingProviderData = (): void => {
    if (!pendingProvider) {
      return
    }

    onSwitchStorageProvider(pendingProvider, CloudStorageProviderSwitchDataMode.UseTargetAsIs)
  }

  const replacePendingProviderData = (): void => {
    if (!pendingProvider || !storageProviderSwitchPreview) {
      return
    }

    onSwitchStorageProvider(
      pendingProvider,
      CloudStorageProviderSwitchDataMode.CopyCurrentToTarget,
      storageProviderSwitchPreview
    )
  }

  const cancelProviderSwitch = (): void => {
    setPendingProvider(null)
    onCancelStorageProviderSwitch()
  }

  const retryProviderSwitch = (): void => {
    if (pendingProvider) {
      onPrepareStorageProviderSwitch(pendingProvider)
    }
  }

  const disconnectGoogleDrive = (): void => {
    void onClearGoogleDriveFolder().then((didDisconnect) => {
      if (didDisconnect) {
        setGoogleDriveDisconnectIsPending(false)
      }
    })
  }

  return (
    <Card as="article" className="settings-storage-card">
      {storageErrorMessage ? (
        <Toast
          message={storageErrorMessage}
          title="Storage update failed"
          tone="error"
          onClose={onDismissStorageError}
        />
      ) : null}

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

      <div className="settings-storage-segmented" aria-label="Storage provider">
        <button
          className={getStorageSegmentClassName(
            CloudStorageProvider.Local,
            displayedProvider,
            activeProvider
          )}
          type="button"
          disabled={storageIsBusy}
          aria-pressed={displayedProvider === CloudStorageProvider.Local}
          onClick={() => handleSelectProvider(CloudStorageProvider.Local)}
        >
          <MaterialIcon name="hard_drive" />
          <span>Local</span>
          {activeProvider === CloudStorageProvider.Local ? <small>Active</small> : null}
        </button>
        <button
          className={getStorageSegmentClassName(
            CloudStorageProvider.GoogleDrive,
            displayedProvider,
            activeProvider
          )}
          type="button"
          disabled={storageIsBusy}
          aria-describedby={googleDrivePanelIsSelected ? 'settings-cloud-switch-note' : undefined}
          aria-pressed={displayedProvider === CloudStorageProvider.GoogleDrive}
          onClick={() => handleSelectProvider(CloudStorageProvider.GoogleDrive)}
        >
          <MaterialIcon name="cloud" />
          <span>Google Drive</span>
          {activeProvider === CloudStorageProvider.GoogleDrive ? <small>Active</small> : null}
        </button>
      </div>

      {localPanelIsSelected ? (
        <>
          <div
            className={`settings-storage-panel${
              activeProvider === CloudStorageProvider.Local ? ' is-active' : ''
            }`}
          >
            <div>
              <strong>Local Storage</strong>
              <span>Server saves, locks, and versions are stored on this device.</span>
            </div>
            {activeProvider === CloudStorageProvider.Local ? <Badge dot>Active</Badge> : null}
          </div>

          {effectivePendingProvider === CloudStorageProvider.Local ? (
            <StorageProviderSwitchPanel
              hasError={storageErrorMessage !== null}
              operation={activeStorageOperation}
              preview={storageProviderSwitchPreview}
              onCancel={cancelProviderSwitch}
              onReplace={replacePendingProviderData}
              onRetry={retryProviderSwitch}
              onUseExisting={usePendingProviderData}
            />
          ) : null}
        </>
      ) : null}

      {googleDrivePanelIsSelected ? (
        <>
          {!googleDriveIsValid ? (
            <p className="settings-storage-note" id="settings-cloud-switch-note">
              {CLOUD_SWITCH_NOTE}
            </p>
          ) : null}
          <div
            className={`settings-storage-panel${
              activeProvider === CloudStorageProvider.GoogleDrive ? ' is-active' : ''
            }`}
          >
            <div>
              <strong>Google Drive</strong>
              <span>{googleDriveState?.folder?.folderName ?? 'Shared folder sync'}</span>
            </div>
            {activeProvider === CloudStorageProvider.GoogleDrive ? (
              <Badge dot>Active</Badge>
            ) : (
              <Badge className="settings-pending-badge" tone={googleDriveStatusView.tone}>
                {googleDriveStatusView.label}
              </Badge>
            )}
          </div>

          {googleDriveState?.folder ? (
            <dl className="settings-drive-details">
              <div>
                <dt>Validated</dt>
                <dd>{formatNullableDate(googleDriveState.folder.validatedAt)}</dd>
              </div>
            </dl>
          ) : null}

          {googleDriveState?.errorMessage ? (
            <p className="settings-drive-error">{googleDriveState.errorMessage}</p>
          ) : null}

          {effectivePendingProvider === CloudStorageProvider.GoogleDrive ? (
            <StorageProviderSwitchPanel
              hasError={storageErrorMessage !== null}
              operation={activeStorageOperation}
              preview={storageProviderSwitchPreview}
              onCancel={cancelProviderSwitch}
              onReplace={replacePendingProviderData}
              onRetry={retryProviderSwitch}
              onUseExisting={usePendingProviderData}
            />
          ) : null}

          <div className="settings-drive-actions">
            {googleDriveDisconnectIsPending ? (
              <GoogleDriveDisconnectChoice
                isBusy={activeStorageOperation === StorageSettingsOperation.ClearGoogleDriveFolder}
                switchesToLocal={activeProvider === CloudStorageProvider.GoogleDrive}
                onCancel={() => setGoogleDriveDisconnectIsPending(false)}
                onConfirm={disconnectGoogleDrive}
              />
            ) : (
              <>
                <Button
                  fullWidth
                  disabled={storageIsBusy}
                  icon="create_new_folder"
                  onClick={onSetupDefaultGoogleDriveFolder}
                >
                  {getStorageOperationLabel(
                    activeStorageOperation,
                    StorageSettingsOperation.SetupGoogleDriveFolder,
                    googleDriveState?.folder ? 'Recheck Drive folder' : 'Set up Drive folder'
                  )}
                </Button>

                {googleDriveState?.folder || googleDriveCanBeCleared ? (
                  <div className="settings-drive-secondary-actions">
                    {googleDriveState?.folder ? (
                      <Button
                        fullWidth
                        disabled={storageIsBusy}
                        icon="sync"
                        variant="secondary"
                        onClick={onValidateGoogleDriveFolder}
                      >
                        {getStorageOperationLabel(
                          activeStorageOperation,
                          StorageSettingsOperation.ValidateGoogleDriveFolder,
                          'Validate folder access'
                        )}
                      </Button>
                    ) : null}

                    {googleDriveCanBeCleared ? (
                      <Button
                        fullWidth
                        disabled={storageIsBusy}
                        icon="link_off"
                        variant="ghost"
                        onClick={() => setGoogleDriveDisconnectIsPending(true)}
                      >
                        Disconnect Google Drive
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </Card>
  )
}

function getStorageSegmentClassName(
  provider: StorageModeProvider,
  selectedProvider: StorageModeProvider,
  activeProvider: CloudStorageProvider
): string {
  return [
    'settings-storage-segment',
    selectedProvider === provider ? 'is-selected' : '',
    activeProvider === provider ? 'is-active-provider' : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function getStorageOperationLabel(
  currentOperation: ActiveStorageSettingsOperation,
  targetOperation: StorageSettingsOperation,
  idleLabel: string
): string {
  return currentOperation === targetOperation ? 'Working...' : idleLabel
}

function formatNullableDate(value: string | null): string {
  if (!value) {
    return 'Not validated yet'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

export default StorageModeSettingsCard
