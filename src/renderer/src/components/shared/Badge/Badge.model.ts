import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeSize = 'small' | 'default'
export type BadgeTone =
  | 'default'
  | 'active'
  | 'disabled'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  dot?: boolean
  icon?: string
  iconFilled?: boolean
  size?: BadgeSize
  tone?: BadgeTone
}
