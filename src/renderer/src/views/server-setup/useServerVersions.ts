import { useEffect, useState } from 'react'
import type { SupportedServerType, VanillaMinecraftVersion } from '../../../../shared/server-setup'
import { getErrorMessage } from '../../utils/error-message'

interface ServerVersionsState {
  serverType: SupportedServerType
  versions: VanillaMinecraftVersion[]
  error: string | null
}

export function useServerVersions(serverType: SupportedServerType): {
  versions: VanillaMinecraftVersion[]
  error: string | null
  isLoading: boolean
  retry: () => void
} {
  const [state, setState] = useState<ServerVersionsState | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isActive = true

    window.chunkShare.serverSetup
      .listVersions(serverType)
      .then((versions) => {
        if (isActive) {
          setState({ serverType, versions, error: null })
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          const message = getErrorMessage(error, 'Unable to load Minecraft versions.')
          setState({ serverType, versions: [], error: message })
        }
      })

    return () => {
      isActive = false
    }
  }, [serverType, attempt])

  const current = state?.serverType === serverType ? state : null

  return {
    versions: current?.versions ?? [],
    error: current?.error ?? null,
    isLoading: current === null,
    retry: () => {
      setState(null)
      setAttempt((value) => value + 1)
    }
  }
}
