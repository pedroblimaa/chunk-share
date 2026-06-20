import './Popover.css'

import { useEffect, useRef } from 'react'
import type { PopoverProps } from './Popover.model'

function Popover({
  ariaLabel,
  children,
  className = '',
  content,
  contentClassName = '',
  contentRole = 'dialog',
  isOpen,
  onClose
}: PopoverProps): React.JSX.Element {
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function closeOnOutsideClick(event: PointerEvent): void {
      const target = event.target

      if (target instanceof Node && !popoverRef.current?.contains(target)) {
        onClose()
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen, onClose])

  const rootClassName = `chunk-popover${className ? ` ${className}` : ''}`
  const panelClassName = `chunk-popover-panel${contentClassName ? ` ${contentClassName}` : ''}`

  return (
    <div className={rootClassName} ref={popoverRef}>
      {children}
      {isOpen && (
        <div className={panelClassName} role={contentRole} aria-label={ariaLabel}>
          {content}
        </div>
      )}
    </div>
  )
}

export default Popover
