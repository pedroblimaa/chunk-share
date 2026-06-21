import './CloudStorageSettingsCard.css'

import { GoogleDriveSetupStatus } from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import Card from '../../../../components/shared/Card/Card'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import Tooltip from '../../../../components/shared/Tooltip/Tooltip'
import type { GoogleDriveSettingsAction } from '../../settings.model'
import type { CloudStorageSettingsCardProps } from './CloudStorageSettingsCard.model'

const GOOGLE_DRIVE_INFO =
  'ChunkShare creates a private Google Drive folder for this world.\n\nShare that folder with friends as Editors so they can sync too.'

function CloudStorageSettingsCard({
  cloudStorageSettings,
  googleDriveAction,
  googleDriveErrorMessage,
  googleDriveIsBusy,
  googleDriveStatusViewMap,
  onSetupDefaultGoogleDriveFolder,
  onValidateGoogleDriveFolder
}: CloudStorageSettingsCardProps): React.JSX.Element {
  const googleDriveState = cloudStorageSettings?.googleDrive
  const googleDriveStatus = googleDriveState?.status ?? GoogleDriveSetupStatus.NotConfigured
  const googleDriveStatusView = googleDriveStatusViewMap[googleDriveStatus]

  return (
    <Card as="article" className="settings-cloud-card">
      <div className="settings-card-heading settings-cloud-heading">
        <div>
          <MaterialIcon name="cloud" />
          <h2>Cloud Storage</h2>
        </div>
        <Tooltip content={GOOGLE_DRIVE_INFO} placement="left">
          <button
            className="settings-info-button"
            type="button"
            aria-label="About Google Drive setup"
          >
            <MaterialIcon name="info" />
          </button>
        </Tooltip>
      </div>

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
            'Create or reuse ChunkShare folder'
          )}
        </Button>

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
      </div>
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

export default CloudStorageSettingsCard
