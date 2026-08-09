import './MaterialIcon.css'

interface MaterialIconProps {
  name: string
  filled?: boolean
  className?: string
}

function MaterialIcon({ name, filled = false, className = '' }: MaterialIconProps): React.JSX.Element {
  const classes = ['material-symbols-outlined', filled ? 'material-icon-filled' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {name}
    </span>
  )
}

export default MaterialIcon
