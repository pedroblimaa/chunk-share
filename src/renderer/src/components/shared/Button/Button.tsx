import './Button.css'

import type { ButtonHTMLAttributes } from 'react'
import MaterialIcon from '../MaterialIcon/MaterialIcon'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'default' | 'large'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean
  icon?: string
  size?: ButtonSize
  variant?: ButtonVariant
}

function Button({
  children,
  className = '',
  fullWidth = false,
  icon,
  size = 'default',
  type = 'button',
  variant = 'primary',
  ...buttonProps
}: ButtonProps): React.JSX.Element {
  const classes = [
    'chunk-button',
    `chunk-button-${variant}`,
    `chunk-button-${size}`,
    fullWidth ? 'chunk-button-full-width' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} type={type} {...buttonProps}>
      {icon && <MaterialIcon name={icon} />}
      <span className="chunk-button-label">{children}</span>
    </button>
  )
}

export default Button
