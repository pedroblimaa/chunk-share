import './StorageProviderOption.css'

import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { useStorageProviderSettings } from '../../hooks/useStorageProviderSettings'
import type { StorageProviderOptionProps } from './StorageProviderOption.model'

function StorageProviderOption({
  describedBy,
  icon,
  isSelected,
  label,
  onSelect,
  provider
}: StorageProviderOptionProps): React.JSX.Element {
  const storage = useStorageProviderSettings()
  const isActive = storage.activeStorageProvider === provider
  const isDisabled = storage.operationState.isBusy || storage.storageProviderSettings === null

  return (
    <button
      className={`settings-storage-option${isSelected ? ' is-selected' : ''}`}
      type="button"
      disabled={isDisabled}
      aria-describedby={isSelected ? describedBy : undefined}
      aria-pressed={isSelected}
      onClick={() => onSelect(provider)}
    >
      <MaterialIcon name={icon} />
      <span>{label}</span>
      {isActive && <small>Active</small>}
    </button>
  )
}

export default StorageProviderOption
