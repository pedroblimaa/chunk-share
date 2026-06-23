export type ToastTone = 'error' | 'info' | 'success' | 'warning'

export interface ToastAction {
  icon?: string
  label: string
  onClick: () => void
}

export interface ToastProps {
  action?: ToastAction
  durationMs?: number
  icon?: string
  message: string
  title: string
  tone?: ToastTone
  onClose: () => void
}
