import type { CardProps } from './Card.model'

export function getCardClassName({
  className = '',
  interactive = false,
  padding = 'default',
  tone = 'default'
}: Pick<CardProps, 'className' | 'interactive' | 'padding' | 'tone'>): string {
  return [
    'chunk-card',
    `chunk-card-${tone}`,
    `chunk-card-padding-${padding}`,
    interactive ? 'chunk-card-interactive' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')
}
