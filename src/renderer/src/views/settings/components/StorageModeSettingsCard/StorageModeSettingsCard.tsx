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
import StorageProviderSwitchDialog from '../StorageProviderSwitchDialog/StorageProviderSwitchDialog'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../../settings.model'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import type { StorageModeProvider } from './StorageModeSettingsCard.model'
import { GOOGLE_DRIVE_STATUS_VIEW } from './storage-mode-settings.constants'

const STORAGE_MODE_INFO =
  'ChunkShare can store shared saves locally or in the configured Google Drive folder.'
const CLOUD_SWITCH_NOTE =
  'Google Drive must be configured and validated before it can become the active storage provider.'

function StorageModeSettingsCard(): React.JSX.Element {
  const {
    storageErrorMessage,
    storageProviderCopyProgress,
    storageProviderSwitchPreview,
    storageProviderSettings,
    activeStorageOperation,
    storageIsBusy,
    cancelStorageProviderSwitch,
    clearGoogleDriveFolder,
    dismissStorageError,
    loadStorageSwitchPreview,
    setupDefaultGoogleDriveFolder,
    switchStorageProvider
  } = useStorageProviderSettings()
  const activeProvider = storageProviderSettings?.activeProvider ?? CloudStorageProvider.Local
  const [selectedProvider, setSelectedProvider] = useState<StorageModeProvider | null>(null)
  const [pendingProvider, setPendingProvider] = useState<StorageModeProvider | null>(null)
  const [googleDriveDisconnectIsPending, setGoogleDriveDisconnectIsPending] = useState(false)
  const displayedProvider = selectedProvider ?? activeProvider
  const googleDriveState = storageProviderSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = GOOGLE_DRIVE_STATUS_VIEW[googleDriveStatus]
  const googleDriveIsValid = googleDriveStatus === GoogleDriveSetupStatus.Valid
  const googleDriveIsActive = activeProvider === CloudStorageProvider.GoogleDrive
  const googleDriveCanBeActivated = googleDriveIsValid && !googleDriveIsActive
  const localPanelIsSelected = displayedProvider === CloudStorageProvider.Local
  const googleDrivePanelIsSelected = displayedProvider === CloudStorageProvider.GoogleDrive
  const googleDriveCanBeCleared = Boolean(googleDriveState?.folder || googleDriveState?.errorMessage)
  const googleDrivePrimaryButtonLabel = getGoogleDrivePrimaryButtonLabel(
    googleDriveIsActive,
    googleDriveCanBeActivated,
    Boolean(googleDriveState?.folder)
  )
  const googleDrivePrimaryButtonIcon = getGoogleDrivePrimaryButtonIcon(
    googleDriveCanBeActivated,
    Boolean(googleDriveState?.folder)
  )
  const googleDrivePrimaryOperation = googleDriveCanBeActivated
    ? StorageSettingsOperation.PreviewProviderSwitch
    : StorageSettingsOperation.SetupGoogleDriveFolder

  const handleSelectProvider = (provider: StorageModeProvider): void => {
    setSelectedProvider(provider)
    cancelProviderSwitch()
  }

  const beginProviderActivation = (provider: StorageModeProvider): void => {
    setPendingProvider(provider)
    loadStorageSwitchPreview(provider)
  }

  const activatePendingProvider = (): void => {
    if (!pendingProvider) {
      return
    }

    void switchStorageProvider(pendingProvider, CloudStorageProviderSwitchDataMode.UseTargetAsIs).then(
      finishProviderSwitch
    )
  }

  const copyCurrentDataToPendingProvider = (): void => {
    if (!pendingProvider || !storageProviderSwitchPreview) {
      return
    }

    void switchStorageProvider(
      pendingProvider,
      CloudStorageProviderSwitchDataMode.CopyCurrentToTarget,
      storageProviderSwitchPreview
    ).then(finishProviderSwitch)
  }

  const cancelProviderSwitch = (): void => {
    setPendingProvider(null)
    cancelStorageProviderSwitch()
    dismissStorageError()
  }

  const finishProviderSwitch = (didSwitch: boolean): void => {
    if (!didSwitch) {
      return
    }

    setPendingProvider(null)
    setSelectedProvider(null)
    cancelStorageProviderSwitch()
  }

  const retryProviderSwitch = (): void => {
    if (pendingProvider) {
      loadStorageSwitchPreview(pendingProvider)
    }
  }

  const disconnectGoogleDrive = (): void => {
    void clearGoogleDriveFolder().then((didDisconnect) => {
      if (didDisconnect) {
        setGoogleDriveDisconnectIsPending(false)
        setPendingProvider(null)
        setSelectedProvider(null)
        cancelStorageProviderSwitch()
      }
    })
  }

  const runGoogleDrivePrimaryAction = (): void => {
    if (googleDriveCanBeActivated) {
      beginProviderActivation(CloudStorageProvider.GoogleDrive)
      return
    }

    setupDefaultGoogleDriveFolder()
  }

  return (
    <Card as="article" className="settings-storage-card">
      {storageErrorMessage && !pendingProvider ? (
        <Toast
          message={storageErrorMessage}
          title="Storage update failed"
          tone="error"
          onClose={dismissStorageError}
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
          aria-describedby={
            googleDrivePanelIsSelected && !googleDriveIsValid ? 'settings-cloud-switch-note' : undefined
          }
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

          {activeProvider !== CloudStorageProvider.Local ? (
            <div className="settings-storage-actions">
              <Button
                fullWidth
                disabled={storageIsBusy}
                icon="swap_horiz"
                onClick={() => beginProviderActivation(CloudStorageProvider.Local)}
              >
                Activate Local Storage
              </Button>
            </div>
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

          <div className="settings-storage-actions">
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
                  icon={googleDrivePrimaryButtonIcon}
                  onClick={runGoogleDrivePrimaryAction}
                >
                  {getStorageOperationLabel(
                    activeStorageOperation,
                    googleDrivePrimaryOperation,
                    googleDrivePrimaryButtonLabel
                  )}
                </Button>

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
              </>
            )}
          </div>
        </>
      ) : null}

      {pendingProvider ? (
        <StorageProviderSwitchDialog
          errorMessage={storageErrorMessage}
          operation={activeStorageOperation}
          preview={storageProviderSwitchPreview}
          progress={storageProviderCopyProgress}
          onActivateTarget={activatePendingProvider}
          onCancel={cancelProviderSwitch}
          onCopyCurrentData={copyCurrentDataToPendingProvider}
          onRetry={retryProviderSwitch}
        />
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

function getGoogleDrivePrimaryButtonLabel(
  isActive: boolean,
  canBeActivated: boolean,
  hasFolder: boolean
): string {
  if (canBeActivated) {
    return 'Activate Google Drive'
  }

  if (isActive) {
    return 'Recheck Drive folder'
  }

  return hasFolder ? 'Retry Drive folder' : 'Set up Drive folder'
}

function getGoogleDrivePrimaryButtonIcon(canBeActivated: boolean, hasFolder: boolean): string {
  if (canBeActivated) {
    return 'swap_horiz'
  }

  return hasFolder ? 'sync' : 'create_new_folder'
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
