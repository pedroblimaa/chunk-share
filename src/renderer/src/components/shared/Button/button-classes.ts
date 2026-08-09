import type { ButtonProps } from './Button.model'

export function getButtonClassName({
  className = '',
  fullWidth = false,
  size = 'default',
  variant = 'primary'
}: Pick<ButtonProps, 'className' | 'fullWidth' | 'size' | 'variant'>): string {
  return [
    'chunk-button',
    `chunk-button-${variant}`,
    `chunk-button-${size}`,
    fullWidth ? 'chunk-button-full-width' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
}
