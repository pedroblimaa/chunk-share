import { useCallback, useEffect } from 'react'
import { getErrorMessage } from '../utils/error-message'
import { loadServerDisplayState } from '../utils/server-display-state'
import type { ServerActions, UseServerActionsInput } from './server.model'

export function useServerActions({
  canAutoRefresh,
  handleStorageError,
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

  const openServerDashboard = useCallback(async (): Promise<void> => {
    setErrorMessage(null)

    try {
      await refreshServerDisplayState()
      setAppView('server-detail')
    } catch (error: unknown) {
      if (handleStorageError(error)) {
        return
      }

      setErrorMessage(getErrorMessage(error, 'Unable to open server.'))
    }
  }, [handleStorageError, refreshServerDisplayState, setAppView, setErrorMessage])

  const deleteServer = useCallback(async (): Promise<void> => {
    if (typeof window.chunkShare.storage.deleteServer !== 'function') {
      throw new Error('Delete server is not available yet. Restart the Electron app and try again.')
    }

    await window.chunkShare.storage.deleteServer()
    await refreshServerDisplayState()
    setAppView('servers')
  }, [refreshServerDisplayState, setAppView])

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
