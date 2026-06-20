import './Button.css'

import MaterialIcon from '../MaterialIcon/MaterialIcon'
import type { ButtonProps } from './Button.model'

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
      {children && <span className="chunk-button-label">{children}</span>}
    </button>
  )
}

export default Button
