import { app, safeStorage } from 'electron'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { GOOGLE_AUTH_TOKENS_FILE_NAME } from './auth-constants'
import { AuthError } from './auth-error'
import type { GoogleAuthTokens, StoredGoogleAuthTokens } from './auth-model'

export async function readStoredGoogleAuthTokens(): Promise<GoogleAuthTokens | null> {
  const tokenFilePath = getGoogleAuthTokensFilePath()
  const fileContents = await readFile(tokenFilePath, 'utf8').catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  })

  if (!fileContents) {
    return null
  }

  const storedTokens = JSON.parse(fileContents) as StoredGoogleAuthTokens
  const encryptedTokens = Buffer.from(storedTokens.encryptedTokens, 'base64')

  return JSON.parse(safeStorage.decryptString(encryptedTokens)) as GoogleAuthTokens
}

export async function writeStoredGoogleAuthTokens(tokens: GoogleAuthTokens): Promise<void> {
  assertSafeStorageAvailable()

  const tokenFilePath = getGoogleAuthTokensFilePath()
  const encryptedTokens = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64')

  await mkdir(dirname(tokenFilePath), { recursive: true })
  await writeFile(
    tokenFilePath,
    JSON.stringify({ encryptedTokens } satisfies StoredGoogleAuthTokens, null, 2)
  )
}

export async function clearStoredGoogleAuthTokens(): Promise<void> {
  await unlink(getGoogleAuthTokensFilePath()).catch((error: unknown) => {
    if (!isMissingFileError(error)) {
      throw error
    }
  })
}

function getGoogleAuthTokensFilePath(): string {
  return join(app.getPath('userData'), GOOGLE_AUTH_TOKENS_FILE_NAME)
}

function assertSafeStorageAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AuthError('Secure local token storage is not available on this device.')
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
