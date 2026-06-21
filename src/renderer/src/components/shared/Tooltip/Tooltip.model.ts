export type TooltipPlacement = 'center' | 'left'

export interface TooltipProps {
  children: React.ReactNode
  content?: string
  placement?: TooltipPlacement
}
