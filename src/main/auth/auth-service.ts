import { shell } from 'electron'
import type { Player } from '../../shared/domain'
import { clearPlayer, readLocalState, savePlayer } from '../storage/persistence/local-state-store'
import { AuthError } from './auth-error'
import {
  clearStoredGoogleAuthTokens,
  readStoredGoogleAuthTokens,
  writeStoredGoogleAuthTokens
} from './auth-token-store'
import { AuthErrorCode, type AuthSession, type GoogleAuthTokens, type GoogleUserProfile } from './auth-model'
import {
  createGoogleAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchGoogleDriveUserEmail,
  fetchGoogleUserProfile,
  refreshGoogleAuthTokens
} from './google-oauth-client'
import { createGoogleAuthorizationServer } from './google-oauth-callback-server'
import { createOAuthState } from './google-oauth-state'
import {
  GOOGLE_DRIVE_OAUTH_SCOPES,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_FULL_DRIVE_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  TOKEN_REFRESH_WINDOW_MS
} from './auth-constants'

export async function signInWithGoogle(): Promise<AuthSession> {
  return signInWithGoogleScopes(GOOGLE_OAUTH_SCOPES, null, false)
}

export async function ensureGoogleDriveAuthSession(): Promise<AuthSession> {
  const currentSession = await getCurrentAuthSession()

  if (currentSession && googleTokensIncludeDriveAccess(currentSession.tokens)) {
    return currentSession
  }

  return signInWithGoogleScopes(GOOGLE_DRIVE_OAUTH_SCOPES, currentSession?.tokens.refreshToken ?? null, true)
}

export async function authorizeGoogleDriveFolder(folderId: string): Promise<void> {
  const currentSession = await getCurrentAuthSession()

  if (!currentSession) {
    throw new AuthError('Sign in with the invited Google account first.', AuthErrorCode.ExpiredSession)
  }

  const state = createOAuthState()
  const authorizationServer = await createGoogleAuthorizationServer({ expectedState: state })
  const { authorizationUrl, codeVerifier } = await createGoogleAuthorizationUrl({
    includeGrantedScopes: false,
    loginHint: currentSession.player.email,
    pickerFolderId: folderId,
    redirectUri: authorizationServer.redirectUri,
    scopes: [GOOGLE_DRIVE_SCOPE],
    state
  })

  try {
    await shell.openExternal(authorizationUrl)

    const authorizationCode = await authorizationServer.waitForCode
    assertPickedGoogleDriveFolder(authorizationCode.pickedFileIds, folderId)

    const tokens = await exchangeAuthorizationCode({
      code: authorizationCode.code,
      codeVerifier,
      fallbackRefreshToken: currentSession.tokens.refreshToken,
      scopes: [GOOGLE_DRIVE_SCOPE],
      redirectUri: authorizationCode.redirectUri
    })

    const driveUserEmail = await fetchGoogleDriveUserEmail(tokens)
    assertGoogleDriveAccountMatchesPlayer(driveUserEmail, currentSession.player.email)

    await writeStoredGoogleAuthTokens(tokens)
  } catch (error) {
    if (error instanceof AuthError && error.code === AuthErrorCode.Cancelled) {
      throw new AuthError(
        'Google Drive did not confirm this folder. Make sure you use an invited account.',
        AuthErrorCode.Cancelled
      )
    }

    throw error
  } finally {
    await authorizationServer.close().catch(() => undefined)
  }
}

export function googleTokensIncludeScope(tokens: GoogleAuthTokens, scope: string): boolean {
  return tokens.scope.split(/\s+/).includes(scope)
}

function assertPickedGoogleDriveFolder(pickedFileIds: string[], expectedFolderId: string): void {
  const folderIdsMatch = pickedFileIds.length === 1 && pickedFileIds[0] === expectedFolderId

  if (!folderIdsMatch) {
    throw new AuthError(
      'The confirmed Google Drive folder does not match this join link.',
      AuthErrorCode.InvalidCallback
    )
  }
}

function assertGoogleDriveAccountMatchesPlayer(driveUserEmail: string, playerEmail: string): void {
  if (driveUserEmail.toLowerCase() === playerEmail.toLowerCase()) {
    return
  }

  throw new AuthError(
    `Google Drive was authorized with ${driveUserEmail}, but ChunkShare is signed in as ${playerEmail}.`,
    AuthErrorCode.InvalidCallback
  )
}

function googleTokensIncludeDriveAccess(tokens: GoogleAuthTokens): boolean {
  return (
    googleTokensIncludeScope(tokens, GOOGLE_DRIVE_SCOPE) ||
    googleTokensIncludeScope(tokens, GOOGLE_FULL_DRIVE_SCOPE)
  )
}

async function signInWithGoogleScopes(
  scopes: string[],
  fallbackRefreshToken: string | null,
  includeGrantedScopes: boolean
): Promise<AuthSession> {
  const state = createOAuthState()
  const authorizationServer = await createGoogleAuthorizationServer({ expectedState: state })
  const { authorizationUrl, codeVerifier } = await createGoogleAuthorizationUrl({
    includeGrantedScopes,
    redirectUri: authorizationServer.redirectUri,
    scopes,
    state
  })

  try {
    await shell.openExternal(authorizationUrl)

    const authorizationCode = await authorizationServer.waitForCode
    const tokens = await exchangeAuthorizationCode({
      code: authorizationCode.code,
      codeVerifier,
      fallbackRefreshToken,
      scopes,
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

async function saveAuthSession(tokens: GoogleAuthTokens, profile: GoogleUserProfile): Promise<AuthSession> {
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
    return new AuthError('Unable to restore Google session. Sign in again.', AuthErrorCode.ExpiredSession)
  }

  if (
    error.code === AuthErrorCode.InvalidStoredSession ||
    error.code === AuthErrorCode.ExpiredSession ||
    error.code === AuthErrorCode.MissingRefreshToken
  ) {
    return new AuthError('Your Google session expired. Sign in again.', AuthErrorCode.ExpiredSession)
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
