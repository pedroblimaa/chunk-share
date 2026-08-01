import { useCallback, useEffect } from 'react'
import { getErrorMessage } from '../utils/error-message'
import { createOpeningServerDisplayState, loadServerDisplayState } from '../utils/server-display-state'
import type { ServerActions, UseServerActionsInput } from './server.model'
import type { WorldId } from '../../../shared/world'

export function useServerActions({
  canAutoRefresh,
  handleStorageError,
  serverDisplayState,
  setAppView,
  setErrorMessage,
  setServerDisplayState
}: UseServerActionsInput): ServerActions {
  const refreshServerDisplayState = useCallback(async (): Promise<void> => {
    const nextServerDisplayState = await loadServerDisplayState()
    setServerDisplayState(nextServerDisplayState)
  }, [setServerDisplayState])

  useEffect(() => {
    if (!canAutoRefresh) {
      return
    }

    refreshServerDisplayState().catch((error: unknown) => {
      if (handleStorageError(error)) {
        return
      }

      setErrorMessage(getErrorMessage(error, 'Unable to load dashboard data.'))
    })
  }, [canAutoRefresh, handleStorageError, refreshServerDisplayState, setErrorMessage])

  const openServerDashboard = useCallback(
    async (worldId: WorldId): Promise<void> => {
      setErrorMessage(null)

      try {
        if (!serverDisplayState) {
          throw new Error('Server data is not loaded yet.')
        }

        await window.chunkShare.dashboard.selectWorld(worldId)
        setServerDisplayState(createOpeningServerDisplayState(serverDisplayState, worldId))
        setAppView('server-detail')
      } catch (error) {
        if (handleStorageError(error)) {
          return
        }

        setErrorMessage(getErrorMessage(error, 'Unable to open this server.'))
      }
    },
    [handleStorageError, serverDisplayState, setAppView, setErrorMessage, setServerDisplayState]
  )

  const deleteServer = useCallback(
    async (worldId: WorldId): Promise<void> => {
      if (typeof window.chunkShare.storage.deleteServer !== 'function') {
        throw new Error('Delete server is not available yet. Restart the Electron app and try again.')
      }

      await window.chunkShare.storage.deleteServer(worldId)
      await refreshServerDisplayState()
      setAppView('servers')
    },
    [refreshServerDisplayState, setAppView]
  )

  const completeServerSetup = useCallback(async (): Promise<void> => {
    await refreshServerDisplayState()
  }, [refreshServerDisplayState])

  return {
    completeServerSetup,
    deleteServer,
    openServerDashboard,
    refreshServerDisplayState
  }
}
