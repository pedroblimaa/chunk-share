import { useEffect, useState } from 'react'
import type { VanillaMinecraftVersion } from '../../../../shared/server-setup'
import { getErrorMessage } from '../../utils/error-message'

interface ServerVersionsState {
  serverType: 'vanilla' | 'fabric'
  versions: VanillaMinecraftVersion[]
  error: string | null
}

export function useServerVersions(serverType: 'vanilla' | 'fabric'): {
  versions: VanillaMinecraftVersion[]
  error: string | null
  isLoading: boolean
  retry: () => void
} {
  const [state, setState] = useState<ServerVersionsState | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    window.chunkShare.serverSetup
      .listVersions(serverType)
      .then((versions) => {
        if (active) setState({ serverType, versions, error: null })
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            serverType,
            versions: [],
            error: getErrorMessage(error, 'Unable to load Minecraft versions.')
          })
      })
    return () => {
      active = false
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
