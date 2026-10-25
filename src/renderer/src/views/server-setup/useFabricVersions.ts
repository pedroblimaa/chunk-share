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
    if (!minecraftVersion) {
      return
    }

    let isActive = true

    window.chunkShare.serverSetup
      .getFabricVersions(minecraftVersion)
      .then((options) => {
        if (isActive) {
          setState({ minecraftVersion, options, error: null })
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          const message = getErrorMessage(error, 'Unable to load Fabric versions.')
          setState({ minecraftVersion, options: null, error: message })
        }
      })

    return () => {
      isActive = false
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
