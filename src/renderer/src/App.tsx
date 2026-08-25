import { useCallback, useEffect, useState } from 'react'
import type { ServerDisplayState } from '../../shared/dashboard'
import type { JavaConfig } from '../../shared/domain'
import type { WorldId } from '../../shared/world'
import { useAuthSession } from './hooks/useAuthSession'
import { useServerActions } from './hooks/useServerActions'
import { useServerLockRepair } from './hooks/useServerLockRepair'
import type { AppView } from './hooks/server.model'
import { applyJavaConfigToServerDisplayState } from './utils/server-display-state'
import AuthView from './views/auth/AuthView/AuthView'
import DashboardView from './views/dashboard/DashboardView/DashboardView'
import ServerSetupView from './views/server-setup/ServerSetupView/ServerSetupView'
import ServersView from './views/servers/ServersView/ServersView'
import DriveJoinDialog from './views/servers/components/DriveJoinDialog/DriveJoinDialog'
import SettingsView from './views/settings/SettingsView/SettingsView'

function App(): React.JSX.Element {
  const [serverDisplayState, setServerDisplayState] = useState<ServerDisplayState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appView, setAppView] = useState<AppView>('servers')
  const [driveJoinLink, setDriveJoinLink] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const openPendingJoinLink = (): void => {
      window.chunkShare.driveJoin
        .consumePendingLink()
        .then((joinLink) => {
          if (joinLink) {
            setDriveJoinLink(joinLink)
          }
        })
        .catch(() => undefined)
    }

    openPendingJoinLink()

    return window.chunkShare.driveJoin.onLinkAvailable(openPendingJoinLink)
  }, [])

  const showServersView = useCallback((): void => {
    setSidebarOpen(false)
    setAppView('servers')
  }, [])

  const openSettings = useCallback((): void => {
    setSidebarOpen(false)
    setAppView('settings')
  }, [])

  const closeSidebar = useCallback((): void => {
    setSidebarOpen(false)
  }, [])

  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((isOpen) => !isOpen)
  }, [])

  const updateWorldJavaConfig = useCallback((worldId: WorldId, javaConfig: JavaConfig): void => {
    setServerDisplayState((currentState) =>
      currentState ? applyJavaConfigToServerDisplayState(currentState, worldId, javaConfig) : null
    )
  }, [])

  const completeDriveJoin = (nextServerDisplayState: ServerDisplayState): void => {
    setServerDisplayState(nextServerDisplayState)
    setDriveJoinLink(null)
    setAppView('servers')
  }

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
      serverDisplayState,
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
            isSidebarOpen={sidebarOpen}
            serverDisplayState={serverDisplayState}
            onJavaConfigSaved={updateWorldJavaConfig}
            onServerDisplayStateChange={setServerDisplayState}
            onCreateServer={() => setAppView('server-setup')}
            onCloseSidebar={closeSidebar}
            onNavigateToServers={() => setAppView('servers')}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onToggleSidebar={toggleSidebar}
          />
        )

      case 'server-setup':
        return (
          <ServerSetupView
            isSidebarOpen={sidebarOpen}
            snapshot={serverDisplayState}
            onCancel={() => setAppView('servers')}
            onCloseSidebar={closeSidebar}
            onOpenDashboard={() => {
              if (serverDisplayState.selectedWorldId) {
                void openServerDashboard(serverDisplayState.selectedWorldId)
              }
            }}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onSetupComplete={completeServerSetup}
            onToggleSidebar={toggleSidebar}
          />
        )

      case 'settings':
        return (
          <SettingsView
            isSidebarOpen={sidebarOpen}
            serverDisplayState={serverDisplayState}
            onCreateServer={() => setAppView('server-setup')}
            onCloseSidebar={closeSidebar}
            onNavigateToServers={() => setAppView('servers')}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onStorageProviderChange={refreshServerDisplayState}
            onToggleSidebar={toggleSidebar}
          />
        )

      case 'servers':
        return (
          <ServersView
            isSidebarOpen={sidebarOpen}
            serverDisplayState={serverDisplayState}
            onCreateServer={() => setAppView('server-setup')}
            onCloseSidebar={closeSidebar}
            onDeleteServer={deleteServer}
            onJoinSharedWorld={() => setDriveJoinLink('')}
            onOpenServer={openServerDashboard}
            onOpenSettings={openSettings}
            onSignOut={signOut}
            onRefreshServerDisplayState={refreshServerDisplayState}
            onToggleSidebar={toggleSidebar}
          />
        )
    }
  }

  return (
    <>
      {renderCurrentView()}
      {serverLockRepairDialog}
      {driveJoinLink !== null && Boolean(serverDisplayState?.signedInUser) && (
        <DriveJoinDialog
          initialJoinLink={driveJoinLink}
          key={driveJoinLink}
          onClose={() => setDriveJoinLink(null)}
          onJoined={completeDriveJoin}
        />
      )}
    </>
  )
}

export default App
