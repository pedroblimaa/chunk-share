import type { CardProps } from './Card.model'

export function getCardClassName({
  className = '',
  hoverShadow = 'default',
  interactive = false,
  padding = 'default',
  tone = 'default'
}: Pick<CardProps, 'className' | 'hoverShadow' | 'interactive' | 'padding' | 'tone'>): string {
  return [
    'chunk-card',
    `chunk-card-${tone}`,
    `chunk-card-padding-${padding}`,
    interactive ? 'chunk-card-interactive' : '',
    interactive && hoverShadow === 'none' ? 'chunk-card-no-hover-shadow' : '',
    interactive && hoverShadow === 'subtle' ? 'chunk-card-subtle-hover-shadow' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
}
