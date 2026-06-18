import { useState } from 'react'
import type { ServerDisplayState } from '../../shared/dashboard'
import { useServerActions } from './hooks/useServerActions'
import { useServerLockRepair } from './hooks/useServerLockRepair'
import { getErrorMessage } from './utils/error-message'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'
import ServerSetupView from './views/server-setup/ServerSetupView/ServerSetupView'
import ServersView from './views/servers/ServersView/ServersView'

type AppView = 'servers' | 'server-detail' | 'server-setup'

function App(): React.JSX.Element {
  const [serverDisplayState, setServerDisplayState] = useState<ServerDisplayState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [appView, setAppView] = useState<AppView>('servers')

  const onRepairComplete = (nextServerDisplayState: ServerDisplayState): void => {
    setServerDisplayState(nextServerDisplayState)
    setAppView('servers')
  }

  const { dialog: serverLockRepairDialog, handleStorageError } = useServerLockRepair({
    onRepairComplete,
    onRepairError: setErrorMessage,
    onRepairKept: setErrorMessage
  })

  const { completeServerSetup, deleteServer, openServerDashboard, refreshServerDisplayState } =
    useServerActions({
      handleStorageError,
      setAppView,
      setErrorMessage,
      setServerDisplayState
    })

  const signInWithGoogle = async (): Promise<void> => {
    setIsSigningIn(true)
    setErrorMessage(null)

    try {
      const nextServerDisplayState = await window.chunkShare.auth.signInWithGoogle()
      setServerDisplayState(nextServerDisplayState)
      setAppView('servers')
    } catch (error: unknown) {
      if (handleStorageError(error)) {
        return
      }

      const message = getErrorMessage(error, 'Unable to sign in with Google.')
      setErrorMessage(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  if (!serverDisplayState?.signedInUser) {
    return (
      <>
        <AuthView
          errorMessage={errorMessage}
          isSigningIn={isSigningIn}
          onSignIn={signInWithGoogle}
        />
        {serverLockRepairDialog}
      </>
    )
  }
  if (appView === 'server-detail') {
    return (
      <>
        <DashboardView
          serverDisplayState={serverDisplayState}
          onServerDisplayStateChange={setServerDisplayState}
          onNavigateToServers={() => setAppView('servers')}
        />
        {serverLockRepairDialog}
      </>
    )
  }

  if (appView === 'server-setup') {
    return (
      <ServerSetupView
        snapshot={serverDisplayState}
        onCancel={() => setAppView('servers')}
        onOpenDashboard={openServerDashboard}
        onSetupComplete={completeServerSetup}
      />
    )
  }

  return (
    <>
      <ServersView
        serverDisplayState={serverDisplayState}
        onCreateServer={() => setAppView('server-setup')}
        onDeleteServer={deleteServer}
        onOpenServer={openServerDashboard}
        onRefreshServerDisplayState={refreshServerDisplayState}
      />
      {serverLockRepairDialog}
    </>
  )
}

export default App
