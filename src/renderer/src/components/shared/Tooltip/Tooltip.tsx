import './Tooltip.css'

interface TooltipProps {
  children: React.ReactNode
  content?: string
}

function Tooltip({ children, content }: TooltipProps): React.JSX.Element {
  if (!content) {
    return <>{children}</>
  }

  return (
    <span className="tooltip" data-tooltip={content} title={content}>
      {children}
    </span>
  )
}

export default Tooltip
