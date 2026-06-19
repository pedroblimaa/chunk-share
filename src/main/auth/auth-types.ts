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
