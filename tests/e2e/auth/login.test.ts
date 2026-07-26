import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchChunkShareE2EApp } from '../support/electron-test-app'

test('signs in with Google and restores the saved session', async () => {
  const app = await launchChunkShareE2EApp({ authenticated: false })

  try {
    const { page, user } = app
    const accountMenu = page.getByRole('button', { name: 'Account menu for E2E Player' })

    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    await user.click(page.getByRole('button', { name: 'Sign in with Google' }))

    await expect(page.getByText('No servers yet')).toBeVisible()
    await expect(accountMenu).toBeVisible()
    await expectSavedLogin(app.paths.localStateFile, app.paths.userDataFolder)

    await page.reload()

    await expect(page.getByText('No servers yet')).toBeVisible()
    await expect(accountMenu).toBeVisible()
  } finally {
    await app.close()
  }
})

async function expectSavedLogin(localStateFile: string, userDataFolder: string): Promise<void> {
  const localState: unknown = JSON.parse(await readFile(localStateFile, 'utf8'))
  const storedTokens = await readFile(join(userDataFolder, 'google-auth-tokens.json'), 'utf8')

  expect(localState).toMatchObject({
    player: {
      displayName: 'E2E Player',
      email: 'e2e@example.com',
      id: 'e2e-player'
    }
  })
  expect(JSON.parse(storedTokens)).toMatchObject({
    encryptedTokens: expect.any(String)
  })
  expect(storedTokens).not.toContain('e2e-access-token')
}
