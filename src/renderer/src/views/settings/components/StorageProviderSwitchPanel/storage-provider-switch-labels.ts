import {
  StorageProviderSwitchScenario,
  type StorageProviderSwitchChoiceLabels
} from './StorageProviderSwitchPanel.model'

export function getStorageProviderSwitchChoiceLabels(
  scenario: StorageProviderSwitchScenario,
  targetLabel: string
): StorageProviderSwitchChoiceLabels {
  switch (scenario) {
    case StorageProviderSwitchScenario.BothHaveData:
      return {
        title: 'Both providers contain saves',
        description: 'Choose which save history ChunkShare should use.',
        activateLabel: `Use ${targetLabel} data`
      }
    case StorageProviderSwitchScenario.SourceOnly:
      return {
        title: 'Only the current provider contains saves',
        description: `Activate ${targetLabel} without copying current saves.`,
        activateLabel: `Activate empty ${targetLabel}`
      }
    case StorageProviderSwitchScenario.TargetOnly:
      return {
        title: `${targetLabel} contains saves`,
        description: 'Activate this provider to use its existing save history.',
        activateLabel: `Activate ${targetLabel} data`
      }
    case StorageProviderSwitchScenario.BothEmpty:
      return {
        title: 'No saves found',
        description: 'Neither provider contains save history yet.',
        activateLabel: `Activate ${targetLabel}`
      }
  }
}
