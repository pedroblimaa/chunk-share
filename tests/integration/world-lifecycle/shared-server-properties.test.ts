import { readdir, readFile, writeFile } from 'fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadLatestSharedSave } from '../../../src/main/server-runtime/server-runtime-service'
import { getSelectedWorldContext } from '../../../src/main/storage/core/world-context'
import { saveWorldLocalSaveVersion } from '../../../src/main/storage/persistence/local-state-store'
import { publishServerSave } from '../../../src/main/storage/server-save/server-save-publisher'
import { resetMinecraftProcessMock } from '../support/minecraft/minecraft-process-mock'
import { TEST_WORLD_PORT, createLocalTestWorld } from '../support/world-test-data'

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process')
  const processMock = await import('../support/minecraft/minecraft-process-mock')

  return {
    ...actual,
    execFile: processMock.inspectJavaProcess,
    spawn: processMock.spawnMinecraftProcess
  }
})

describe('shared server properties', () => {
  beforeEach(resetMinecraftProcessMock)

  it('restores shared settings while keeping device-specific properties local', async () => {
    await createLocalTestWorld()
    const { worldId, paths } = await getSelectedWorldContext()
    await writeFile(
      paths.serverPropertiesFile,
      ['difficulty=hard', 'server-port=1111', 'server-ip=192.168.0.10', 'level-name=world'].join('\n')
    )
    await publishServerSave()

    await writeFile(paths.serverPropertiesFile, ['difficulty=easy', 'server-ip=10.0.0.5'].join('\n'))
    await saveWorldLocalSaveVersion(worldId, null)
    await downloadLatestSharedSave()

    const properties = await readFile(paths.serverPropertiesFile, 'utf8')

    expect(properties.trimEnd().split('\n')).toEqual([
      'difficulty=hard',
      `server-port=${TEST_WORLD_PORT}`,
      'server-ip=10.0.0.5',
      'level-name=world'
    ])
    await expect(readdir(paths.serverWorldFolder)).resolves.toEqual(['level.dat'])
  })
})
