import type { ButtonHTMLAttributes } from 'react'

export type ButtonSize = 'compact' | 'default' | 'large' | 'square' | 'square-compact' | 'square-large'
export type ButtonVariant =
  | 'danger'
  | 'danger-ghost'
  | 'ghost'
  | 'icon'
  | 'icon-quiet'
  | 'minimal'
  | 'primary'
  | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean
  icon?: string | undefined
  iconFilled?: boolean
  size?: ButtonSize
  variant?: ButtonVariant | undefined
}
