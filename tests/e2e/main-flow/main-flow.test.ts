import extractZip from 'extract-zip'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  E2E_MINECRAFT_VERSION,
  E2E_SERVER_NAME,
  E2E_WORLD_DATA,
  expectServerRunning,
  launchChunkShareE2EApp,
  readSelectedWorldE2EPaths
} from '../support/electron-test-app'

test('creates, starts, stops, and publishes a local world', async () => {
  const app = await launchChunkShareE2EApp()

  try {
    const { page, user } = app
    await expect(page.getByText('No servers yet')).toBeVisible()

    await user.click(page.getByRole('button', { name: 'Create Instance', exact: true }).first())
    await expect(page.getByRole('heading', { name: 'Create New Instance' })).toBeVisible()

    const minecraftVersion = page.getByLabel('Minecraft Version')
    await expect(minecraftVersion).toHaveValue(E2E_MINECRAFT_VERSION)
    await user.fill(page.getByLabel('Server Name'), E2E_SERVER_NAME)
    await user.fill(page.getByLabel('Server Port'), '25570')
    await user.check(page.getByLabel('I agree to the Minecraft EULA'))
    await user.click(page.getByRole('button', { name: 'Create Server', exact: true }))

    await expect(page.getByText('Server setup completed.')).toBeVisible()
    await user.click(page.getByRole('button', { name: 'Open Dashboard', exact: true }))
    await expect(page.getByRole('heading', { name: E2E_SERVER_NAME })).toBeVisible()

    await user.click(page.getByRole('button', { name: 'Start Server', exact: true }))
    await expectServerRunning(app)

    await user.click(page.getByRole('button', { name: 'Stop Server', exact: true }))
    await expect(page.getByText('STOPPED', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Server console output')).toContainText(
      /Server save v1 published in \d+(?:\.\d+)? (?:ms|s)\./
    )

    const worldPaths = await readSelectedWorldE2EPaths(app.paths)
    await expectPublishedWorld(app.paths.root, worldPaths.worldFile)
    await expectPublishedControl(worldPaths.controlFile)
  } finally {
    await app.close()
  }
})

async function expectPublishedWorld(root: string, worldFile: string): Promise<void> {
  const extractedWorldFolder = join(root, 'published-world')
  await mkdir(extractedWorldFolder, { recursive: true })
  await extractZip(worldFile, { dir: extractedWorldFolder })

  await expect(readFile(join(extractedWorldFolder, 'world', 'level.dat'), 'utf8')).resolves.toBe(
    E2E_WORLD_DATA
  )
}

async function expectPublishedControl(controlFile: string): Promise<void> {
  const control: unknown = JSON.parse(await readFile(controlFile, 'utf8'))

  expect(control).toMatchObject({
    latestSave: {
      minecraftVersion: E2E_MINECRAFT_VERSION,
      saveVersion: 1,
      serverName: E2E_SERVER_NAME
    },
    serverLock: {
      status: 'unlocked'
    }
  })
}
