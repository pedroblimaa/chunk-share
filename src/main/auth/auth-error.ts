import { AuthErrorCode } from './auth-model'

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode = AuthErrorCode.GoogleRequestFailed
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
