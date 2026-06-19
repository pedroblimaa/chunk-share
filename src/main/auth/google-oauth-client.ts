import { CodeChallengeMethod, OAuth2Client, type Credentials } from 'google-auth-library'
import {
  GOOGLE_AUTH_PROMPT,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_USER_INFO_ENDPOINT
} from './auth-constants'
import { AuthError } from './auth-error'
import {
  AuthErrorCode,
  type ExchangeAuthorizationCodeInput,
  type GoogleAuthTokens,
  type GoogleUserInfoResponse,
  type GoogleUserProfile
} from './auth-model'

export function createGoogleOAuthClient(redirectUri?: string): OAuth2Client {
  return new OAuth2Client({
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    redirectUri
  })
}

export async function createGoogleAuthorizationUrl(input: {
  redirectUri: string
  state: string
}): Promise<{ authorizationUrl: string; codeVerifier: string }> {
  try {
    const oauthClient = createGoogleOAuthClient(input.redirectUri)
    const { codeChallenge, codeVerifier } = await oauthClient.generateCodeVerifierAsync()
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: GOOGLE_AUTH_PROMPT,
      scope: GOOGLE_OAUTH_SCOPES,
      state: input.state
    })

    return {
      authorizationUrl,
      codeVerifier
    }
  } catch (error) {
    throw createGoogleRequestError(error, 'Unable to prepare Google sign-in. Try again.')
  }
}

export async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  redirectUri
}: ExchangeAuthorizationCodeInput): Promise<GoogleAuthTokens> {
  const oauthClient = createGoogleOAuthClient(redirectUri)
  const { tokens } = await runGoogleRequest(
    () =>
      oauthClient.getToken({
        code,
        codeVerifier
      }),
    'Unable to finish Google sign-in. Try again.'
  )

  if (!tokens.refresh_token) {
    throw new AuthError(
      'Google did not return a refresh token. Try signing in again.',
      AuthErrorCode.MissingRefreshToken
    )
  }

  return createGoogleAuthTokens(tokens, tokens.refresh_token)
}

export async function refreshGoogleAuthTokens(tokens: GoogleAuthTokens): Promise<GoogleAuthTokens> {
  if (!tokens.refreshToken) {
    throw new AuthError(
      'Google session cannot be refreshed. Sign in again.',
      AuthErrorCode.MissingRefreshToken
    )
  }

  const oauthClient = createAuthenticatedOAuthClient(tokens)
  const { credentials } = await runGoogleRequest(
    () => oauthClient.refreshAccessToken(),
    'Your Google session expired. Sign in again.',
    AuthErrorCode.ExpiredSession
  )

  return createGoogleAuthTokens(credentials, tokens.refreshToken)
}

export async function fetchGoogleUserProfile(tokens: GoogleAuthTokens): Promise<GoogleUserProfile> {
  const oauthClient = createAuthenticatedOAuthClient(tokens)
  const response = await runGoogleRequest(
    () => oauthClient.fetch<GoogleUserInfoResponse>(GOOGLE_USER_INFO_ENDPOINT),
    'Unable to read Google profile. Sign in again.'
  )

  if (response.status < 200 || response.status >= 300) {
    throw new AuthError(
      'Unable to read Google profile. Sign in again.',
      AuthErrorCode.GoogleRequestFailed
    )
  }

  const userInfo = response.data

  if (!userInfo.sub || !userInfo.email) {
    throw new AuthError(
      'Google profile is missing required account details.',
      AuthErrorCode.GoogleRequestFailed
    )
  }

  const displayName = userInfo.name ?? userInfo.email

  return {
    id: userInfo.sub,
    displayName,
    email: userInfo.email,
    avatarUrl: userInfo.picture ?? null,
    avatarInitials: getAvatarInitials(displayName)
  }
}

function createGoogleAuthTokens(credentials: Credentials, refreshToken: string): GoogleAuthTokens {
  if (!credentials.access_token || !credentials.expiry_date) {
    throw new AuthError(
      'Google did not return usable auth tokens.',
      AuthErrorCode.GoogleRequestFailed
    )
  }

  return {
    accessToken: credentials.access_token,
    refreshToken,
    expiresAt: new Date(credentials.expiry_date).toISOString(),
    scope: credentials.scope ?? GOOGLE_OAUTH_SCOPES.join(' ')
  }
}

function createAuthenticatedOAuthClient(tokens: GoogleAuthTokens): OAuth2Client {
  const oauthClient = createGoogleOAuthClient()
  oauthClient.setCredentials(toGoogleCredentials(tokens))

  return oauthClient
}

function toGoogleCredentials(tokens: GoogleAuthTokens): Credentials {
  return {
    access_token: tokens.accessToken,
    expiry_date: Date.parse(tokens.expiresAt),
    refresh_token: tokens.refreshToken,
    scope: tokens.scope
  }
}

function getAvatarInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

async function runGoogleRequest<T>(
  request: () => Promise<T>,
  fallbackMessage: string,
  errorCode: AuthErrorCode = AuthErrorCode.GoogleRequestFailed
): Promise<T> {
  try {
    return await request()
  } catch (error) {
    throw createGoogleRequestError(error, fallbackMessage, errorCode)
  }
}

function createGoogleRequestError(
  error: unknown,
  fallbackMessage: string,
  errorCode: AuthErrorCode = AuthErrorCode.GoogleRequestFailed
): AuthError {
  if (error instanceof AuthError) {
    return error
  }

  return new AuthError(getGoogleErrorMessage(error, fallbackMessage), errorCode)
}

function getGoogleErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  if (/invalid_grant|invalid_token|unauthorized/i.test(error.message)) {
    return 'Your Google session expired. Sign in again.'
  }

  if (/network|fetch|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
    return 'Unable to reach Google. Check your internet connection and try again.'
  }

  return fallbackMessage
}
