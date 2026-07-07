import { useCallback, useState } from 'react'
import type { ServerDisplayState } from '../../shared/dashboard'
import { useAuthSession } from './hooks/useAuthSession'
import { useServerActions } from './hooks/useServerActions'
import { useServerLockRepair } from './hooks/useServerLockRepair'
import type { AppView } from './hooks/server.model'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'
import ServerSetupView from './views/server-setup/ServerSetupView/ServerSetupView'
import ServersView from './views/servers/ServersView/ServersView'
import SettingsView from './views/settings/SettingsView/SettingsView'

function App(): React.JSX.Element {
  const [serverDisplayState, setServerDisplayState] = useState<ServerDisplayState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appView, setAppView] = useState<AppView>('servers')

  const showServersView = useCallback((): void => {
    setAppView('servers')
  }, [])

  const openSettings = useCallback((): void => {
    setAppView('settings')
  }, [])

  const onRepairComplete = (nextServerDisplayState: ServerDisplayState): void => {
    setServerDisplayState(nextServerDisplayState)
    setAppView('servers')
  }

  const { dialog: serverLockRepairDialog, handleStorageError } = useServerLockRepair({
    onRepairComplete,
    onRepairError: setErrorMessage,
    onRepairKept: setErrorMessage
  })

  const { isLoadingSession, isSigningIn, signInWithGoogle, signOut } = useAuthSession({
    handleStorageError,
    onAuthStateChange: setServerDisplayState,
    onSignInComplete: showServersView,
    onSignOutComplete: showServersView,
    setErrorMessage
  })

  const { completeServerSetup, deleteServer, openServerDashboard, refreshServerDisplayState } =
    useServerActions({
      canAutoRefresh: Boolean(serverDisplayState?.signedInUser),
      handleStorageError,
      setAppView,
      setErrorMessage,
      setServerDisplayState
    })

  const shouldShowAuthView = isLoadingSession || !serverDisplayState?.signedInUser

  function renderCurrentView(): React.JSX.Element {
    if (shouldShowAuthView) {
      return (
        <AuthView
          errorMessage={errorMessage}
          isSigningIn={isLoadingSession || isSigningIn}
          onSignIn={signInWithGoogle}
        />
      )
    }

    switch (appView) {
      case 'server-detail':
        return (
          <DashboardView
            serverDisplayState={serverDisplayState}
            onServerDisplayStateChange={setServerDisplayState}
            onNavigateToServers={() => setAppView('servers')}
            onOpenSettings={openSettings}
            onSignOut={signOut}
          />
        )

      case 'server-setup':
        return (
          <ServerSetupView
            snapshot={serverDisplayState}
            onCancel={() => setAppView('servers')}
            onOpenDashboard={openServerDashboard}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onSetupComplete={completeServerSetup}
          />
        )

      case 'settings':
        return (
          <SettingsView
            serverDisplayState={serverDisplayState}
            onCreateServer={() => setAppView('server-setup')}
            onNavigateToServers={() => setAppView('servers')}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onStorageProviderChange={refreshServerDisplayState}
          />
        )

      case 'servers':
        return (
          <ServersView
            serverDisplayState={serverDisplayState}
            onCreateServer={() => setAppView('server-setup')}
            onDeleteServer={deleteServer}
            onOpenServer={openServerDashboard}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onRefreshServerDisplayState={refreshServerDisplayState}
          />
        )
    }
  }

  return (
    <>
      {renderCurrentView()}
      {serverLockRepairDialog}
    </>
  )
}

export default App
