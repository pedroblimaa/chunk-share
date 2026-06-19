import type { SignedInUser } from '../shared/dashboard'

const mockGoogleUser: SignedInUser = {
  id: 'user-pedro',
  name: 'Pedro Lima',
  email: 'pedro@example.com',
  avatarInitials: 'PL'
}

let signedInUser: SignedInUser | null = null

export function getSignedInMockUser(): SignedInUser | null {
  return signedInUser
}

export function signInWithMockGoogleUser(): SignedInUser {
  signedInUser = mockGoogleUser

  return signedInUser
}
