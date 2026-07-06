import { useState } from 'react'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import { formatNullableDate } from '../../settings-formatters'
import GoogleDriveDisconnectChoice from '../GoogleDriveDisconnectChoice/GoogleDriveDisconnectChoice'
import { CLOUD_SWITCH_NOTE } from '../StorageModeSettingsCard/storage-mode-settings.constants'
import type { GoogleDriveStoragePanelProps } from './GoogleDriveStoragePanel.model'
import { useDrivePanelState } from './useDrivePanelState'

function GoogleDriveStoragePanel({ onActivate }: GoogleDriveStoragePanelProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const [disconnectIsPending, setDisconnectIsPending] = useState(false)
  const state = useDrivePanelState(storage, onActivate)

  return (
    <>
      {!state.isValid && (
        <p className="settings-storage-note" id="settings-cloud-switch-note">
          {CLOUD_SWITCH_NOTE}
        </p>
      )}

      <div className={`settings-storage-panel${state.isActive ? ' is-active' : ''}`}>
        <div>
          <strong>Google Drive</strong>
          <span>{state.folderName}</span>
        </div>
        {state.isActive ? (
          <Badge dot>Active</Badge>
        ) : (
          <Badge className="settings-pending-badge" tone={state.statusView.tone}>
            {state.statusView.label}
          </Badge>
        )}
      </div>

      {state.hasFolder && (
        <dl className="settings-drive-details">
          <div>
            <dt>Validated</dt>
            <dd>{formatNullableDate(state.validatedAt, 'Not validated yet')}</dd>
          </div>
        </dl>
      )}

      {state.errorMessage && <p className="settings-drive-error">{state.errorMessage}</p>}

      <div className="settings-drive-actions">
        {disconnectIsPending ? (
          <GoogleDriveDisconnectChoice onCancel={() => setDisconnectIsPending(false)} />
        ) : (
          <>
            <Button
              aria-busy={state.primaryActionIsRunning}
              className={state.primaryActionIsRunning ? 'settings-storage-button-loading' : undefined}
              fullWidth
              disabled={state.controlsAreDisabled}
              icon={state.primaryAction.icon}
              onClick={state.runPrimaryAction}
            >
              {state.primaryAction.label}
            </Button>

            {state.hasFolder && (
              <Button
                fullWidth
                disabled={state.controlsAreDisabled}
                icon="link_off"
                variant="ghost"
                onClick={() => setDisconnectIsPending(true)}
              >
                Disconnect Google Drive
              </Button>
            )}
          </>
        )}
      </div>
    </>
  )
}

export default GoogleDriveStoragePanel
