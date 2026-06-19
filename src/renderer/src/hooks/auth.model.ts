import type { ServerDisplayState } from '../../../shared/dashboard'

export interface UseAuthSessionInput {
  handleStorageError: (error: unknown) => boolean
  onAuthStateChange: (serverDisplayState: ServerDisplayState) => void
  onSignInComplete: () => void
  onSignOutComplete: () => void
  setErrorMessage: (message: string | null) => void
}

export interface AuthSessionActions {
  isLoadingSession: boolean
  isSigningIn: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}
