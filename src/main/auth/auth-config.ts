import {
  GOOGLE_OAUTH_CLIENT_ID_ENV_KEY,
  GOOGLE_OAUTH_CLIENT_SECRET_ENV_KEY
} from './auth-constants'
import { AuthError } from './auth-error'
import { AuthErrorCode, type GoogleOAuthConfig } from './auth-model'

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.CHUNKSHARE_GOOGLE_CLIENT_ID
  const clientSecret = process.env.CHUNKSHARE_GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new AuthError(
      `Google sign-in is not configured. Set ${GOOGLE_OAUTH_CLIENT_ID_ENV_KEY} and ${GOOGLE_OAUTH_CLIENT_SECRET_ENV_KEY}.`,
      AuthErrorCode.GoogleRequestFailed
    )
  }

  return {
    clientId,
    clientSecret
  }
}
