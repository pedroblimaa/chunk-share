import { useEffect, useState } from 'react'
import type { DashboardSnapshot } from '../../shared/dashboard'
import type { StorageSnapshot } from '../../shared/domain'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'
import ServerSetupView from './views/server-setup/ServerSetupView/ServerSetupView'
import ServersView from './views/servers/ServersView/ServersView'

type AppView = 'servers' | 'server-detail' | 'server-setup'

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [storageSnapshot, setStorageSnapshot] = useState<StorageSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [appView, setAppView] = useState<AppView>('servers')

  useEffect(() => {
    Promise.all([
      window.chunkShare.dashboard.getSnapshot(),
      window.chunkShare.storage.getSnapshot()
    ])
      .then(([dashboardSnapshot, nextStorageSnapshot]) => {
        setSnapshot(dashboardSnapshot)
        setStorageSnapshot(nextStorageSnapshot)
      })
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
      const nextStorageSnapshot = await window.chunkShare.storage.getSnapshot()
      setSnapshot(nextSnapshot)
      setStorageSnapshot(nextStorageSnapshot)
      setAppView('servers')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with Google.'
      setErrorMessage(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  const deleteServer = async (): Promise<void> => {
    if (typeof window.chunkShare.storage.deleteServer !== 'function') {
      throw new Error('Delete server is not available yet. Restart the Electron app and try again.')
    }

    const nextStorageSnapshot = await window.chunkShare.storage.deleteServer()

    setStorageSnapshot(nextStorageSnapshot)
    setAppView('servers')
  }

  if (snapshot?.signedInUser) {
    if (appView === 'server-detail') {
      return <DashboardView snapshot={snapshot} onNavigateToServers={() => setAppView('servers')} />
    }

    if (appView === 'server-setup') {
      return (
        <ServerSetupView
          snapshot={snapshot}
          onCancel={() => setAppView('servers')}
          onOpenDashboard={() => setAppView('server-detail')}
          onSetupComplete={setStorageSnapshot}
        />
      )
    }

    return (
      <ServersView
        snapshot={snapshot}
        storageSnapshot={storageSnapshot}
        onCreateServer={() => setAppView('server-setup')}
        onDeleteServer={deleteServer}
        onOpenServer={() => setAppView('server-detail')}
      />
    )
  }

  return (
    <AuthView errorMessage={errorMessage} isSigningIn={isSigningIn} onSignIn={signInWithGoogle} />
  )
}

export default App
