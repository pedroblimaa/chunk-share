import {
  StorageProviderSwitchScenario,
  type StorageProviderSwitchChoiceLabels
} from './StorageProviderSwitchDialog.model'

export function getStorageProviderSwitchChoiceLabels(
  scenario: StorageProviderSwitchScenario,
  targetLabel: string
): StorageProviderSwitchChoiceLabels {
  switch (scenario) {
    case StorageProviderSwitchScenario.BothHaveData:
      return {
        title: 'Both providers contain saves',
        description: 'Choose which save history ChunkShare should use.',
        activateLabel: `Use ${targetLabel} data (Recommended)`,
        copyLabel: `Replace ${targetLabel} with current data`
      }
    case StorageProviderSwitchScenario.SourceOnly:
      return {
        title: 'Only the current provider contains saves',
        description: `Copy the current save history or activate an empty ${targetLabel}.`,
        activateLabel: `Activate empty ${targetLabel}`,
        copyLabel: `Copy saves and activate ${targetLabel} (Recommended)`
      }
    case StorageProviderSwitchScenario.TargetOnly:
      return {
        title: `${targetLabel} contains saves`,
        description: 'Activate this provider to use its existing save history.',
        activateLabel: `Activate ${targetLabel} data`,
        copyLabel: ''
      }
    case StorageProviderSwitchScenario.BothEmpty:
      return {
        title: 'No saves found',
        description: 'Neither provider contains save history yet.',
        activateLabel: `Activate ${targetLabel}`,
        copyLabel: ''
      }
  }
}
