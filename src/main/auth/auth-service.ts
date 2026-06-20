import { shell } from 'electron'
import type { Player } from '../../shared/domain'
import { clearPlayer, readLocalState, savePlayer } from '../storage/persistence/local-state-store'
import { AuthError } from './auth-error'
import {
  clearStoredGoogleAuthTokens,
  readStoredGoogleAuthTokens,
  writeStoredGoogleAuthTokens
} from './auth-token-store'
import {
  AuthErrorCode,
  type AuthSession,
  type GoogleAuthTokens,
  type GoogleUserProfile
} from './auth-model'
import {
  createGoogleAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchGoogleUserProfile,
  refreshGoogleAuthTokens
} from './google-oauth-client'
import { createGoogleAuthorizationServer } from './google-oauth-callback-server'
import { createOAuthState } from './google-oauth-state'
import { TOKEN_REFRESH_WINDOW_MS } from './auth-constants'

export async function signInWithGoogle(): Promise<AuthSession> {
  const state = createOAuthState()
  const authorizationServer = await createGoogleAuthorizationServer({ expectedState: state })
  const { authorizationUrl, codeVerifier } = await createGoogleAuthorizationUrl({
    redirectUri: authorizationServer.redirectUri,
    state
  })

  try {
    await shell.openExternal(authorizationUrl)

    const authorizationCode = await authorizationServer.waitForCode
    const tokens = await exchangeAuthorizationCode({
      code: authorizationCode.code,
      codeVerifier,
      redirectUri: authorizationCode.redirectUri
    })
    const profile = await fetchGoogleUserProfile(tokens)

    return saveAuthSession(tokens, profile)
  } finally {
    await authorizationServer.close().catch(() => undefined)
  }
}

export async function getCurrentAuthSession(): Promise<AuthSession | null> {
  try {
    let tokens = await readStoredGoogleAuthTokens()

    if (!tokens) {
      return null
    }

    if (shouldRefreshTokens(tokens)) {
      tokens = await refreshGoogleAuthTokens(tokens)
      await writeStoredGoogleAuthTokens(tokens)
    }

    const localState = await readLocalState()
    if (localState.player) {
      return {
        player: localState.player,
        tokens
      }
    }

    const profile = await fetchGoogleUserProfile(tokens)
    return saveAuthSession(tokens, profile)
  } catch (error) {
    if (shouldClearSessionAfterRestoreError(error)) {
      await clearAuthSession()
    }

    throw getSessionRestoreError(error)
  }
}

export async function signOutFromGoogle(): Promise<void> {
  await clearAuthSession()
}

async function clearAuthSession(): Promise<void> {
  await clearStoredGoogleAuthTokens()
  await clearPlayer()
}

async function saveAuthSession(
  tokens: GoogleAuthTokens,
  profile: GoogleUserProfile
): Promise<AuthSession> {
  const player = toPlayer(profile)

  await writeStoredGoogleAuthTokens(tokens)
  await savePlayer(player)

  return {
    player,
    tokens
  }
}

function shouldRefreshTokens(tokens: GoogleAuthTokens): boolean {
  return Date.parse(tokens.expiresAt) - TOKEN_REFRESH_WINDOW_MS <= Date.now()
}

function getSessionRestoreError(error: unknown): AuthError {
  if (!(error instanceof AuthError)) {
    return new AuthError(
      'Unable to restore Google session. Sign in again.',
      AuthErrorCode.ExpiredSession
    )
  }

  if (
    error.code === AuthErrorCode.InvalidStoredSession ||
    error.code === AuthErrorCode.ExpiredSession ||
    error.code === AuthErrorCode.MissingRefreshToken
  ) {
    return new AuthError(
      'Your Google session expired. Sign in again.',
      AuthErrorCode.ExpiredSession
    )
  }

  return error
}

function shouldClearSessionAfterRestoreError(error: unknown): boolean {
  return (
    error instanceof AuthError &&
    (error.code === AuthErrorCode.InvalidStoredSession ||
      error.code === AuthErrorCode.ExpiredSession ||
      error.code === AuthErrorCode.MissingRefreshToken)
  )
}

function toPlayer(profile: GoogleUserProfile): Player {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
    avatarInitials: profile.avatarInitials
  }
}
