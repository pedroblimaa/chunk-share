import { useEffect, useRef, useState } from 'react'
import type { JavaConfig } from '../../../shared/domain'
import type { JavaRuntimeStatus } from '../../../shared/java-runtime'

interface JavaRuntimeStatusResult {
  isLoading: boolean
  status: JavaRuntimeStatus | null
}

interface StatusResult {
  requestKey: string
  status: JavaRuntimeStatus
}

export function useJavaRuntimeStatus(
  config: JavaConfig | null,
  minecraftVersion: string,
  minecraftVersionMetadataUrl: string | undefined,
  refreshKey = 0
): JavaRuntimeStatusResult {
  const statusKey = config
    ? [config.mode, config.executablePath, minecraftVersion, minecraftVersionMetadataUrl].join('\0')
    : null
  const requestIdRef = useRef(0)
  const [result, setResult] = useState<StatusResult | null>(null)
  const [isRequestPending, setIsRequestPending] = useState(false)

  useEffect(() => {
    const requestId = ++requestIdRef.current

    if (!config || !minecraftVersion || !statusKey) {
      return undefined
    }

    const request = {
      config,
      minecraftVersion,
      ...(minecraftVersionMetadataUrl ? { minecraftVersionMetadataUrl } : {})
    }
    const timer = window.setTimeout(() => {
      setIsRequestPending(true)
      window.chunkShare.javaRuntime
        .getStatus(request)
        .then((status) => {
          if (requestId === requestIdRef.current) {
            setResult({ requestKey: statusKey, status })
          }
        })
        .catch((error: unknown) => {
          if (requestId === requestIdRef.current) {
            setResult({ requestKey: statusKey, status: createErrorStatus(config, error) })
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setIsRequestPending(false)
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1
      }
    }
  }, [config, minecraftVersion, minecraftVersionMetadataUrl, refreshKey, statusKey])

  const status = result?.requestKey === statusKey ? result.status : null

  return {
    status,
    isLoading: config !== null && Boolean(minecraftVersion) && (isRequestPending || status === null)
  }
}

function createErrorStatus(config: JavaConfig, error: unknown): JavaRuntimeStatus {
  return {
    config,
    candidates: [],
    selectedRuntime: null,
    errorMessage: error instanceof Error ? error.message : 'Unable to check Java compatibility.'
  }
}
