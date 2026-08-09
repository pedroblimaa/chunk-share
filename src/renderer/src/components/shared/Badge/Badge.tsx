import './Badge.css'

import MaterialIcon from '../MaterialIcon/MaterialIcon'
import { getBadgeClassName } from './badge-classes'
import type { BadgeProps } from './Badge.model'

function Badge({
  children,
  className = '',
  dot = false,
  icon,
  iconFilled = false,
  size = 'default',
  tone = 'default',
  ...badgeProps
}: BadgeProps): React.JSX.Element {
  const classes = getBadgeClassName({ className, size, tone })

  return (
    <span className={classes} {...badgeProps}>
      {dot && <span className="chunk-badge-dot" aria-hidden="true" />}
      {icon && <MaterialIcon name={icon} className="chunk-badge-icon" filled={iconFilled} />}
      <span>{children}</span>
    </span>
  )
}

export default Badge
