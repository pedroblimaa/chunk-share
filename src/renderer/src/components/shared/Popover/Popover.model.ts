import type { ReactNode } from 'react'

export interface PopoverProps {
  ariaLabel: string
  children: ReactNode
  className?: string
  content: ReactNode
  contentClassName?: string
  contentRole?: 'dialog' | 'menu'
  isOpen: boolean
  onClose: () => void
}
