import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listVanillaReleaseVersions } from '../../../src/main/server-setup/vanilla-version-resolver'

const manifestVersions = [
  { id: '1.21.8', type: 'release', url: 'https://minecraft.test/1.21.8.json' },
  { id: '1.2.5', type: 'release', url: 'https://minecraft.test/1.2.5.json' },
  { id: '1.2.4', type: 'release', url: 'https://minecraft.test/1.2.4.json' },
  { id: '1.2.3', type: 'release', url: 'https://minecraft.test/1.2.3.json' },
  { id: '1.2.2', type: 'release', url: 'https://minecraft.test/1.2.2.json' },
  { id: '1.2.1', type: 'release', url: 'https://minecraft.test/1.2.1.json' },
  { id: '1.1', type: 'release', url: 'https://minecraft.test/1.1.json' },
  { id: '1.0', type: 'release', url: 'https://minecraft.test/1.0.json' },
  { id: 'old-snapshot', type: 'snapshot', url: 'https://minecraft.test/old-snapshot.json' }
]

describe('Minecraft vanilla version listing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ versions: manifestVersions })))
    )
  })

  it('lists releases with server downloads from 1.2.5 onward', async () => {
    await expect(listVanillaReleaseVersions()).resolves.toEqual([
      { id: '1.21.8', metadataUrl: 'https://minecraft.test/1.21.8.json' },
      { id: '1.2.5', metadataUrl: 'https://minecraft.test/1.2.5.json' }
    ])
  })

  it('reports manifest fetch failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')))
    )

    await expect(listVanillaReleaseVersions()).rejects.toThrow('Unable to fetch Minecraft metadata: offline')
  })
})
