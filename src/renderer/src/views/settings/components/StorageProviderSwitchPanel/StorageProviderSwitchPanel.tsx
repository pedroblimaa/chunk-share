import './StorageProviderSwitchPanel.css'

import { CloudStorageProvider } from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../../settings.model'
import type {
  StorageProviderDataSummaryProps,
  StorageProviderSwitchChoiceProps,
  StorageProviderSwitchPanelProps
} from './StorageProviderSwitchPanel.model'

function StorageProviderSwitchPanel({
  hasError,
  operation,
  preview,
  onCancel,
  onReplace,
  onRetry,
  onUseExisting
}: StorageProviderSwitchPanelProps): React.JSX.Element | null {
  if (preview) {
    return (
      <StorageProviderSwitchChoice
        operation={operation}
        preview={preview}
        onCancel={onCancel}
        onReplace={onReplace}
        onUseExisting={onUseExisting}
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
        <div className="settings-provider-switch-actions settings-provider-switch-retry-actions">
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
  onCancel,
  onReplace,
  onUseExisting
}: StorageProviderSwitchChoiceProps): React.JSX.Element {
  const sourceLabel = getStorageProviderLabel(preview.source.provider)
  const targetLabel = getStorageProviderLabel(preview.target.provider)
  const isBusy =
    operation === StorageSettingsOperation.CopyProviderData ||
    operation === StorageSettingsOperation.SwitchProvider

  return (
    <div className="settings-provider-switch-panel" role="group" aria-label="Switch storage mode">
      <div>
        <strong>Both providers contain saves</strong>
        <span>Choose which save history ChunkShare should use.</span>
      </div>
      <div className="settings-provider-switch-comparison">
        <StorageProviderDataSummary label={`Current - ${sourceLabel}`} summary={preview.source} />
        <StorageProviderDataSummary label={`Target - ${targetLabel}`} summary={preview.target} />
      </div>
      <p className="settings-provider-switch-warning">
        Replacing {targetLabel} removes its current ChunkShare save history.
      </p>
      <div className="settings-provider-switch-actions">
        <Button disabled={isBusy} fullWidth icon="swap_horiz" onClick={onUseExisting}>
          {operation === StorageSettingsOperation.SwitchProvider
            ? 'Switching...'
            : `Use ${targetLabel} data (Recommended)`}
        </Button>
        <Button disabled={isBusy} fullWidth icon="content_copy" variant="danger" onClick={onReplace}>
          {operation === StorageSettingsOperation.CopyProviderData
            ? 'Replacing...'
            : `Replace ${targetLabel} with ${sourceLabel}`}
        </Button>
        <Button disabled={isBusy} fullWidth variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
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
