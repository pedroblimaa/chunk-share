import { CodeChallengeMethod, OAuth2Client, type Credentials } from 'google-auth-library'
import { GOOGLE_AUTH_PROMPT, GOOGLE_USER_INFO_ENDPOINT } from './auth-constants'
import { getGoogleOAuthConfig } from './auth-config'
import { AuthError } from './auth-error'
import {
  AuthErrorCode,
  type CreateGoogleAuthorizationUrlInput,
  type ExchangeAuthorizationCodeInput,
  type GoogleAuthTokens,
  type GoogleRequestError,
  type GoogleRequestErrorBody,
  type GoogleUserInfoResponse,
  type GoogleUserProfile
} from './auth-model'

const GOOGLE_DRIVE_PICKER_MIME_TYPES = ['application/json', 'application/zip']
const GOOGLE_DRIVE_ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'

interface GoogleDriveAboutResponse {
  user?: {
    emailAddress?: string
  }
}

export function createGoogleOAuthClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = getGoogleOAuthConfig()

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri
  })
}

export async function createGoogleAuthorizationUrl(
  input: CreateGoogleAuthorizationUrlInput
): Promise<{ authorizationUrl: string; codeVerifier: string }> {
  try {
    const oauthClient = createGoogleOAuthClient(input.redirectUri)
    const { codeChallenge, codeVerifier } = await oauthClient.generateCodeVerifierAsync()
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: GOOGLE_AUTH_PROMPT,
      include_granted_scopes: input.includeGrantedScopes,
      login_hint: input.loginHint,
      scope: input.scopes,
      state: input.state
    })

    return {
      authorizationUrl: addPickerParameters(authorizationUrl, input.pickerFileIds),
      codeVerifier
    }
  } catch (error) {
    throw createGoogleRequestError(error, 'Unable to prepare Google sign-in. Try again.')
  }
}

export async function exchangeAuthorizationCode({
  code,
  codeVerifier,
  fallbackRefreshToken,
  scopes,
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

  const refreshToken = tokens.refresh_token ?? fallbackRefreshToken

  if (!refreshToken) {
    throw new AuthError(
      'Google did not return a refresh token. Try signing in again.',
      AuthErrorCode.MissingRefreshToken
    )
  }

  return createGoogleAuthTokens(tokens, refreshToken, scopes)
}

export async function refreshGoogleAuthTokens(tokens: GoogleAuthTokens): Promise<GoogleAuthTokens> {
  if (!tokens.refreshToken) {
    throw new AuthError(
      'Google session cannot be refreshed. Sign in again.',
      AuthErrorCode.MissingRefreshToken
    )
  }

  const oauthClient = createAuthenticatedGoogleOAuthClient(tokens)
  const { credentials } = await runGoogleRequest(
    () => oauthClient.refreshAccessToken(),
    'Your Google session expired. Sign in again.',
    AuthErrorCode.ExpiredSession
  )

  return createGoogleAuthTokens(credentials, tokens.refreshToken, tokens.scope.split(/\s+/))
}

export async function fetchGoogleUserProfile(tokens: GoogleAuthTokens): Promise<GoogleUserProfile> {
  const oauthClient = createAuthenticatedGoogleOAuthClient(tokens)
  const response = await runGoogleRequest(
    () => oauthClient.fetch<GoogleUserInfoResponse>(GOOGLE_USER_INFO_ENDPOINT),
    'Unable to read Google profile. Sign in again.'
  )

  if (response.status < 200 || response.status >= 300) {
    throw new AuthError('Unable to read Google profile. Sign in again.', AuthErrorCode.GoogleRequestFailed)
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

export async function fetchGoogleDriveUserEmail(tokens: GoogleAuthTokens): Promise<string> {
  const oauthClient = createAuthenticatedGoogleOAuthClient(tokens)
  const response = await runGoogleRequest(
    () => oauthClient.fetch<GoogleDriveAboutResponse>(GOOGLE_DRIVE_ABOUT_ENDPOINT),
    'Unable to verify the Google Drive account. Try again.'
  )
  const email = response.data.user?.emailAddress

  if (!email) {
    throw new AuthError(
      'Google Drive did not return the authorized account email.',
      AuthErrorCode.GoogleRequestFailed
    )
  }

  return email
}

function createGoogleAuthTokens(
  credentials: Credentials,
  refreshToken: string,
  fallbackScopes: string[]
): GoogleAuthTokens {
  if (!credentials.access_token || !credentials.expiry_date) {
    throw new AuthError('Google did not return usable auth tokens.', AuthErrorCode.GoogleRequestFailed)
  }

  return {
    accessToken: credentials.access_token,
    refreshToken,
    expiresAt: new Date(credentials.expiry_date).toISOString(),
    scope: credentials.scope ?? fallbackScopes.join(' ')
  }
}

export function createAuthenticatedGoogleOAuthClient(tokens: GoogleAuthTokens): OAuth2Client {
  const oauthClient = createGoogleOAuthClient()
  oauthClient.setCredentials(toGoogleCredentials(tokens))

  return oauthClient
}

function addPickerParameters(authorizationUrl: string, fileIds?: string[]): string {
  if (!fileIds?.length) {
    return authorizationUrl
  }

  const pickerUrl = new URL(authorizationUrl)
  pickerUrl.searchParams.set('allow_multiple', 'true')
  pickerUrl.searchParams.set('file_ids', fileIds.join(','))
  pickerUrl.searchParams.set('mimetypes', GOOGLE_DRIVE_PICKER_MIME_TYPES.join(','))
  pickerUrl.searchParams.set('trigger_onepick', 'true')

  return pickerUrl.toString()
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
  const googleErrorMessage = getGoogleResponseErrorMessage(error)
  if (googleErrorMessage) {
    return googleErrorMessage
  }

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

function getGoogleResponseErrorMessage(error: unknown): string | null {
  if (!isGoogleRequestError(error)) {
    return null
  }

  const { data } = error.response

  if (typeof data === 'string') {
    return data
  }

  return getGoogleErrorBodyMessage(data)
}

function getGoogleErrorBodyMessage(errorBody: GoogleRequestErrorBody | undefined): string | null {
  if (!errorBody?.error && !errorBody?.error_description) {
    return null
  }

  const errorDetails = [errorBody.error, errorBody.error_description].filter(Boolean).join(': ')

  if (/client_secret is missing/i.test(errorDetails)) {
    return 'Google sign-in is missing the OAuth client secret. Check the desktop OAuth client configuration.'
  }

  return `Google sign-in failed: ${errorDetails}`
}

function isGoogleRequestError(error: unknown): error is GoogleRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null
  )
}
