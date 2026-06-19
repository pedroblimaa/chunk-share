import type { GoogleCallbackFailureReason } from './auth-model'

export const GOOGLE_OAUTH_CLIENT_ID =
  '1080661261471-bccjets1uj3q7ldpiq7t1182rbl0j3kb.apps.googleusercontent.com'
export const GOOGLE_OAUTH_SCOPES = ['openid', 'email', 'profile']
export const GOOGLE_AUTH_PROMPT = 'consent'
export const GOOGLE_USER_INFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
export const GOOGLE_AUTH_TOKENS_FILE_NAME = 'google-auth-tokens.json'
export const GOOGLE_CALLBACK_TIMEOUT_MS = 120_000
export const TOKEN_REFRESH_WINDOW_MS = 60_000
export const GOOGLE_CALLBACK_PATH = '/oauth/google/callback'
export const GOOGLE_CALLBACK_SUCCESS_PAGE = {
  pageTitle: 'Sign-in complete',
  pageMessage: 'You can return to ChunkShare.'
}

export const GOOGLE_CALLBACK_FAILURES: Record<
  GoogleCallbackFailureReason,
  {
    pageTitle: string
    pageMessage: string
    errorMessage: string
  }
> = {
  cancelled: {
    pageTitle: 'Sign-in cancelled',
    pageMessage: 'You can close this window.',
    errorMessage: 'Google sign-in was cancelled. Try again when you are ready.'
  },
  'invalid-state': {
    pageTitle: 'Sign-in blocked',
    pageMessage: 'The sign-in response was invalid.',
    errorMessage: 'Google sign-in response did not match this app session.'
  },
  'missing-code': {
    pageTitle: 'Sign-in failed',
    pageMessage: 'No authorization code was returned.',
    errorMessage: 'Google did not return an authorization code.'
  }
}
