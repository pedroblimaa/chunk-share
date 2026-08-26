import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { JavaConfig } from '../../../src/shared/domain'
import type { AppState } from '../../../src/shared/world'
import {
  launchChunkShareE2EApp,
  type ChunkShareE2EApp,
  type ElectronE2EPaths
} from '../support/electron-test-app'
import { createLocalWorld, navigateToServers, openServerDashboard } from '../support/local-world-e2e'

test('keeps the dashboard loading until a saved manual Java selection is ready', async () => {
  let app: ChunkShareE2EApp | null = null

  try {
    app = await launchChunkShareE2EApp()
    const initialApp = app
    await createLocalWorld(initialApp)
    await expect(initialApp.page.getByText('Preparing server...')).toBeHidden()
    await initialApp.user.uncheck(initialApp.page.getByLabel('Select Java automatically'))

    const javaSelect = initialApp.page.getByLabel('Java executable')
    await expect(javaSelect).toBeVisible()
    const executablePath = await javaSelect.inputValue()
    expect(executablePath).not.toBe('')
    await expect
      .poll(() => readSelectedJavaConfig(initialApp.paths))
      .toEqual({
        mode: 'custom',
        executablePath
      })

    await navigateToServers(initialApp)
    await openAndExpectManualJava(initialApp, executablePath)

    const paths = initialApp.paths
    await initialApp.close({ preserveData: true })
    app = null
    app = await launchChunkShareE2EApp({ paths })
    const relaunchedApp = app
    await navigateToServers(relaunchedApp)
    await openAndExpectManualJava(relaunchedApp, executablePath)
  } finally {
    await app?.close()
  }
})

async function openAndExpectManualJava(app: ChunkShareE2EApp, executablePath: string): Promise<void> {
  await app.setJavaInspectionDelay(500)
  await openServerDashboard(app)

  const loadingIndicator = app.page.getByText('Preparing server...')
  const automaticCheckbox = app.page.getByLabel('Select Java automatically')
  const javaSelect = app.page.getByLabel('Java executable')

  await expect(loadingIndicator).toBeVisible()
  expect(await automaticCheckbox.isChecked()).toBe(false)
  await expect(loadingIndicator).toBeHidden()

  await expect(automaticCheckbox).toBeEnabled()
  await expect(javaSelect).toBeEnabled()
  await expect(javaSelect).toHaveValue(executablePath)
  await expect(app.page.getByRole('button', { name: 'Start Server', exact: true })).toBeEnabled()
}

async function readSelectedJavaConfig(paths: ElectronE2EPaths): Promise<JavaConfig | undefined> {
  const appState = JSON.parse(await readFile(paths.localStateFile, 'utf8')) as AppState
  return appState.worlds.find(({ id }) => id === appState.selectedWorldId)?.javaConfig
}
