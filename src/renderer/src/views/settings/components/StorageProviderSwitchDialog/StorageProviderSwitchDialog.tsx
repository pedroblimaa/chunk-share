import './StorageProviderSwitchDialog.css'

import { useEffect, useRef } from 'react'
import {
  CloudStorageProvider,
  StorageProviderCopyPhase,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview,
  type StorageProviderCopyProgress
} from '../../../../../../shared/cloud-storage.model'
import Button from '../../../../components/shared/Button/Button'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../../settings.model'
import {
  StorageProviderSwitchScenario,
  type StorageProviderDataSummaryProps,
  type StorageProviderSwitchChoiceCopy,
  type StorageProviderSwitchChoiceProps,
  type StorageProviderSwitchDialogProps
} from './StorageProviderSwitchDialog.model'

function StorageProviderSwitchDialog({
  errorMessage,
  operation,
  preview,
  progress,
  onActivateTarget,
  onCancel,
  onCopyCurrentData,
  onRetry
}: StorageProviderSwitchDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLElement>(null)
  const dialogIsBusy = operation !== null
  const progressLabel = getProviderSwitchProgressLabel(operation)
  let dialogContent: React.JSX.Element | null = null

  if (preview) {
    dialogContent = (
      <>
        {errorMessage ? <p className="settings-provider-switch-error">{errorMessage}</p> : null}
        <StorageProviderSwitchChoice
          operation={operation}
          preview={preview}
          progress={progress}
          onActivateTarget={onActivateTarget}
          onCancel={onCancel}
          onCopyCurrentData={onCopyCurrentData}
        />
      </>
    )
  } else if (progressLabel) {
    dialogContent = (
      <div className="settings-provider-switch-loading" aria-live="polite">
        <MaterialIcon name="progress_activity" />
        <div>
          <strong>{progressLabel}</strong>
          <span>Keep ChunkShare open while storage data is checked and prepared.</span>
        </div>
      </div>
    )
  } else if (errorMessage) {
    dialogContent = (
      <>
        <div>
          <strong>Unable to check storage data</strong>
          <span>{errorMessage}</span>
        </div>
        <div className="settings-provider-switch-actions settings-provider-switch-two-actions">
          <Button fullWidth icon="refresh" onClick={onRetry}>
            Retry
          </Button>
          <Button fullWidth variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </>
    )
  }

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousBodyOverflow
      previouslyFocusedElement?.focus()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !dialogIsBusy) {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dialogIsBusy, onCancel])

  if (!dialogContent) {
    return null
  }

  return (
    <div className="settings-provider-switch-backdrop">
      <section
        aria-labelledby="settings-provider-switch-title"
        aria-modal="true"
        className="settings-provider-switch-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="settings-provider-switch-heading">
          <MaterialIcon name="swap_horiz" />
          <h3 id="settings-provider-switch-title">Switch Storage Mode</h3>
        </div>
        <div className="settings-provider-switch-content">{dialogContent}</div>
      </section>
    </div>
  )
}

function StorageProviderSwitchChoice({
  operation,
  preview,
  progress,
  onActivateTarget,
  onCancel,
  onCopyCurrentData
}: StorageProviderSwitchChoiceProps): React.JSX.Element {
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
  const copyIsRunning = operation === StorageSettingsOperation.CopyProviderData
  const copyCurrentDataButton = sourceHasData ? (
    <Button
      aria-busy={copyIsRunning}
      className={copyIsRunning ? 'settings-provider-copy-loading' : undefined}
      disabled={isBusy}
      fullWidth
      icon={copyIsRunning ? 'progress_activity' : 'content_copy'}
      variant={copyReplacesTargetData ? 'danger' : undefined}
      onClick={onCopyCurrentData}
    >
      {getCopyActionLabel(operation, progress, choiceCopy.copyLabel)}
    </Button>
  ) : null

  return (
    <>
      <div>
        <strong>{choiceCopy.title}</strong>
        <span>{choiceCopy.description}</span>
      </div>
      <div className="settings-provider-switch-comparison">
        <StorageProviderDataSummary summary={preview.source} />
        <div className="settings-provider-switch-direction" aria-hidden="true">
          <MaterialIcon name="arrow_forward" />
        </div>
        <StorageProviderDataSummary summary={preview.target} />
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
    </>
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
  progress: StorageProviderCopyProgress | null,
  idleLabel: string
): string {
  if (operation !== StorageSettingsOperation.CopyProviderData) {
    return idleLabel
  }

  if (!progress) {
    return 'Preparing...'
  }

  switch (progress.phase) {
    case StorageProviderCopyPhase.PreparingSource:
      return formatFileProgressLabel('Preparing current saves', progress)
    case StorageProviderCopyPhase.PreparingTarget:
      return formatFileProgressLabel('Backing up target saves', progress)
    case StorageProviderCopyPhase.Copying:
      return formatFileProgressLabel('Copying saves', progress)
    case StorageProviderCopyPhase.Finalizing:
      return 'Finalizing storage switch...'
    case StorageProviderCopyPhase.Restoring:
      return formatFileProgressLabel('Restoring previous saves', progress)
  }
}

function formatFileProgressLabel(label: string, progress: StorageProviderCopyProgress): string {
  if (progress.totalFiles === 0) {
    return `${label}...`
  }

  return `${label}: ${progress.completedFiles} of ${progress.totalFiles}`
}

function storageProviderHasData(summary: CloudStorageProviderDataSummary): boolean {
  return summary.latestSaveVersion !== null || summary.versionCount > 0
}

function StorageProviderDataSummary({ summary }: StorageProviderDataSummaryProps): React.JSX.Element {
  return (
    <div className="settings-provider-switch-summary">
      <div className="settings-provider-switch-summary-heading">
        <MaterialIcon name={getStorageProviderIcon(summary.provider)} />
        <strong>{getStorageProviderLabel(summary.provider)}</strong>
      </div>
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

function getStorageProviderIcon(provider: CloudStorageProvider): string {
  return provider === CloudStorageProvider.Local ? 'hard_drive' : 'cloud'
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

export default StorageProviderSwitchDialog
