import type { StorageModeProvider } from '../StorageModeSettingsCard/StorageModeSettingsCard.model'

export interface StorageProviderOptionProps {
  describedBy?: string
  icon: string
  isSelected: boolean
  label: string
  onSelect: (provider: StorageModeProvider) => void
  provider: StorageModeProvider
}
