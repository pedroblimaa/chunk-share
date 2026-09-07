import type { HTMLAttributes } from 'react'

export type AvatarSize = 'default' | 'large'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  imageUrl?: string | null
  initials: string
  interactive?: boolean
  isActive?: boolean
  size?: AvatarSize
}
