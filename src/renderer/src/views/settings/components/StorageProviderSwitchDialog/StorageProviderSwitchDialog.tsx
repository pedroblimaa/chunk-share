import './StorageProviderSwitchDialog.css'

import { useEffect, useRef } from 'react'
import Button from '../../../../components/shared/Button/Button'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
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

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) {
      dialog.showModal()
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current

    const handleCancel = (event: Event): void => {
      if (dialogIsBusy) {
        event.preventDefault()
        return
      }

      onCancel()
    }

    dialog?.addEventListener('cancel', handleCancel)

    return () => dialog?.removeEventListener('cancel', handleCancel)
  }, [dialogIsBusy, onCancel])

  if (!dialogContent) {
    return null
  }

  return (
    <dialog
      className="settings-provider-switch-dialog"
      ref={dialogRef}
      aria-labelledby="settings-provider-switch-title"
    >
      <div className="settings-provider-switch-heading">
        <MaterialIcon name="swap_horiz" />
        <h3 id="settings-provider-switch-title">Switch Storage Mode</h3>
      </div>
      <div className="settings-provider-switch-content">{dialogContent}</div>
    </dialog>
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
