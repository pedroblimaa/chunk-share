import { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'
import Badge from '../../../../components/shared/Badge/Badge'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import type { LocalStoragePanelProps } from './LocalStoragePanel.model'

function LocalStoragePanel({ children }: LocalStoragePanelProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const isActive = storage.activeStorageProvider === CloudStorageProvider.Local

  return (
    <>
      <div className={`settings-storage-panel${isActive ? ' is-active' : ''}`}>
        <div>
          <strong>Local Storage</strong>
          <span>Server saves, locks, and versions are stored on this device.</span>
        </div>
        {isActive && <Badge dot>Active</Badge>}
      </div>

      {children}
    </>
  )
}

export default LocalStoragePanel
