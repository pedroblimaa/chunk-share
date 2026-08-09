import type { BadgeProps } from './Badge.model'

export function getBadgeClassName({
  className = '',
  size = 'default',
  tone = 'default'
}: Pick<BadgeProps, 'className' | 'size' | 'tone'>): string {
  return ['chunk-badge', `chunk-badge-${tone}`, `chunk-badge-${size}`, className].filter(Boolean).join(' ')
}
