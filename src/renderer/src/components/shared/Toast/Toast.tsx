import './Toast.css'

import { useEffect } from 'react'
import Button from '../Button/Button'
import MaterialIcon from '../MaterialIcon/MaterialIcon'
import type { ToastProps } from './Toast.model'

function Toast({
  action,
  durationMs,
  icon,
  message,
  title,
  tone = 'info',
  onClose
}: ToastProps): React.JSX.Element {
  const isErrorToast = tone === 'error'

  useEffect(() => {
    if (!durationMs) {
      return undefined
    }

    const closeTimer = window.setTimeout(onClose, durationMs)

    return () => window.clearTimeout(closeTimer)
  }, [durationMs, onClose])

  return (
    <aside
      aria-live={isErrorToast ? 'assertive' : 'polite'}
      className={`toast toast-${tone}`}
      role={isErrorToast ? 'alert' : 'status'}
    >
      <div className="toast-icon">
        <MaterialIcon name={icon ?? getDefaultToastIcon(tone)} />
      </div>

      <div className="toast-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>

      <div className="toast-actions">
        {action ? (
          <Button
            aria-label={action.label}
            icon={action.icon}
            size="square"
            variant="ghost"
            onClick={action.onClick}
          />
        ) : null}
        <Button
          aria-label="Close notification"
          icon="close"
          size="square"
          variant="ghost"
          onClick={onClose}
        />
      </div>
    </aside>
  )
}

function getDefaultToastIcon(tone: ToastProps['tone']): string {
  switch (tone) {
    case 'error':
      return 'error'
    case 'success':
      return 'check_circle'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

export default Toast
