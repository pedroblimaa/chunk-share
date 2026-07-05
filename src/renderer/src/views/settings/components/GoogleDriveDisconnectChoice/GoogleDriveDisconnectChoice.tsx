import './GoogleDriveDisconnectChoice.css'

import { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import { StorageSettingsOperation } from '../../settings.model'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import type { GoogleDriveDisconnectChoiceProps } from './GoogleDriveDisconnectChoice.model'

function GoogleDriveDisconnectChoice({
  onCancel
}: GoogleDriveDisconnectChoiceProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const isBusy = storage.operationState.isBusy
  const isDisconnecting =
    storage.operationState.operation === StorageSettingsOperation.ClearGoogleDriveFolder
  const isGoogleDriveActive = storage.activeStorageProvider === CloudStorageProvider.GoogleDrive

  const handleConfirm = (): void => {
    storage.requestGoogleDriveDisconnect().then((didDisconnect) => {
      if (didDisconnect) {
        onCancel()
      }
    })
  }

  return (
    <div
      className="settings-drive-disconnect-choice"
      role="group"
      aria-label="Disconnect Google Drive"
    >
      <div>
        <strong>Disconnect Google Drive?</strong>
        <span>
          {isGoogleDriveActive
            ? 'ChunkShare will switch to the saves already stored locally.'
            : 'ChunkShare will remove this Google Drive folder from its local settings.'}
        </span>
        <span>Your files will remain unchanged in Google Drive.</span>
      </div>
      <div className="settings-drive-disconnect-actions">
        <Button
          disabled={isBusy}
          fullWidth
          icon="link_off"
          variant="danger"
          onClick={handleConfirm}
        >
          {isDisconnecting ? 'Disconnecting...' : 'Disconnect Google Drive'}
        </Button>
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default GoogleDriveDisconnectChoice
