import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../utils/error-message'
import type { AuthSessionActions, UseAuthSessionInput } from './auth.model'

export function useAuthSession({
  handleStorageError,
  onAuthStateChange,
  onSignInComplete,
  onSignOutComplete,
  setErrorMessage
}: UseAuthSessionInput): AuthSessionActions {
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const signInCancellationWasRequested = useRef(false)

  useEffect(() => {
    window.chunkShare.auth
      .getSession()
      .then(onAuthStateChange)
      .catch((error: unknown) => {
        if (handleStorageError(error)) {
          return
        }

        setErrorMessage(getErrorMessage(error, 'Unable to restore Google session.'))
      })
      .finally(() => {
        setIsLoadingSession(false)
      })
  }, [handleStorageError, onAuthStateChange, setErrorMessage])

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    signInCancellationWasRequested.current = false
    setIsSigningIn(true)
    setErrorMessage(null)

    try {
      const nextServerDisplayState = await window.chunkShare.auth.signInWithGoogle()
      onAuthStateChange(nextServerDisplayState)
      onSignInComplete()
    } catch (error: unknown) {
      if (signInCancellationWasRequested.current) {
        return
      }

      if (handleStorageError(error)) {
        return
      }

      setErrorMessage(getErrorMessage(error, 'Unable to sign in with Google.'))
    } finally {
      signInCancellationWasRequested.current = false
      setIsSigningIn(false)
    }
  }, [handleStorageError, onAuthStateChange, onSignInComplete, setErrorMessage])

  const cancelGoogleSignIn = useCallback(async (): Promise<void> => {
    signInCancellationWasRequested.current = true

    try {
      const didCancel = await window.chunkShare.auth.cancelGoogleSignIn()
      if (!didCancel) {
        signInCancellationWasRequested.current = false
      }
    } catch (error: unknown) {
      signInCancellationWasRequested.current = false
      setErrorMessage(getErrorMessage(error, 'Unable to cancel Google sign-in.'))
    }
  }, [setErrorMessage])

  const signOut = useCallback(async (): Promise<void> => {
    setErrorMessage(null)

    try {
      const nextServerDisplayState = await window.chunkShare.auth.signOut()
      onAuthStateChange(nextServerDisplayState)
      onSignOutComplete()
    } catch (error: unknown) {
      if (handleStorageError(error)) {
        return
      }

      setErrorMessage(getErrorMessage(error, 'Unable to sign out.'))
    }
  }, [handleStorageError, onAuthStateChange, onSignOutComplete, setErrorMessage])

  return {
    cancelGoogleSignIn,
    isLoadingSession,
    isSigningIn,
    signInWithGoogle,
    signOut
  }
}
