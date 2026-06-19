import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { Player } from '../../shared/domain'

export interface GoogleAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string
  idToken: string | null
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

export interface ExchangeAuthorizationCodeInput {
  code: string
  codeVerifier: string
  redirectUri: string
}

export interface GoogleUserInfoResponse {
  sub?: string
  name?: string
  email?: string
  picture?: string
}

export interface StoredGoogleAuthTokens {
  encryptedTokens: string
}

export interface GoogleAuthorizationCodeResult {
  code: string
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

export type GoogleCallbackResult =
  | {
      type: 'ignored'
    }
  | {
      type: 'failure'
      pageTitle: string
      pageMessage: string
      errorMessage: string
    }
  | {
      type: 'success'
      code: string
    }

export type GoogleCallbackFailureReason = 'cancelled' | 'invalid-state' | 'missing-code'

export interface GoogleCallbackRequestHandlerInput {
  callbackServer: Server
  expectedState: string
  reject: (error: Error) => void
  request: IncomingMessage
  resolve: (value: GoogleAuthorizationCodeResult) => void
  response: ServerResponse
  timeout: NodeJS.Timeout
}
