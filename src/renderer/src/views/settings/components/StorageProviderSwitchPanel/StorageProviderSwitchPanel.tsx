import './StorageProviderSwitchPanel.css'

import {
  CloudStorageProvider,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview
} from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../../settings.model'
import {
  StorageProviderSwitchScenario,
  type StorageProviderDataSummaryProps,
  type StorageProviderSwitchChoiceCopy,
  type StorageProviderSwitchChoiceProps,
  type StorageProviderSwitchPanelProps
} from './StorageProviderSwitchPanel.model'

function StorageProviderSwitchPanel({
  hasError,
  operation,
  preview,
  onActivateTarget,
  onCancel,
  onCopyCurrentData,
  onRetry
}: StorageProviderSwitchPanelProps): React.JSX.Element | null {
  if (preview) {
    return (
      <StorageProviderSwitchChoice
        operation={operation}
        preview={preview}
        onActivateTarget={onActivateTarget}
        onCancel={onCancel}
        onCopyCurrentData={onCopyCurrentData}
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
        <div className="settings-provider-switch-actions settings-provider-switch-two-actions">
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
  onCancel,
  onCopyCurrentData
}: StorageProviderSwitchChoiceProps): React.JSX.Element {
  const sourceLabel = getStorageProviderLabel(preview.source.provider)
  const targetLabel = getStorageProviderLabel(preview.target.provider)
  const scenario = getStorageProviderSwitchScenario(preview)
  const choiceCopy = getStorageProviderSwitchChoiceCopy(scenario, targetLabel)
  const sourceHasData = storageProviderHasData(preview.source)
  const copyReplacesTargetData = scenario === StorageProviderSwitchScenario.BothHaveData
  const copyIsRecommended = scenario === StorageProviderSwitchScenario.SourceOnly
  const isBusy =
    operation === StorageSettingsOperation.CopyProviderData ||
    operation === StorageSettingsOperation.SwitchProvider
  const activateTargetButton = (
    <Button
      disabled={isBusy}
      fullWidth
      icon="swap_horiz"
      variant={copyIsRecommended ? 'secondary' : undefined}
      onClick={onActivateTarget}
    >
      {operation === StorageSettingsOperation.SwitchProvider ? 'Switching...' : choiceCopy.activateLabel}
    </Button>
  )
  const copyCurrentDataButton = sourceHasData ? (
    <Button
      disabled={isBusy}
      fullWidth
      icon="content_copy"
      variant={copyReplacesTargetData ? 'danger' : undefined}
      onClick={onCopyCurrentData}
    >
      {getCopyActionLabel(operation, copyReplacesTargetData, choiceCopy.copyLabel)}
    </Button>
  ) : null

  return (
    <div className="settings-provider-switch-panel" role="group" aria-label="Switch storage mode">
      <div>
        <strong>{choiceCopy.title}</strong>
        <span>{choiceCopy.description}</span>
      </div>
      <div className="settings-provider-switch-comparison">
        <StorageProviderDataSummary label={`Current - ${sourceLabel}`} summary={preview.source} />
        <StorageProviderDataSummary label={`Target - ${targetLabel}`} summary={preview.target} />
      </div>
      {copyReplacesTargetData ? (
        <p className="settings-provider-switch-warning">
          Replacing {targetLabel} removes its current ChunkShare save history.
        </p>
      ) : null}
      <div
        className={`settings-provider-switch-actions${
          sourceHasData ? '' : ' settings-provider-switch-two-actions'
        }`}
      >
        {copyIsRecommended ? copyCurrentDataButton : activateTargetButton}
        {copyIsRecommended ? activateTargetButton : copyCurrentDataButton}
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

function getStorageProviderSwitchChoiceCopy(
  scenario: StorageProviderSwitchScenario,
  targetLabel: string
): StorageProviderSwitchChoiceCopy {
  if (scenario === StorageProviderSwitchScenario.BothHaveData) {
    return {
      title: 'Both providers contain saves',
      description: 'Choose which save history ChunkShare should use.',
      activateLabel: `Use ${targetLabel} data (Recommended)`,
      copyLabel: `Replace ${targetLabel} with current data`
    }
  }

  if (scenario === StorageProviderSwitchScenario.SourceOnly) {
    return {
      title: 'Only the current provider contains saves',
      description: `Copy the current save history or activate an empty ${targetLabel}.`,
      activateLabel: `Activate empty ${targetLabel}`,
      copyLabel: `Copy saves and activate ${targetLabel} (Recommended)`
    }
  }

  if (scenario === StorageProviderSwitchScenario.TargetOnly) {
    return {
      title: `${targetLabel} contains saves`,
      description: 'Activate this provider to use its existing save history.',
      activateLabel: `Activate ${targetLabel} data`,
      copyLabel: ''
    }
  }

  return {
    title: 'No saves found',
    description: 'Neither provider contains save history yet.',
    activateLabel: `Activate ${targetLabel}`,
    copyLabel: ''
  }
}

function getCopyActionLabel(
  operation: ActiveStorageSettingsOperation,
  replacesTargetData: boolean,
  idleLabel: string
): string {
  if (operation !== StorageSettingsOperation.CopyProviderData) {
    return idleLabel
  }

  return replacesTargetData ? 'Replacing...' : 'Copying...'
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
          : `Latest save v${summary.latestSaveVersion} - ${formatNullableDate(summary.latestSaveUploadedAt)}`}
      </span>
      <span>
        {summary.versionCount} retained {summary.versionCount === 1 ? 'version' : 'versions'}
      </span>
    </div>
  )
}

function getProviderSwitchProgressLabel(operation: ActiveStorageSettingsOperation): string | null {
  if (operation === StorageSettingsOperation.PreviewProviderSwitch) {
    return 'Checking storage data...'
  }

  if (operation === StorageSettingsOperation.CopyProviderData) {
    return 'Copying saves to the selected provider...'
  }

  if (operation === StorageSettingsOperation.SwitchProvider) {
    return 'Switching storage provider...'
  }

  return null
}

function getStorageProviderLabel(provider: CloudStorageProvider): string {
  return provider === CloudStorageProvider.Local ? 'Local Storage' : 'Google Drive'
}

function formatNullableDate(value: string | null): string {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

export default StorageProviderSwitchPanel
