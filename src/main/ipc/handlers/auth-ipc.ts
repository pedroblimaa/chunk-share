import {
  AUTH_CANCEL_GOOGLE_SIGN_IN_CHANNEL,
  AUTH_GET_SESSION_CHANNEL,
  AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL,
  AUTH_SIGN_OUT_CHANNEL
} from '../../../shared/ipc-channels'
import {
  cancelGoogleSignIn,
  getCurrentAuthSession,
  signInWithGoogle,
  signOutFromGoogle
} from '../../auth/auth-service'
import { getServerDisplayState } from '../../dashboard/dashboard-service'
import { handleIpc } from '../typed-ipc'

export function registerAuthIpcHandlers(): void {
  handleIpc(AUTH_CANCEL_GOOGLE_SIGN_IN_CHANNEL, () => cancelGoogleSignIn())

  handleIpc(AUTH_GET_SESSION_CHANNEL, async () => {
    await getCurrentAuthSession()

    return getServerDisplayState()
  })

  handleIpc(AUTH_SIGN_IN_WITH_GOOGLE_CHANNEL, async () => {
    await signInWithGoogle()

    return getServerDisplayState()
  })

  handleIpc(AUTH_SIGN_OUT_CHANNEL, async () => {
    await signOutFromGoogle()

    return getServerDisplayState()
  })
}
