import './Dialog.css'

import { useEffect, useRef } from 'react'
import Button from '../Button/Button'
import MaterialIcon from '../MaterialIcon/MaterialIcon'

interface DialogProps {
  children: React.ReactNode
  className?: string
  icon?: string
  isBusy?: boolean
  showCloseButton?: boolean
  title: string
  onClose: () => void
}

function Dialog({
  children,
  className = '',
  icon,
  isBusy = false,
  showCloseButton = false,
  title,
  onClose
}: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog?.open) {
        dialog.close()
      }
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    const handleCancel = (event: Event): void => {
      if (isBusy) {
        event.preventDefault()
        return
      }

      onClose()
    }

    dialog?.addEventListener('cancel', handleCancel)
    return () => dialog?.removeEventListener('cancel', handleCancel)
  }, [isBusy, onClose])

  return (
    <dialog
      aria-labelledby="chunk-dialog-title"
      className={`chunk-dialog ${className}`.trim()}
      ref={dialogRef}
    >
      <div className="chunk-dialog-heading">
        {icon && <MaterialIcon name={icon} />}
        <h3 id="chunk-dialog-title">{title}</h3>
        {showCloseButton && (
          <Button
            aria-label="Close dialog"
            disabled={isBusy}
            icon="close"
            size="square"
            variant="icon"
            onClick={onClose}
          />
        )}
      </div>
      <div className="chunk-dialog-content">{children}</div>
    </dialog>
  )
}

export default Dialog
