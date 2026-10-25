import { ZipArchive } from 'archiver'
import { createHash, randomUUID } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { extractFabricSavePackage } from '../../../src/main/storage/server-save/fabric-save-package'
import type { LatestSave } from '../../../src/shared/domain'
import { GOOGLE_TEST_ACCOUNTS } from '../../support/google-drive/google-drive-test-environment'
import { integrationTestDataPath } from '../support/integration-test-storage'
import { TEST_FABRIC_RUNTIME } from '../support/minecraft/fabric-meta-mock-handlers'
import { TEST_MINECRAFT_VERSION } from '../support/minecraft/minecraft-download-mock-handlers'

const WORLD_ID = '3f93b975-260f-4e44-ad58-30fb8b9c7769'
const VALID_FILES = {
  'world/level.dat': 'level',
  'mods/shared-mod.jar': 'mod'
}
const LATEST_SAVE: NonNullable<LatestSave> = {
  saveVersion: 1,
  uploadedAt: '2026-10-25T12:00:00.000Z',
  uploadedBy: GOOGLE_TEST_ACCOUNTS.owner.session.player,
  minecraftVersion: TEST_MINECRAFT_VERSION,
  serverType: 'fabric',
  fabric: TEST_FABRIC_RUNTIME
}

interface ArchiveOptions {
  files?: Record<string, string>
  manifestFiles?: Record<string, string>
  worldId?: string
}

describe('Fabric save package', () => {
  let workFolder: string

  beforeEach(async () => {
    workFolder = join(integrationTestDataPath, `fabric-package-${randomUUID()}`)
    await mkdir(workFolder, { recursive: true })
  })

  it('extracts a valid package and returns the mod fingerprint', async () => {
    const archive = await createTestArchive(workFolder)

    await expect(extractTestArchive(archive)).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects entries outside the shared folders', async () => {
    const archive = await createTestArchive(workFolder, {
      files: { ...VALID_FILES, 'server.jar': 'launcher' }
    })

    await expect(extractTestArchive(archive)).rejects.toThrow('Unexpected shared save entry: server.jar')
  })

  it('rejects paths that are not portable across platforms', async () => {
    const archive = await createTestArchive(workFolder, {
      files: { ...VALID_FILES, 'config/con.json': '{}' }
    })

    await expect(extractTestArchive(archive)).rejects.toThrow('Invalid shared file path')
  })

  it('rejects a manifest from another world', async () => {
    const archive = await createTestArchive(workFolder, { worldId: randomUUID() })

    await expect(extractTestArchive(archive)).rejects.toThrow('does not match the shared world metadata')
  })

  it('rejects files that do not match the manifest hashes', async () => {
    const archive = await createTestArchive(workFolder, {
      manifestFiles: { ...VALID_FILES, 'mods/shared-mod.jar': 'another mod' }
    })

    await expect(extractTestArchive(archive)).rejects.toThrow('failed file integrity verification')
  })

  it('rejects a package without a world', async () => {
    const files = { 'mods/shared-mod.jar': 'mod' }
    const archive = await createTestArchive(workFolder, { files, manifestFiles: files })

    await expect(extractTestArchive(archive)).rejects.toThrow('does not contain a valid world')
  })

  function extractTestArchive(archive: string): Promise<string> {
    return extractFabricSavePackage(archive, join(workFolder, 'extracted'), WORLD_ID, LATEST_SAVE)
  }
})

async function createTestArchive(folder: string, options: ArchiveOptions = {}): Promise<string> {
  const files = options.files ?? VALID_FILES
  const manifest = {
    formatVersion: 1,
    worldId: options.worldId ?? WORLD_ID,
    minecraftVersion: TEST_MINECRAFT_VERSION,
    fabric: TEST_FABRIC_RUNTIME,
    files: Object.entries(options.manifestFiles ?? files)
      .filter(([path]) => /^(world|mods|config)\//.test(path))
      .map(([path, contents]) => ({ path, sha256: createHash('sha256').update(contents).digest('hex') }))
      .sort((first, second) => first.path.localeCompare(second.path))
  }
  const archivePath = join(folder, 'world.zip')
  const archive = new ZipArchive()
  const output = createWriteStream(archivePath)
  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
  })

  archive.pipe(output)
  archive.append(JSON.stringify(manifest), { name: 'manifest.json' })

  for (const [path, contents] of Object.entries(files)) {
    archive.append(contents, { name: path })
  }

  await Promise.all([archive.finalize(), finished])

  return archivePath
}
