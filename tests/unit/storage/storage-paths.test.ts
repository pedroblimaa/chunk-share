import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getWorldPaths } from '../../../src/main/storage/core/support/storage-paths'

const WORLD_ID = '3f93b975-260f-4e44-ad58-30fb8b9c7769'
const PROJECT_ROOT = process.cwd()

describe('world storage paths', () => {
  it('resolves server, storage, and backup paths under the world ID', () => {
    expect(getWorldPaths(WORLD_ID)).toEqual({
      serverFolder: join(PROJECT_ROOT, '.servers', WORLD_ID),
      serverJarFile: join(PROJECT_ROOT, '.servers', WORLD_ID, 'server.jar'),
      serverPropertiesFile: join(PROJECT_ROOT, '.servers', WORLD_ID, 'server.properties'),
      serverEulaFile: join(PROJECT_ROOT, '.servers', WORLD_ID, 'eula.txt'),
      storageFolder: join(PROJECT_ROOT, '.storage', WORLD_ID),
      storageControlFile: join(PROJECT_ROOT, '.storage', WORLD_ID, 'control.json'),
      storageWorldFile: join(PROJECT_ROOT, '.storage', WORLD_ID, 'world.zip'),
      backupsFolder: join(PROJECT_ROOT, '.backups', WORLD_ID)
    })
  })

  it('rejects path traversal instead of resolving it', () => {
    expect(() => getWorldPaths('../another-world')).toThrow('Invalid world ID.')
  })
})
