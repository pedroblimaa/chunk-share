import { ipcMain } from 'electron'
import { AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL } from '../../shared/ipc-channels'
import { signInWithMockGoogleUser } from '../mock-dashboard'

export function registerAuthIpcHandlers(): void {
  ipcMain.handle(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL, () => signInWithMockGoogleUser())
}
