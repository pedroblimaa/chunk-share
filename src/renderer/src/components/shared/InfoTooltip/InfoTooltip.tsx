import Button from '../Button/Button'
import Tooltip from '../Tooltip/Tooltip'
import type { TooltipPlacement } from '../Tooltip/Tooltip.model'

interface InfoTooltipProps {
  ariaLabel: string
  content: string
  placement?: TooltipPlacement
}

function InfoTooltip({ ariaLabel, content, placement = 'top' }: InfoTooltipProps): React.JSX.Element {
  return (
    <Tooltip content={content} placement={placement}>
      <Button aria-label={ariaLabel} icon="info" size="square-compact" variant="icon-quiet" />
    </Tooltip>
  )
}

export default InfoTooltip
