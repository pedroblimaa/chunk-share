import { rename } from 'fs/promises'

const RENAME_ATTEMPTS = 8
const RENAME_RETRY_DELAY_MS = 25

export async function renameWithRetry(sourcePath: string, destinationPath: string): Promise<void> {
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath)
      return
    } catch (error) {
      if (!shouldRetryRename(error) || attempt === RENAME_ATTEMPTS) {
        throw error
      }

      await delay(RENAME_RETRY_DELAY_MS * attempt)
    }
  }
}

function shouldRetryRename(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'EPERM' || error.code === 'EBUSY')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
