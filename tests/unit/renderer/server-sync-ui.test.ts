import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LatestSave } from '../../../src/shared/domain'
import { formatLatestSaveLabel } from '../../../src/renderer/src/utils/server-sync-ui'

const NOW = new Date('2026-08-01T12:00:00.000Z')

describe('formatLatestSaveLabel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['2026-08-01T10:00:00.000Z', '2 hours ago'],
    ['2026-07-31T12:00:00.000Z', 'yesterday'],
    ['2026-08-01T11:59:00.000Z', '1 minute ago'],
    ['2026-08-01T11:59:30.000Z', 'Just now']
  ])('formats %s as English relative time', (uploadedAt, expectedLabel) => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    expect(formatLatestSaveLabel(createLatestSave(uploadedAt))).toBe(expectedLabel)
  })

  it('labels a missing save as unpublished', () => {
    expect(formatLatestSaveLabel(null)).toBe('Not published yet')
  })
})

function createLatestSave(uploadedAt: string): Exclude<LatestSave, null> {
  return {
    saveVersion: 1,
    uploadedAt,
    uploadedBy: {
      id: 'player-1',
      displayName: 'Player One',
      email: 'player@example.com',
      avatarUrl: null,
      avatarInitials: 'PO'
    },
    minecraftVersion: '26.2',
    serverType: 'vanilla'
  }
}
