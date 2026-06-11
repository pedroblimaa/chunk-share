import { useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../shared/dashboard'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'
import ServersView from './views/servers/ServersView/ServersView'

type AppView = 'servers' | 'server-detail'

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [appView, setAppView] = useState<AppView>('servers')

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
      setAppView('servers')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Google.'
      setErrorMessage(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  if (snapshot?.signedInUser) {
    if (appView === 'server-detail') {
      return <DashboardView snapshot={snapshot} onNavigateToServers={() => setAppView('servers')} />
    }

    return <ServersView snapshot={snapshot} onOpenServer={() => setAppView('server-detail')} />
  }

  return (
    <AuthView errorMessage={errorMessage} isSigningIn={isSigningIn} onSignIn={signInWithGoogle} />
  )
}

export default App
