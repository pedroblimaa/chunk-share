import './ConfirmationDialog.css'

import Button from '../Button/Button'
import Dialog from '../Dialog/Dialog'

interface ConfirmationDialogProps {
  cancelLabel?: string
  confirmIcon?: string
  confirmLabel: string
  description: string
  icon: string
  isLoading?: boolean
  title: string
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmationDialog({
  cancelLabel = 'Cancel',
  confirmIcon,
  confirmLabel,
  description,
  icon,
  isLoading = false,
  title,
  onCancel,
  onConfirm
}: ConfirmationDialogProps): React.JSX.Element {
  return (
    <Dialog className="confirmation-dialog" icon={icon} isBusy={isLoading} title={title} onClose={onCancel}>
      <p className="confirmation-dialog-description">{description}</p>
      <div className="confirmation-dialog-actions">
        <Button disabled={isLoading} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button disabled={isLoading} icon={confirmIcon} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

export default ConfirmationDialog
