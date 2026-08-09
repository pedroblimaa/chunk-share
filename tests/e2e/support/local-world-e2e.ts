import { expect } from '@playwright/test'
import {
  E2E_MINECRAFT_VERSION,
  E2E_SERVER_NAME,
  expectServerRunning,
  type ChunkShareE2EApp
} from './electron-test-app'

export async function createLocalWorld(app: ChunkShareE2EApp): Promise<void> {
  const { page, user } = app

  await user.click(page.getByRole('button', { name: 'Create Server', exact: true }).first())
  await user.fill(page.getByLabel('Server Name'), E2E_SERVER_NAME)
  await user.fill(page.getByLabel('Server Port'), '25570')
  await user.check(page.getByLabel('I agree to the Minecraft EULA'))
  await user.click(page.getByRole('button', { name: 'Create Server', exact: true }))

  await expect(page.getByText('Server setup completed.')).toBeVisible()
  await user.click(page.getByRole('button', { name: 'Open Dashboard', exact: true }))
  await expect(page.getByRole('heading', { name: E2E_SERVER_NAME })).toBeVisible()
  await expect(page.getByText(E2E_MINECRAFT_VERSION)).toBeVisible()
}

export async function startServer(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Start Server', exact: true }))
  await expectServerRunning(app)
}

export async function stopServer(app: ChunkShareE2EApp, publishedVersion: number): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Stop Server', exact: true }))
  await expect(app.page.getByText('STOPPED', { exact: true })).toBeVisible()
  await expect(app.page.getByLabel('Server console output')).toContainText(
    new RegExp(`Server save v${publishedVersion} published in \\d+(?:\\.\\d+)? (?:ms|s)\\.`)
  )
}

export async function publishLocalWorld(app: ChunkShareE2EApp): Promise<void> {
  await startServer(app)
  await stopServer(app, 1)
}

export async function openServerDashboard(
  app: ChunkShareE2EApp,
  serverName = E2E_SERVER_NAME
): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: `Open ${serverName}`, exact: true }))
  await expect(app.page.getByRole('heading', { name: serverName })).toBeVisible()
}
