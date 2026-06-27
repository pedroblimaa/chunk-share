import './GoogleDriveDisconnectChoice.css'

import Button from '../../../../components/shared/Button/Button'
import type { GoogleDriveDisconnectChoiceProps } from './GoogleDriveDisconnectChoice.model'

function GoogleDriveDisconnectChoice({
  isBusy,
  switchesToLocal,
  onCancel,
  onConfirm
}: GoogleDriveDisconnectChoiceProps): React.JSX.Element {
  return (
    <div className="settings-drive-disconnect-choice" role="group" aria-label="Disconnect Google Drive">
      <div>
        <strong>Disconnect Google Drive?</strong>
        <span>
          {switchesToLocal
            ? 'ChunkShare will switch to the saves already stored locally.'
            : 'ChunkShare will remove this Google Drive folder from its local settings.'}
        </span>
        <span>Your files will remain unchanged in Google Drive.</span>
      </div>
      <div className="settings-drive-disconnect-actions">
        <Button disabled={isBusy} fullWidth icon="link_off" variant="danger" onClick={onConfirm}>
          {isBusy ? 'Disconnecting...' : 'Disconnect Google Drive'}
        </Button>
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default GoogleDriveDisconnectChoice
