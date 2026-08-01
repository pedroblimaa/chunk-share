import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  E2E_MINECRAFT_VERSION,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp
} from '../support/electron-test-app'

const WORLD_A_NAME = 'World Alpha'
const WORLD_B_NAME = 'World Beta'

test('creates, selects, runs, and independently deletes multiple worlds', async () => {
  const app = await launchChunkShareE2EApp()

  try {
    await createWorld(app, WORLD_A_NAME, 25570)
    await navigateToServers(app)
    await createWorld(app, WORLD_B_NAME, 25571)
    await navigateToServers(app)

    await expect(getServerCard(app.page, WORLD_A_NAME)).toBeVisible()
    await expect(getServerCard(app.page, WORLD_B_NAME)).toBeVisible()

    await openServer(app, WORLD_A_NAME)
    await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
    await expect(app.page.getByText('RUNNING', { exact: true })).toBeVisible()
    await navigateToServers(app)

    await expect(app.page.getByRole('button', { name: 'Create Instance', exact: true })).toBeDisabled()
    await expect(
      getServerCard(app.page, WORLD_A_NAME).getByRole('button', { name: `Delete ${WORLD_A_NAME}` })
    ).toBeDisabled()
    await expect(
      getServerCard(app.page, WORLD_B_NAME).getByRole('button', { name: `Delete ${WORLD_B_NAME}` })
    ).toBeEnabled()

    await openServer(app, WORLD_B_NAME)
    await expect(app.page.getByRole('heading', { name: WORLD_B_NAME })).toBeVisible()
    await expect(app.page.getByRole('button', { name: 'Start Server', exact: true })).toBeDisabled()
    await navigateToServers(app)

    await app.user.click(
      getServerCard(app.page, WORLD_B_NAME).getByRole('button', { name: `Delete ${WORLD_B_NAME}` })
    )
    await app.user.click(app.page.getByRole('button', { name: 'Remove Server', exact: true }))
    await expect(getServerCard(app.page, WORLD_B_NAME)).toHaveCount(0)
    await expect(getServerCard(app.page, WORLD_A_NAME)).toBeVisible()

    await openServer(app, WORLD_A_NAME)
    await app.user.click(app.page.getByRole('button', { name: 'Stop Server', exact: true }))
    await expect(app.page.getByText('STOPPED', { exact: true })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('reenables world creation in Settings after the running server crashes', async () => {
  const app = await launchChunkShareE2EApp()

  try {
    await createWorld(app, WORLD_A_NAME, 25570)
    await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
    await expect(app.page.getByText('RUNNING', { exact: true })).toBeVisible()
    await app.user.click(app.page.getByRole('button', { name: 'Settings', exact: true }).first())

    const createInstanceButton = app.page.getByRole('button', { name: 'Create Instance', exact: true })
    await expect(createInstanceButton).toBeDisabled()
    await app.crashMinecraftServer()
    await expect(createInstanceButton).toBeEnabled()
  } finally {
    await app.close()
  }
})

async function createWorld(app: ChunkShareE2EApp, name: string, port: number): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Create Instance', exact: true }).first())
  await expect(app.page.getByRole('heading', { name: 'Create New Instance' })).toBeVisible()
  await app.user.fill(app.page.getByLabel('Server Name'), name)
  await app.user.fill(app.page.getByLabel('Server Port'), String(port))
  await app.user.check(app.page.getByLabel('I agree to the Minecraft EULA'))
  await app.user.click(app.page.getByRole('button', { name: 'Create Server', exact: true }))
  await expect(app.page.getByText('Server setup completed.')).toBeVisible()
  await app.user.click(app.page.getByRole('button', { name: 'Open Dashboard', exact: true }))
  await expect(app.page.getByRole('heading', { name })).toBeVisible()
  await expect(app.page.getByText(E2E_MINECRAFT_VERSION)).toBeVisible()
}

async function navigateToServers(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Servers', exact: true }).first())
  await expect(app.page.getByRole('button', { name: 'Create Instance', exact: true })).toBeVisible()
}

async function openServer(app: ChunkShareE2EApp, name: string): Promise<void> {
  await app.user.click(getServerCard(app.page, name).getByRole('button', { name: 'Manage', exact: true }))
  await expect(app.page.getByRole('heading', { name })).toBeVisible()
}

function getServerCard(page: Page, name: string): Locator {
  return page.locator('article.server-card').filter({ has: page.getByRole('heading', { name }) })
}
