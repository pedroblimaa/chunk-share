import type { ButtonHTMLAttributes } from 'react'

export type ButtonSize = 'compact' | 'default' | 'large' | 'square'
export type ButtonVariant = 'danger' | 'ghost' | 'icon' | 'primary' | 'secondary'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean
  icon?: string | undefined
  size?: ButtonSize
  variant?: ButtonVariant | undefined
}
