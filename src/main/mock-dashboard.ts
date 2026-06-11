import type { MockUser } from '../shared/dashboard'

const mockGoogleUser: MockUser = {
  id: 'user-pedro',
  name: 'Pedro Lima',
  email: 'pedro@example.com',
  avatarInitials: 'PL'
}

let signedInUser: MockUser | null = null

export function getSignedInMockUser(): MockUser | null {
  return signedInUser
}

export function signInWithMockGoogleUser(): MockUser {
  signedInUser = mockGoogleUser

  return signedInUser
}
