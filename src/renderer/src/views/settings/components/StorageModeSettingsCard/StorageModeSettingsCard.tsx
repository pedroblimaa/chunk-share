import './StorageModeSettingsCard.css'

import { useState } from 'react'
import {
  CloudStorageProvider,
  GoogleDriveSetupStatus
} from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import Toast from '../../../../components/shared/Toast/Toast'
import type { GoogleDriveSettingsAction } from '../../settings.model'
import type {
  ProviderSwitchChoiceProps,
  StorageModeProvider,
  StorageModeSettingsCardProps
} from './StorageModeSettingsCard.model'

const STORAGE_MODE_INFO =
  'ChunkShare can store shared saves locally or in the configured Google Drive folder.'
const CLOUD_SWITCH_NOTE =
  'Google Drive must be configured and validated before it can become the active storage provider.'

function StorageModeSettingsCard({
  cloudStorageErrorMessage,
  cloudStorageSettings,
  googleDriveAction,
  googleDriveIsBusy,
  googleDriveStatusViewMap,
  onClearGoogleDriveFolder,
  onDismissCloudStorageError,
  onSetupDefaultGoogleDriveFolder,
  onSwitchCloudStorageProvider,
  onValidateGoogleDriveFolder
}: StorageModeSettingsCardProps): React.JSX.Element {
  const activeProvider = cloudStorageSettings?.activeProvider ?? CloudStorageProvider.Local
  const [selectedProvider, setSelectedProvider] = useState<StorageModeProvider | null>(null)
  const [pendingProvider, setPendingProvider] = useState<StorageModeProvider | null>(null)
  const displayedProvider = selectedProvider ?? activeProvider
  const effectivePendingProvider = pendingProvider === activeProvider ? null : pendingProvider
  const googleDriveState = cloudStorageSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = googleDriveStatusViewMap[googleDriveStatus]
  const googleDriveIsValid = googleDriveStatus === GoogleDriveSetupStatus.Valid
  const localPanelIsSelected = displayedProvider === CloudStorageProvider.Local
  const googleDrivePanelIsSelected = displayedProvider === CloudStorageProvider.GoogleDrive
  const googleDriveCanBeCleared = Boolean(
    googleDriveState?.folder || googleDriveState?.errorMessage
  )
  const providerSwitchIsBusy = googleDriveAction === 'switch-provider'

  const handleSelectProvider = (provider: StorageModeProvider): void => {
    setSelectedProvider(provider)

    if (provider === activeProvider) {
      setPendingProvider(null)
      return
    }

    if (provider === CloudStorageProvider.GoogleDrive && !googleDriveIsValid) {
      setPendingProvider(null)
      return
    }

    setPendingProvider(provider)
  }

  const switchToPendingProvider = (): void => {
    if (!pendingProvider) {
      return
    }

    onSwitchCloudStorageProvider(pendingProvider)
  }

  return (
    <Card as="article" className="settings-storage-card">
      {cloudStorageErrorMessage ? (
        <Toast
          message={cloudStorageErrorMessage}
          title="Storage update failed"
          tone="error"
          onClose={onDismissCloudStorageError}
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
            <ProviderSwitchChoice
              isBusy={providerSwitchIsBusy}
              providerLabel="Local Storage"
              onCancel={() => setPendingProvider(null)}
              onSwitch={switchToPendingProvider}
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
            <ProviderSwitchChoice
              isBusy={providerSwitchIsBusy}
              providerLabel="Google Drive"
              onCancel={() => setPendingProvider(null)}
              onSwitch={switchToPendingProvider}
            />
          ) : null}

          <div className="settings-drive-actions">
            <Button
              fullWidth
              disabled={googleDriveIsBusy}
              icon="create_new_folder"
              onClick={onSetupDefaultGoogleDriveFolder}
            >
              {getGoogleDriveActionLabel(
                googleDriveAction,
                'setup-default-folder',
                googleDriveState?.folder ? 'Recheck Drive folder' : 'Set up Drive folder'
              )}
            </Button>

            {googleDriveState?.folder || googleDriveCanBeCleared ? (
              <div className="settings-drive-secondary-actions">
                {googleDriveState?.folder ? (
                  <Button
                    fullWidth
                    disabled={googleDriveIsBusy}
                    icon="sync"
                    variant="secondary"
                    onClick={onValidateGoogleDriveFolder}
                  >
                    {getGoogleDriveActionLabel(
                      googleDriveAction,
                      'validate-folder',
                      'Validate folder access'
                    )}
                  </Button>
                ) : null}

                {googleDriveCanBeCleared ? (
                  <Button
                    fullWidth
                    disabled={googleDriveIsBusy}
                    icon="link_off"
                    variant="ghost"
                    onClick={onClearGoogleDriveFolder}
                  >
                    {getGoogleDriveActionLabel(
                      googleDriveAction,
                      'clear-folder',
                      'Forget cloud folder'
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  )
}

function ProviderSwitchChoice({
  isBusy,
  providerLabel,
  onCancel,
  onSwitch
}: ProviderSwitchChoiceProps): React.JSX.Element {
  return (
    <div className="settings-provider-switch-choice" role="group" aria-label="Switch storage mode">
      <div>
        <strong>Switch to {providerLabel}?</strong>
        <span>ChunkShare will use the saves and lock state already stored there.</span>
      </div>
      <div className="settings-provider-switch-actions">
        <Button disabled fullWidth icon="content_copy" variant="secondary">
          Copy current saves (soon)
        </Button>
        <Button disabled={isBusy} fullWidth icon="swap_horiz" onClick={onSwitch}>
          {isBusy ? 'Switching...' : 'Use existing data'}
        </Button>
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
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

function getGoogleDriveActionLabel(
  currentAction: GoogleDriveSettingsAction | null,
  targetAction: GoogleDriveSettingsAction,
  idleLabel: string
): string {
  return currentAction === targetAction ? 'Working...' : idleLabel
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
