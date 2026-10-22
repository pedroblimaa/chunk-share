import { useEffect, useState } from 'react'
import type { FabricVersionOptions } from '../../../../shared/fabric'
import { getErrorMessage } from '../../utils/error-message'

interface FabricVersionsState {
  minecraftVersion: string
  options: FabricVersionOptions | null
  error: string | null
}

export function useFabricVersions(minecraftVersion: string): {
  options: FabricVersionOptions | null
  error: string | null
  isLoading: boolean
  retry: () => void
} {
  const [state, setState] = useState<FabricVersionsState | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!minecraftVersion) return
    let active = true
    window.chunkShare.serverSetup
      .getFabricVersions(minecraftVersion)
      .then((options) => {
        if (active) setState({ minecraftVersion, options, error: null })
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            minecraftVersion,
            options: null,
            error: getErrorMessage(error, 'Unable to load Fabric versions.')
          })
      })
    return () => {
      active = false
    }
  }, [minecraftVersion, attempt])
  const current = state?.minecraftVersion === minecraftVersion ? state : null
  return {
    options: current?.options ?? null,
    error: current?.error ?? null,
    isLoading: Boolean(minecraftVersion) && !current,
    retry: () => {
      setState(null)
      setAttempt((value) => value + 1)
    }
  }
}
