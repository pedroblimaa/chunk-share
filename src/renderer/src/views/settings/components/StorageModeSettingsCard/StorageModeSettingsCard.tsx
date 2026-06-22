import './StorageModeSettingsCard.css'

import { useState } from 'react'
import { GoogleDriveSetupStatus } from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import type { GoogleDriveSettingsAction } from '../../settings.model'
import type { StorageModeSettingsCardProps } from './StorageModeSettingsCard.model'

const STORAGE_MODE_INFO =
  'Share the Google Drive folder with friends as Editors so they can sync too.'
const CLOUD_SWITCH_NOTE =
  'Google Drive is configured, but Local Storage remains active until cloud sync switching is enabled.'
type StorageModeTab = 'local' | 'google-drive'

function StorageModeSettingsCard({
  cloudStorageSettings,
  googleDriveAction,
  googleDriveErrorMessage,
  googleDriveIsBusy,
  googleDriveStatusViewMap,
  onClearGoogleDriveFolder,
  onSetupDefaultGoogleDriveFolder,
  onValidateGoogleDriveFolder
}: StorageModeSettingsCardProps): React.JSX.Element {
  const [selectedTab, setSelectedTab] = useState<StorageModeTab>('local')
  const googleDriveState = cloudStorageSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = googleDriveStatusViewMap[googleDriveStatus]
  const localTabIsSelected = selectedTab === 'local'
  const googleDriveTabIsSelected = selectedTab === 'google-drive'
  const googleDriveCanBeCleared = Boolean(
    googleDriveState?.folder || googleDriveState?.errorMessage || googleDriveErrorMessage
  )

  return (
    <Card as="article" className="settings-storage-card">
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
          className={`settings-storage-segment${localTabIsSelected ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={localTabIsSelected}
          onClick={() => setSelectedTab('local')}
        >
          <MaterialIcon name="hard_drive" />
          <span>Local</span>
        </button>
        <button
          className={`settings-storage-segment${googleDriveTabIsSelected ? ' is-selected' : ''}`}
          type="button"
          aria-describedby={googleDriveTabIsSelected ? 'settings-cloud-switch-note' : undefined}
          aria-pressed={googleDriveTabIsSelected}
          onClick={() => setSelectedTab('google-drive')}
        >
          <MaterialIcon name="cloud" />
          <span>Google Drive</span>
        </button>
      </div>

      {localTabIsSelected ? (
        <div className="settings-storage-panel is-active">
          <div>
            <strong>Local Storage</strong>
            <span>Server saves, locks, and versions are currently stored on this device.</span>
          </div>
          <Badge dot>Active</Badge>
        </div>
      ) : null}

      {googleDriveTabIsSelected ? (
        <>
          <p className="settings-storage-note" id="settings-cloud-switch-note">
            {CLOUD_SWITCH_NOTE}
          </p>
          <div className="settings-storage-panel">
            <div>
              <strong>Google Drive</strong>
              <span>{googleDriveState?.folder?.folderName ?? 'Shared folder sync'}</span>
            </div>
            <Badge className="settings-pending-badge" tone={googleDriveStatusView.tone}>
              {googleDriveStatusView.label}
            </Badge>
          </div>

          {googleDriveState?.folder ? (
            <dl className="settings-drive-details">
              <div>
                <dt>Validated</dt>
                <dd>{formatNullableDate(googleDriveState.folder.validatedAt)}</dd>
              </div>
            </dl>
          ) : null}

          {googleDriveState?.errorMessage || googleDriveErrorMessage ? (
            <p className="settings-drive-error">
              {googleDriveErrorMessage ?? googleDriveState?.errorMessage}
            </p>
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
                'Set up Drive folder'
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
