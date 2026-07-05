import { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import Button from '../../../../components/shared/Button/Button'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import { StorageSettingsOperation } from '../../settings.model'
import type { LocalStoragePanelProps } from './LocalStoragePanel.model'

function LocalStoragePanel({ onActivate }: LocalStoragePanelProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const isActive = storage.activeStorageProvider === CloudStorageProvider.Local
  const activationIsRunning =
    storage.operationState.operation === StorageSettingsOperation.PreviewProviderSwitch ||
    storage.operationState.operation === StorageSettingsOperation.SwitchProvider

  return (
    <>
      <div className={`settings-storage-panel${isActive ? ' is-active' : ''}`}>
        <div>
          <strong>Local Storage</strong>
          <span>Server saves, locks, and versions are stored on this device.</span>
        </div>
        {isActive && <Badge dot>Active</Badge>}
      </div>

      {!isActive && (
        <div className="settings-storage-actions">
          <Button
            aria-busy={activationIsRunning}
            className={activationIsRunning ? 'settings-storage-button-loading' : undefined}
            fullWidth
            disabled={storage.operationState.isBusy}
            icon={activationIsRunning ? 'progress_activity' : 'swap_horiz'}
            onClick={onActivate}
          >
            {activationIsRunning ? 'Working...' : 'Activate Local Storage'}
          </Button>
        </div>
      )}
    </>
  )
}

export default LocalStoragePanel
