import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { ServerLockStatus } from '../../../src/shared/domain'
import {
  E2E_SERVER_NAME,
  launchChunkShareE2EApp,
  readSelectedWorldE2EPaths,
  type ChunkShareE2EApp
} from '../support/electron-test-app'
import { createLocalWorld, publishLocalWorld, startServer, stopServer } from '../support/local-world-e2e'

test('repairs an invalid lock in control.json without losing the published save', async () => {
  let app: ChunkShareE2EApp | null = await launchChunkShareE2EApp()

  try {
    await createLocalWorld(app)
    await publishLocalWorld(app)
    const paths = app.paths
    const worldPaths = await readSelectedWorldE2EPaths(paths)
    await app.close({ preserveData: true })
    app = null

    await corruptServerLock(worldPaths.controlFile)
    app = await launchChunkShareE2EApp({ paths })

    await expect(app.page.getByRole('dialog', { name: 'Repair Hosting Lock?' })).toBeVisible()
    await app.user.click(app.page.getByRole('button', { name: 'Reset Lock' }))
    await expect(app.page.getByRole('heading', { name: E2E_SERVER_NAME })).toBeVisible()
    await expectControlRecovered(worldPaths.controlFile)

    await app.user.click(app.page.getByRole('button', { name: 'Manage', exact: true }))
    await startServer(app)
    await stopServer(app, 2)
  } finally {
    await app?.close()
  }
})

async function corruptServerLock(controlFile: string): Promise<void> {
  const control = JSON.parse(await readFile(controlFile, 'utf8')) as Record<string, unknown>

  await writeFile(
    controlFile,
    JSON.stringify(
      {
        ...control,
        serverLock: {
          status: ServerLockStatus.Locked
        }
      },
      null,
      2
    )
  )
}

async function expectControlRecovered(controlFile: string): Promise<void> {
  const control: unknown = JSON.parse(await readFile(controlFile, 'utf8'))

  expect(control).toMatchObject({
    latestSave: { saveVersion: 1 },
    serverLock: { status: ServerLockStatus.Unlocked }
  })
}
