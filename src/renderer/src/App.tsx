import { useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../shared/dashboard'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    window.chunkShare.dashboard
      .getSnapshot()
      .then(setSnapshot)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load dashboard data.'
        setErrorMessage(message)
      })
  }, [])

  const signInWithGoogle = async (): Promise<void> => {
    setIsSigningIn(true)
    setErrorMessage(null)

    try {
      const nextSnapshot = await window.chunkShare.auth.signInWithGoogle()
      setSnapshot(nextSnapshot)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Google.'
      setErrorMessage(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  if (snapshot?.signedInUser) {
    return <DashboardView snapshot={snapshot} />
  }

  return (
    <AuthView
      errorMessage={errorMessage}
      isSigningIn={isSigningIn}
      onSignIn={signInWithGoogle}
    />
  )
}

export default App
