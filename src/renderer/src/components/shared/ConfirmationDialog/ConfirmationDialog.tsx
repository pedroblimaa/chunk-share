import './ConfirmationDialog.css'

import Button from '../Button/Button'
import MaterialIcon from '../MaterialIcon/MaterialIcon'

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
    <div
      aria-labelledby="confirmation-dialog-title"
      aria-modal="true"
      className="confirmation-dialog-backdrop"
      role="dialog"
    >
      <section className="confirmation-dialog">
        <div className="confirmation-dialog-icon">
          <MaterialIcon name={icon} />
        </div>
        <div className="confirmation-dialog-copy">
          <h3 id="confirmation-dialog-title">{title}</h3>
          <p>{description}</p>
        </div>
        <div className="confirmation-dialog-actions">
          <Button disabled={isLoading} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button disabled={isLoading} icon={confirmIcon} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmationDialog
