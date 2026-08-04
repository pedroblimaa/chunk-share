import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ServerLockStatus } from '../../../src/shared/domain'
import type { AppState } from '../../../src/shared/world'
import {
  E2E_MINECRAFT_VERSION,
  expectServerRunning,
  launchChunkShareE2EApp,
  type ChunkShareE2EApp,
  type ElectronE2EPaths
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
    await expectServerRunning(app)
    await navigateToServers(app)

    await expect(app.page.getByRole('button', { name: 'Create Server', exact: true })).toBeDisabled()
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
    await expectServerRunning(app)
    await app.user.click(app.page.getByRole('button', { name: 'Settings', exact: true }).first())

    const createServerButton = app.page.getByRole('button', { name: 'Create Server', exact: true })
    await expect(createServerButton).toBeDisabled()
    await app.crashMinecraftServer()
    await expect(createServerButton).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('restores multiple worlds and their selection after relaunch', async () => {
  let app: ChunkShareE2EApp | null = await launchChunkShareE2EApp()

  try {
    await createWorld(app, WORLD_A_NAME, 25570)
    await navigateToServers(app)
    await createWorld(app, WORLD_B_NAME, 25571)

    const selectedWorldId = (await readE2EAppState(app.paths)).selectedWorldId
    const paths = app.paths
    await app.close({ preserveData: true })
    app = null
    app = await launchChunkShareE2EApp({ paths })
    await navigateToServers(app)

    await expect(getServerCard(app.page, WORLD_A_NAME)).toBeVisible()
    await expect(getServerCard(app.page, WORLD_B_NAME)).toBeVisible()
    expect((await readE2EAppState(app.paths)).selectedWorldId).toBe(selectedWorldId)
  } finally {
    await app?.close()
  }
})

test('keeps a crashed world locked while another world runs after relaunch', async () => {
  let app: ChunkShareE2EApp | null = await launchChunkShareE2EApp()

  try {
    await createWorld(app, WORLD_A_NAME, 25570)
    const worldAId = findWorldId(await readE2EAppState(app.paths), WORLD_A_NAME)
    await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
    await expectServerRunning(app)
    await app.crashMinecraftServer()
    await app.user.click(app.page.getByRole('button', { name: 'Settings', exact: true }).first())
    await expect(app.page.getByRole('button', { name: 'Create Server', exact: true })).toBeEnabled()

    await createWorld(app, WORLD_B_NAME, 25571)
    const worldBId = findWorldId(await readE2EAppState(app.paths), WORLD_B_NAME)
    await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
    await expectServerRunning(app)
    await app.user.click(app.page.getByRole('button', { name: 'Stop Server', exact: true }))
    await expect(app.page.getByText('STOPPED', { exact: true })).toBeVisible()

    let state = await readE2EAppState(app.paths)
    expect(state.worlds.find(({ id }) => id === worldAId)?.activeSessionId).not.toBeNull()
    expect(state.worlds.find(({ id }) => id === worldBId)?.activeSessionId).toBeNull()

    const paths = app.paths
    await app.close({ preserveData: true })
    app = null
    app = await launchChunkShareE2EApp({ paths })
    state = await readE2EAppState(app.paths)

    expect(state.worlds.find(({ id }) => id === worldAId)?.activeSessionId).not.toBeNull()
    expect(state.worlds.find(({ id }) => id === worldBId)?.activeSessionId).toBeNull()
    await expect(readWorldControl(app.paths, worldAId)).resolves.toMatchObject({
      serverLock: { status: ServerLockStatus.Locked }
    })
    await navigateToServers(app)
    await expect(getServerCard(app.page, WORLD_A_NAME)).toBeVisible()
    await expect(getServerCard(app.page, WORLD_B_NAME)).toBeVisible()
  } finally {
    await app?.close()
  }
})

async function createWorld(app: ChunkShareE2EApp, name: string, port: number): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Create Server', exact: true }).first())
  await expect(app.page.getByRole('heading', { name: 'Create New Server' })).toBeVisible()
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
  await expect(app.page.getByRole('button', { name: 'Create Server', exact: true })).toBeVisible()
}

async function openServer(app: ChunkShareE2EApp, name: string): Promise<void> {
  await app.user.click(getServerCard(app.page, name).getByRole('button', { name: 'Manage', exact: true }))
  await expect(app.page.getByRole('heading', { name })).toBeVisible()
}

function getServerCard(page: Page, name: string): Locator {
  return page.locator('article.server-card').filter({ has: page.getByRole('heading', { name }) })
}

function readE2EAppState(paths: ElectronE2EPaths): Promise<AppState> {
  return readFile(paths.localStateFile, 'utf8').then((content) => JSON.parse(content) as AppState)
}

async function readWorldControl(paths: ElectronE2EPaths, worldId: string): Promise<unknown> {
  const content = await readFile(join(paths.root, '.storage', worldId, 'control.json'), 'utf8')
  return JSON.parse(content) as unknown
}

function findWorldId(state: AppState, name: string): string {
  const worldId = state.worlds.find((world) => world.serverConfig.name === name)?.id

  if (!worldId) {
    throw new Error(`Expected ${name} to exist in E2E state.`)
  }

  return worldId
}
