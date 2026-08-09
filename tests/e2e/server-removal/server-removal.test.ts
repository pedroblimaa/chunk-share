import { expect, test } from '@playwright/test'
import { E2E_SERVER_NAME, launchChunkShareE2EApp, type ChunkShareE2EApp } from '../support/electron-test-app'
import {
  createLocalWorld,
  openServerDashboard,
  publishLocalWorld,
  startServer,
  stopServer
} from '../support/local-world-e2e'

test('blocks removal while hosting and keeps a stopped world removed after relaunch', async () => {
  let app: ChunkShareE2EApp | null = await launchChunkShareE2EApp()

  try {
    await createLocalWorld(app)
    await publishLocalWorld(app)
    await startServer(app)
    await openServers(app)

    await expect(app.page.getByRole('button', { name: `Delete ${E2E_SERVER_NAME}` })).toBeDisabled()

    await openServerDashboard(app)
    await stopServer(app, 2)
    await openServers(app)
    await app.user.click(app.page.getByRole('button', { name: `Delete ${E2E_SERVER_NAME}` }))

    await expect(app.page.getByRole('dialog', { name: `Remove ${E2E_SERVER_NAME}?` })).toBeVisible()
    await app.user.click(app.page.getByRole('button', { name: 'Remove Server', exact: true }))
    await expect(app.page.getByText('No servers yet')).toBeVisible()

    const paths = app.paths
    await app.close({ preserveData: true })
    app = null
    app = await launchChunkShareE2EApp({ paths })

    await expect(app.page.getByText('No servers yet')).toBeVisible()
  } finally {
    await app?.close()
  }
})

async function openServers(app: ChunkShareE2EApp): Promise<void> {
  await app.user.click(app.page.getByRole('button', { name: 'Servers', exact: true }).first())
  await expect(app.page.getByRole('heading', { name: E2E_SERVER_NAME })).toBeVisible()
}
