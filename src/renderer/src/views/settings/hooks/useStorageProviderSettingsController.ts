import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudStorageProvider,
  StorageSwitchDataMode,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageProviderSwitchRequest,
  type CloudStorageSettings,
  type StorageProviderCopyProgress
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import { StorageSettingsOperation, type StorageProviderSettingsController } from '../settings.model'

export function useStorageProviderSettingsController(): StorageProviderSettingsController {
  const [storageProviderSettings, setStorageProviderSettings] = useState<CloudStorageSettings | null>(null)
  const [currentOperation, setCurrentOperation] = useState<StorageSettingsOperation>(
    StorageSettingsOperation.Load
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [storageProviderSwitchPreview, setStorageProviderSwitchPreview] =
    useState<CloudStorageProviderSwitchPreview | null>(null)
  const [storageProviderCopyProgress, setStorageProviderCopyProgress] =
    useState<StorageProviderCopyProgress | null>(null)
  const operationIsRunning = useRef(true)
  const activeStorageProvider = storageProviderSettings?.activeProvider ?? null
  const operationState = {
    errorMessage,
    isBusy: currentOperation !== StorageSettingsOperation.Idle,
    operation: currentOperation
  }

  const synchronizeStorageProviderSettings = useCallback(async (): Promise<void> => {
    const settings = await window.chunkShare.storage.getCloudStorageSettings()
    setStorageProviderSettings(settings)
  }, [])

  const requestStorageProviderSettingsLoad = useCallback((): void => {
    if (operationIsRunning.current) {
      return
    }

    operationIsRunning.current = true
    setCurrentOperation(StorageSettingsOperation.Load)
    setErrorMessage(null)

    synchronizeStorageProviderSettings()
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error, 'Unable to load storage provider settings.'))
      })
      .finally(() => {
        operationIsRunning.current = false
        setCurrentOperation(StorageSettingsOperation.Idle)
      })
  }, [synchronizeStorageProviderSettings])

  const runStorageOperation = async <Result>(
    operation: StorageSettingsOperation,
    performStorageAction: () => Promise<Result>,
    applyResult: (result: Result) => void,
    fallbackErrorMessage = 'Unable to update storage.'
  ): Promise<boolean> => {
    if (operationIsRunning.current) {
      return false
    }

    operationIsRunning.current = true
    setCurrentOperation(operation)
    setErrorMessage(null)

    try {
      const result = await performStorageAction()
      applyResult(result)
      return true
    } catch (error: unknown) {
      const message = getErrorMessage(error, fallbackErrorMessage)

      await synchronizeStorageProviderSettings().catch(() => undefined)
      setErrorMessage(message)
      return false
    } finally {
      operationIsRunning.current = false
      setCurrentOperation(StorageSettingsOperation.Idle)
    }
  }

  useEffect(() => {
    operationIsRunning.current = false
    requestStorageProviderSettingsLoad()
  }, [requestStorageProviderSettingsLoad])

  useEffect(() => {
    return window.chunkShare.storage.onProviderCopyProgress(setStorageProviderCopyProgress)
  }, [])

  const requestGoogleDriveSetup = (): void => {
    runStorageOperation(
      StorageSettingsOperation.SetupGoogleDriveFolder,
      () => window.chunkShare.storage.setupGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const requestGoogleDriveDisconnect = (): Promise<boolean> => {
    return runStorageOperation(
      StorageSettingsOperation.ClearGoogleDriveFolder,
      () => window.chunkShare.storage.clearGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const requestStorageProviderSwitchPreview = async (
    provider: CloudStorageProvider
  ): Promise<CloudStorageProviderSwitchPreview | null> => {
    setStorageProviderSwitchPreview(null)
    let preview: CloudStorageProviderSwitchPreview | null = null

    await runStorageOperation(
      StorageSettingsOperation.PreviewProviderSwitch,
      () => window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider),
      (result) => {
        preview = result
        setStorageProviderSwitchPreview(result)
      },
      'Unable to check storage provider data.'
    )

    return preview
  }

  const requestStorageProviderSwitch = async (
    provider: CloudStorageProvider,
    dataMode: StorageSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ): Promise<boolean> => {
    const updateProvider = (): Promise<CloudStorageSettings> =>
      window.chunkShare.storage.setCloudStorageProvider(
        createStorageProviderSwitchRequest(provider, dataMode, expectedPreview)
      )

    const applyResult = (nextSettings: CloudStorageSettings): void => {
      setStorageProviderSettings(nextSettings)
      setStorageProviderSwitchPreview(null)
    }

    const operation =
      dataMode === StorageSwitchDataMode.CopyCurrentToTarget
        ? StorageSettingsOperation.CopyProviderData
        : StorageSettingsOperation.SwitchProvider

    setStorageProviderCopyProgress(null)
    const succeeded = await runStorageOperation(
      operation,
      updateProvider,
      applyResult,
      'Unable to switch storage provider.'
    )

    if (!succeeded && dataMode === StorageSwitchDataMode.CopyCurrentToTarget) {
      await refreshStorageProviderSwitchPreview(provider)
    }

    setStorageProviderCopyProgress(null)
    return succeeded
  }

  const refreshStorageProviderSwitchPreview = async (provider: CloudStorageProvider): Promise<void> => {
    try {
      const preview = await window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider)
      setStorageProviderSwitchPreview(preview)
    } catch {
      setStorageProviderSwitchPreview(null)
    }
  }

  const resetStorageProviderSwitchPreview = (): void => {
    setStorageProviderSwitchPreview(null)
    setStorageProviderCopyProgress(null)
  }

  const dismissStorageError = (): void => {
    setErrorMessage(null)
  }

  return {
    storageProviderSettings,
    storageProviderCopyProgress,
    storageProviderSwitchPreview,
    activeStorageProvider,
    operationState,
    dismissStorageError,
    requestGoogleDriveDisconnect,
    requestGoogleDriveSetup,
    requestStorageProviderSettingsLoad,
    requestStorageProviderSwitch,
    requestStorageProviderSwitchPreview,
    resetStorageProviderSwitchPreview
  }
}

function createStorageProviderSwitchRequest(
  provider: CloudStorageProvider,
  dataMode: StorageSwitchDataMode,
  expectedPreview?: CloudStorageProviderSwitchPreview
): CloudStorageProviderSwitchRequest {
  if (dataMode === StorageSwitchDataMode.UseTargetAsIs) {
    return { provider, dataMode }
  }

  if (!expectedPreview) {
    throw new Error('Storage provider copy requires a current data preview.')
  }

  return {
    provider,
    dataMode,
    expectedPreview
  }
}
