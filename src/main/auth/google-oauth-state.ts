import { randomBytes } from 'crypto'

export function createOAuthState(): string {
  return randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
