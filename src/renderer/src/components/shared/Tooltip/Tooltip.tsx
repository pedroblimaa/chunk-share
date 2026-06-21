import './Tooltip.css'

import type { TooltipProps } from './Tooltip.model'

function Tooltip({ children, content, placement = 'center' }: TooltipProps): React.JSX.Element {
  if (!content) {
    return <>{children}</>
  }

  return (
    <span className="tooltip" data-placement={placement} data-tooltip={content}>
      {children}
    </span>
  )
}

export default Tooltip
