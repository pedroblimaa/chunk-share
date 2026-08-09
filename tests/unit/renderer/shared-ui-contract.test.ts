import { describe, expect, it } from 'vitest'
import { getBadgeClassName } from '../../../src/renderer/src/components/shared/Badge/badge-classes'
import { getButtonClassName } from '../../../src/renderer/src/components/shared/Button/button-classes'
import { getCardClassName } from '../../../src/renderer/src/components/shared/Card/card-classes'

describe('shared UI component contracts', () => {
  it('builds Button classes from explicit size and visual variants', () => {
    const className = getButtonClassName({
      size: 'square-large',
      variant: 'danger-ghost'
    })

    expect(className).toBe('chunk-button chunk-button-danger-ghost chunk-button-square-large')
  })

  it('builds Card classes from padding, tone, and interaction variants', () => {
    const className = getCardClassName({
      className: 'server-card',
      interactive: true,
      padding: 'none',
      tone: 'active'
    })

    expect(className).toBe(
      'chunk-card chunk-card-active chunk-card-padding-none chunk-card-interactive server-card'
    )
  })

  it('builds Badge classes from size and status tone variants', () => {
    const className = getBadgeClassName({ size: 'small', tone: 'success' })

    expect(className).toBe('chunk-badge chunk-badge-success chunk-badge-small')
  })
})
