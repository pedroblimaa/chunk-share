import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { Socket } from 'net'
import type { Player } from '../../shared/domain'

export enum AuthErrorCode {
  Cancelled = 'cancelled',
  ExpiredSession = 'expired-session',
  GoogleRequestFailed = 'google-request-failed',
  InvalidCallback = 'invalid-callback',
  InvalidStoredSession = 'invalid-stored-session',
  MissingRefreshToken = 'missing-refresh-token',
  SecureStorageUnavailable = 'secure-storage-unavailable',
  TimedOut = 'timed-out'
}

export interface GoogleAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string
  scope: string
}

export interface GoogleUserProfile {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  avatarInitials: string
}

export interface AuthSession {
  player: Player
  tokens: GoogleAuthTokens
}

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
}

export interface ExchangeAuthorizationCodeInput {
  code: string
  codeVerifier: string
  redirectUri: string
  fallbackRefreshToken: string | null
  scopes: string[]
}

export interface CreateGoogleAuthorizationUrlInput {
  includeGrantedScopes: boolean
  loginHint?: string
  pickerFolderId?: string
  redirectUri: string
  scopes: string[]
  state: string
}

export interface GoogleUserInfoResponse {
  sub?: string
  name?: string
  email?: string
  picture?: string
}

export interface GoogleRequestErrorBody {
  error?: string
  error_description?: string
  error_uri?: string
}

export interface GoogleRequestError {
  response: {
    data?: GoogleRequestErrorBody | string
  }
}

export interface StoredGoogleAuthTokens {
  encryptedTokens: string
}

export interface GoogleAuthorizationCodeResult {
  code: string
  pickedFileIds: string[]
  redirectUri: string
}

export interface GoogleAuthorizationServerInput {
  expectedState: string
}

export interface GoogleAuthorizationServer {
  redirectUri: string
  waitForCode: Promise<GoogleAuthorizationCodeResult>
  close: () => Promise<void>
}

export interface GoogleCallbackServer {
  server: Server
  sockets: Set<Socket>
}

export type GoogleCallbackResult =
  | {
      type: 'ignored'
    }
  | {
      type: 'failure'
      pageTitle: string
      pageMessage: string
      errorCode: AuthErrorCode
      errorMessage: string
    }
  | {
      type: 'success'
      code: string
      pickedFileIds: string[]
    }

export type GoogleCallbackFailureReason = 'cancelled' | 'invalid-state' | 'missing-code'

export interface GoogleCallbackRequestHandlerInput {
  callbackServer: GoogleCallbackServer
  expectedState: string
  reject: (error: Error) => void
  request: IncomingMessage
  resolve: (value: GoogleAuthorizationCodeResult) => void
  response: ServerResponse
  timeout: NodeJS.Timeout
}
