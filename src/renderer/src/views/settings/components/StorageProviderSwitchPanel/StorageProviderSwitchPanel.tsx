import './StorageProviderSwitchPanel.css'

import {
  CloudStorageProvider,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import { StorageSettingsOperation } from '../../settings.model'
import { formatNullableDate } from '../../settings-formatters'
import {
  StorageProviderSwitchScenario,
  type StorageProviderDataSummaryProps,
  type StorageProviderSwitchChoiceProps,
  type StorageProviderSwitchPanelProps
} from './StorageProviderSwitchPanel.model'
import { getStorageProviderSwitchChoiceLabels } from './storage-provider-switch-labels'

function StorageProviderSwitchPanel({
  hasError,
  operation,
  preview,
  onActivateTarget,
  onCancel,
  onRetry
}: StorageProviderSwitchPanelProps): React.JSX.Element | null {
  if (preview) {
    return (
      <StorageProviderSwitchChoice
        operation={operation}
        preview={preview}
        onActivateTarget={onActivateTarget}
        onCancel={onCancel}
      />
    )
  }

  const progressLabel = getProviderSwitchProgressLabel(operation)

  if (progressLabel) {
    return (
      <div className="settings-provider-switch-panel" aria-live="polite">
        <strong>{progressLabel}</strong>
        <span>Keep ChunkShare open while storage data is checked and prepared.</span>
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="settings-provider-switch-panel" role="group" aria-label="Retry storage switch">
        <div>
          <strong>Unable to check storage data</strong>
          <span>Retry the check or cancel this provider switch.</span>
        </div>
        <div className="settings-provider-switch-actions">
          <Button fullWidth icon="refresh" onClick={onRetry}>
            Retry
          </Button>
          <Button fullWidth variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return null
}

function StorageProviderSwitchChoice({
  operation,
  preview,
  onActivateTarget,
  onCancel
}: StorageProviderSwitchChoiceProps): React.JSX.Element {
  const sourceLabel = getStorageProviderLabel(preview.source.provider)
  const targetLabel = getStorageProviderLabel(preview.target.provider)
  const scenario = getStorageProviderSwitchScenario(preview)
  const choiceLabels = getStorageProviderSwitchChoiceLabels(scenario, targetLabel)
  const isBusy = operation === StorageSettingsOperation.SwitchProvider
  const activateTargetLabel = isBusy ? 'Switching...' : choiceLabels.activateLabel

  return (
    <div className="settings-provider-switch-panel" role="group" aria-label="Switch storage mode">
      <div>
        <strong>{choiceLabels.title}</strong>
        <span>{choiceLabels.description}</span>
      </div>
      <div className="settings-provider-switch-comparison">
        <StorageProviderDataSummary label={`Current - ${sourceLabel}`} summary={preview.source} />
        <StorageProviderDataSummary label={`Target - ${targetLabel}`} summary={preview.target} />
      </div>
      <div className="settings-provider-switch-actions">
        <Button
          disabled={isBusy}
          fullWidth
          icon="swap_horiz"
          onClick={() => onActivateTarget(preview.target.provider)}
        >
          {activateTargetLabel}
        </Button>
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function getStorageProviderSwitchScenario(
  preview: CloudStorageProviderSwitchPreview
): StorageProviderSwitchScenario {
  const sourceHasData = storageProviderHasData(preview.source)
  const targetHasData = storageProviderHasData(preview.target)

  if (sourceHasData && targetHasData) {
    return StorageProviderSwitchScenario.BothHaveData
  }

  if (sourceHasData) {
    return StorageProviderSwitchScenario.SourceOnly
  }

  if (targetHasData) {
    return StorageProviderSwitchScenario.TargetOnly
  }

  return StorageProviderSwitchScenario.BothEmpty
}

function storageProviderHasData(summary: CloudStorageProviderDataSummary): boolean {
  return summary.latestSaveVersion !== null || summary.versionCount > 0
}

function StorageProviderDataSummary({ label, summary }: StorageProviderDataSummaryProps): React.JSX.Element {
  return (
    <div>
      <strong>{label}</strong>
      <span>
        {summary.latestSaveVersion === null
          ? 'No latest save'
          : `Latest save v${summary.latestSaveVersion} - ${formatNullableDate(summary.latestSaveRecordedAt, 'Not available')}`}
      </span>
      <span>
        {summary.versionCount} retained {summary.versionCount === 1 ? 'version' : 'versions'}
      </span>
    </div>
  )
}

function getProviderSwitchProgressLabel(operation: StorageSettingsOperation): string | null {
  if (operation === StorageSettingsOperation.PreviewProviderSwitch) {
    return 'Checking storage data...'
  }

  if (operation === StorageSettingsOperation.SwitchProvider) {
    return 'Switching storage provider...'
  }

  return null
}

function getStorageProviderLabel(provider: CloudStorageProvider): string {
  return provider === CloudStorageProvider.Local ? 'Local Storage' : 'Google Drive'
}

export default StorageProviderSwitchPanel
