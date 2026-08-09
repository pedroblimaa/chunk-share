import './Button.css'

import MaterialIcon from '../MaterialIcon/MaterialIcon'
import { getButtonClassName } from './button-classes'
import type { ButtonProps } from './Button.model'

function Button({
  children,
  className = '',
  fullWidth = false,
  icon,
  iconFilled = false,
  size = 'default',
  type = 'button',
  variant = 'primary',
  ...buttonProps
}: ButtonProps): React.JSX.Element {
  const classes = getButtonClassName({ className, fullWidth, size, variant })

  return (
    <button className={classes} type={type} {...buttonProps}>
      {icon && <MaterialIcon name={icon} filled={iconFilled} />}
      {children && <span className="chunk-button-label">{children}</span>}
    </button>
  )
}

export default Button
