import './StorageProviderSwitchDialog.css'

import Button from '../../../../components/shared/Button/Button'
import Dialog from '../../../../components/shared/Dialog/Dialog'
import MaterialIcon from '../../../../components/shared/MaterialIcon/MaterialIcon'
import { StorageSettingsOperation } from '../../settings.model'
import StorageProviderSwitchChoice from './StorageProviderSwitchChoice'
import type { StorageProviderSwitchDialogProps } from './StorageProviderSwitchDialog.model'
import { getProviderSwitchProgressLabel } from './storage-provider-switch-helpers'

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
  const dialogIsBusy = operation !== StorageSettingsOperation.Idle
  const dialogContent = renderDialogContent({
    errorMessage,
    operation,
    preview,
    progress,
    onActivateTarget,
    onCancel,
    onCopyCurrentData,
    onRetry
  })

  if (!dialogContent) {
    return null
  }

  return (
    <Dialog
      className="settings-provider-switch-dialog"
      icon="swap_horiz"
      isBusy={dialogIsBusy}
      title="Switch Storage Mode"
      onClose={onCancel}
    >
      {dialogContent}
    </Dialog>
  )
}

function renderDialogContent({
  errorMessage,
  operation,
  preview,
  progress,
  onActivateTarget,
  onCancel,
  onCopyCurrentData,
  onRetry
}: StorageProviderSwitchDialogProps): React.JSX.Element | null {
  const progressLabel = getProviderSwitchProgressLabel(operation)

  if (preview) {
    return (
      <>
        {errorMessage && <p className="settings-provider-switch-error">{errorMessage}</p>}
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
  }

  if (progressLabel) {
    return (
      <div className="settings-provider-switch-loading" aria-live="polite">
        <MaterialIcon name="progress_activity" />
        <strong>{progressLabel}</strong>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <>
        <div>
          <strong>Unable to check storage data</strong>
          <span>{errorMessage}</span>
        </div>
        <div className="settings-provider-switch-actions">
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

  return null
}

export default StorageProviderSwitchDialog
