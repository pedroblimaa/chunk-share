import { describe, expect, it } from 'vitest'
import {
  getAvatarImageSource,
  getNextAvatarImageAttempt
} from '../../../src/renderer/src/components/shared/Avatar/avatar-image'
import { getBadgeClassName } from '../../../src/renderer/src/components/shared/Badge/badge-classes'
import { getButtonClassName } from '../../../src/renderer/src/components/shared/Button/button-classes'
import { getCardClassName } from '../../../src/renderer/src/components/shared/Card/card-classes'

describe('shared UI component contracts', () => {
  it('retries a failed avatar image once before using initials', () => {
    const imageUrl = 'https://images.example.com/avatar.png?size=96'
    const retryAttempt = getNextAvatarImageAttempt(0)
    const fallbackAttempt = getNextAvatarImageAttempt(retryAttempt)

    expect(getAvatarImageSource(imageUrl, 0)).toBe(imageUrl)
    expect(getAvatarImageSource(imageUrl, retryAttempt)).toBe(
      'https://images.example.com/avatar.png?size=96&chunkshare-avatar-retry=1'
    )
    expect(getAvatarImageSource(imageUrl, fallbackAttempt)).toBeNull()
    expect(getAvatarImageSource('invalid-url', retryAttempt)).toBeNull()
  })

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

    expect(
      getCardClassName({
        hoverShadow: 'none',
        interactive: true
      })
    ).toBe(
      'chunk-card chunk-card-default chunk-card-padding-default chunk-card-interactive chunk-card-no-hover-shadow'
    )

    expect(
      getCardClassName({
        hoverShadow: 'subtle',
        interactive: true
      })
    ).toBe(
      'chunk-card chunk-card-default chunk-card-padding-default chunk-card-interactive chunk-card-subtle-hover-shadow'
    )
  })

  it('builds Badge classes from size and status tone variants', () => {
    const className = getBadgeClassName({ size: 'small', tone: 'success' })

    expect(className).toBe('chunk-badge chunk-badge-success chunk-badge-small')
  })
})
