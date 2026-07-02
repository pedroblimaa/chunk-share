import { useState } from 'react'
import {
  CloudStorageProvider,
  GoogleDriveSetupStatus
} from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import { StorageSettingsOperation } from '../../settings.model'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import GoogleDriveDisconnectChoice from '../GoogleDriveDisconnectChoice/GoogleDriveDisconnectChoice'
import { GOOGLE_DRIVE_STATUS_VIEW } from '../StorageModeSettingsCard/storage-mode-settings.constants'
import type { GoogleDriveStoragePanelProps } from './GoogleDriveStoragePanel.model'

export const CLOUD_SWITCH_NOTE =
  'Google Drive must be configured and validated before becoming the active storage.'

function GoogleDriveStoragePanel({ children }: GoogleDriveStoragePanelProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const [disconnectIsPending, setDisconnectIsPending] = useState(false)
  const googleDriveState = storage.storageProviderSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = GOOGLE_DRIVE_STATUS_VIEW[googleDriveStatus]
  const googleDriveIsValid = googleDriveStatus === GoogleDriveSetupStatus.Valid
  const isActive = storage.activeStorageProvider === CloudStorageProvider.GoogleDrive
  const idleSetupButtonLabel = googleDriveState?.folder
    ? 'Recheck Drive folder'
    : 'Set up Drive folder'
  const setupButtonLabel =
    storage.operationState.operation === StorageSettingsOperation.SetupGoogleDriveFolder
      ? 'Working...'
      : idleSetupButtonLabel
  const validateButtonLabel =
    storage.operationState.operation === StorageSettingsOperation.ValidateGoogleDriveFolder
      ? 'Working...'
      : 'Validate folder access'
  const controlsAreDisabled =
    storage.operationState.isBusy || storage.storageProviderSettings === null

  return (
    <>
      {!googleDriveIsValid && (
        <p className="settings-storage-note" id="settings-cloud-switch-note">
          {CLOUD_SWITCH_NOTE}
        </p>
      )}

      <div className={`settings-storage-panel${isActive ? ' is-active' : ''}`}>
        <div>
          <strong>Google Drive</strong>
          <span>{googleDriveState?.folder?.folderName ?? 'Shared folder sync'}</span>
        </div>
        {isActive ? (
          <Badge dot>Active</Badge>
        ) : (
          <Badge className="settings-pending-badge" tone={googleDriveStatusView.tone}>
            {googleDriveStatusView.label}
          </Badge>
        )}
      </div>

      {googleDriveState?.folder && (
        <dl className="settings-drive-details">
          <div>
            <dt>Validated</dt>
            <dd>{formatNullableDate(googleDriveState.folder.validatedAt)}</dd>
          </div>
        </dl>
      )}

      {googleDriveState?.errorMessage && (
        <p className="settings-drive-error">{googleDriveState.errorMessage}</p>
      )}

      {children}

      <div className="settings-drive-actions">
        {disconnectIsPending ? (
          <GoogleDriveDisconnectChoice onCancel={() => setDisconnectIsPending(false)} />
        ) : (
          <>
            <Button
              fullWidth
              disabled={controlsAreDisabled}
              icon="create_new_folder"
              onClick={storage.requestGoogleDriveSetup}
            >
              {setupButtonLabel}
            </Button>

            {googleDriveState?.folder && (
              <div className="settings-drive-secondary-actions">
                <Button
                  fullWidth
                  disabled={controlsAreDisabled}
                  icon="sync"
                  variant="secondary"
                  onClick={storage.requestGoogleDriveValidation}
                >
                  {validateButtonLabel}
                </Button>

                <Button
                  fullWidth
                  disabled={controlsAreDisabled}
                  icon="link_off"
                  variant="ghost"
                  onClick={() => setDisconnectIsPending(true)}
                >
                  Disconnect Google Drive
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
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

export default GoogleDriveStoragePanel
