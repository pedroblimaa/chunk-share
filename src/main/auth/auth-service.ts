import { shell } from 'electron'
import type { Player } from '../../shared/domain'
import { clearPlayer, readLocalState, savePlayer } from '../storage/local-state-store'
import { AuthError } from './auth-error'
import {
  clearStoredGoogleAuthTokens,
  readStoredGoogleAuthTokens,
  writeStoredGoogleAuthTokens
} from './auth-token-store'
import type { AuthSession, GoogleAuthTokens, GoogleUserProfile } from './auth-model'
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
}

export async function signOutFromGoogle(): Promise<void> {
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

function toPlayer(profile: GoogleUserProfile): Player {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    avatarInitials: profile.avatarInitials
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message
  }

  if (error instanceof Error) {
    return `Google sign-in failed: ${error.message}`
  }

  return 'Google sign-in failed.'
}
