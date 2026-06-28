import { useCallback, useEffect, useState } from 'react'
import {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type StorageProviderCopyProgress
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../settings.model'

export function useStorageProviderSettings(): {
  storageProviderSettings: CloudStorageSettings | null
  storageErrorMessage: string | null
  storageProviderSwitchPreview: CloudStorageProviderSwitchPreview | null
  storageProviderCopyProgress: StorageProviderCopyProgress | null
  activeStorageOperation: ActiveStorageSettingsOperation
  storageIsBusy: boolean
  cancelStorageProviderSwitch: () => void
  clearGoogleDriveFolder: () => Promise<boolean>
  dismissStorageError: () => void
  loadStorageSwitchPreview: (
    provider: CloudStorageProvider
  ) => Promise<CloudStorageProviderSwitchPreview | null>
  setupDefaultGoogleDriveFolder: () => void
  switchStorageProvider: (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ) => Promise<boolean>
} {
  const [storageProviderSettings, setStorageProviderSettings] = useState<CloudStorageSettings | null>(null)
  const [activeStorageOperation, setActiveStorageOperation] = useState<ActiveStorageSettingsOperation>(
    StorageSettingsOperation.Load
  )
  const [storageErrorMessage, setStorageErrorMessage] = useState<string | null>(null)
  const [storageProviderSwitchPreview, setStorageProviderSwitchPreview] =
    useState<CloudStorageProviderSwitchPreview | null>(null)
  const [storageProviderCopyProgress, setStorageProviderCopyProgress] =
    useState<StorageProviderCopyProgress | null>(null)
  const storageIsBusy = activeStorageOperation !== null || storageProviderSettings === null

  const runStorageOperation = useCallback(
    async (
      operation: StorageSettingsOperation,
      loadSettings: () => Promise<CloudStorageSettings>
    ): Promise<boolean> => {
      setActiveStorageOperation(operation)
      setStorageErrorMessage(null)

      try {
        const nextSettings = await loadSettings()
        setStorageProviderSettings(nextSettings)
        return true
      } catch (error: unknown) {
        setStorageErrorMessage(getErrorMessage(error, 'Unable to update storage.'))
        return false
      } finally {
        setActiveStorageOperation(null)
      }
    },
    []
  )

  useEffect(() => {
    let shouldIgnoreResult = false

    window.chunkShare.storage
      .getCloudStorageSettings()
      .then((nextSettings) => {
        if (!shouldIgnoreResult) {
          setStorageProviderSettings(nextSettings)
        }
      })
      .catch((error: unknown) => {
        if (!shouldIgnoreResult) {
          setStorageErrorMessage(getErrorMessage(error, 'Unable to load storage provider settings.'))
        }
      })
      .finally(() => {
        if (!shouldIgnoreResult) {
          setActiveStorageOperation(null)
        }
      })

    return () => {
      shouldIgnoreResult = true
    }
  }, [])

  useEffect(() => {
    return window.chunkShare.storage.onProviderCopyProgress(setStorageProviderCopyProgress)
  }, [])

  const setupDefaultGoogleDriveFolder = (): void => {
    void runStorageOperation(StorageSettingsOperation.SetupGoogleDriveFolder, () =>
      window.chunkShare.storage.setupGoogleDriveFolder()
    )
  }

  const clearGoogleDriveFolder = (): Promise<boolean> => {
    return runStorageOperation(StorageSettingsOperation.ClearGoogleDriveFolder, () =>
      window.chunkShare.storage.clearGoogleDriveFolder()
    )
  }

  const loadStorageSwitchPreview = async (
    provider: CloudStorageProvider
  ): Promise<CloudStorageProviderSwitchPreview | null> => {
    setActiveStorageOperation(StorageSettingsOperation.PreviewProviderSwitch)
    setStorageErrorMessage(null)
    setStorageProviderSwitchPreview(null)
    setStorageProviderCopyProgress(null)

    try {
      const preview = await window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider)
      setStorageProviderSwitchPreview(preview)
      return preview
    } catch (error: unknown) {
      setStorageErrorMessage(getErrorMessage(error, 'Unable to check storage provider data.'))
      return null
    } finally {
      setActiveStorageOperation(null)
    }
  }

  const switchStorageProvider = (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ): Promise<boolean> => {
    return switchStorageProviderAsync(provider, dataMode, expectedPreview)
  }

  const switchStorageProviderAsync = async (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ): Promise<boolean> => {
    setActiveStorageOperation(
      dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget
        ? StorageSettingsOperation.CopyProviderData
        : StorageSettingsOperation.SwitchProvider
    )
    setStorageErrorMessage(null)
    setStorageProviderCopyProgress(null)

    try {
      const nextSettings = await updateCloudStorageProvider(provider, dataMode, expectedPreview)
      setStorageProviderSettings(nextSettings)
      setStorageProviderSwitchPreview(null)
      return true
    } catch (error: unknown) {
      setStorageErrorMessage(getErrorMessage(error, 'Unable to switch storage provider.'))

      if (dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget) {
        await refreshStorageProviderSwitchPreview(provider)
      }

      return false
    } finally {
      setActiveStorageOperation(null)
      setStorageProviderCopyProgress(null)
    }
  }

  const refreshStorageProviderSwitchPreview = async (provider: CloudStorageProvider): Promise<void> => {
    try {
      const preview = await window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider)
      setStorageProviderSwitchPreview(preview)
    } catch {
      setStorageProviderSwitchPreview(null)
    }
  }

  const cancelStorageProviderSwitch = (): void => {
    setStorageProviderSwitchPreview(null)
    setStorageProviderCopyProgress(null)
  }

  const dismissStorageError = (): void => {
    setStorageErrorMessage(null)
  }

  return {
    storageProviderSettings,
    storageErrorMessage,
    storageProviderSwitchPreview,
    storageProviderCopyProgress,
    cancelStorageProviderSwitch,
    clearGoogleDriveFolder,
    dismissStorageError,
    activeStorageOperation,
    storageIsBusy,
    loadStorageSwitchPreview,
    setupDefaultGoogleDriveFolder,
    switchStorageProvider
  }
}

async function updateCloudStorageProvider(
  provider: CloudStorageProvider,
  dataMode: CloudStorageProviderSwitchDataMode,
  expectedPreview?: CloudStorageProviderSwitchPreview
): Promise<CloudStorageSettings> {
  if (dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget) {
    if (!expectedPreview) {
      throw new Error('Storage provider copy requires a current data preview.')
    }

    return window.chunkShare.storage.setCloudStorageProvider({
      provider,
      dataMode,
      expectedPreview
    })
  }

  return window.chunkShare.storage.setCloudStorageProvider({
    provider,
    dataMode
  })
}
