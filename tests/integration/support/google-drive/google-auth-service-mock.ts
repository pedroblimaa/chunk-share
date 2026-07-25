import type { AuthSession } from '../../../../src/main/auth/auth-model'
import { googleDriveTestEnvironment } from './google-drive-test-environment'

export function ensureGoogleDriveAuthSession(): Promise<AuthSession> {
  return Promise.resolve(googleDriveTestEnvironment.getActiveSession())
}

export function authorizeGoogleDriveFiles(fileIds: string[]): Promise<void> {
  return googleDriveTestEnvironment.authorizeGoogleDriveFiles(fileIds)
}
