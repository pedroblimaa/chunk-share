import { useCallback, useEffect, useState } from 'react'
import {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import { StorageSettingsOperation, type ActiveStorageSettingsOperation } from '../settings.model'

export function useStorageProviderSettings(): {
  storageProviderSettings: CloudStorageSettings | null
  storageErrorMessage: string | null
  storageProviderSwitchPreview: CloudStorageProviderSwitchPreview | null
  activeStorageOperation: ActiveStorageSettingsOperation
  storageIsBusy: boolean
  cancelStorageProviderSwitch: () => void
  clearGoogleDriveFolder: () => Promise<boolean>
  dismissStorageError: () => void
  prepareStorageProviderSwitch: (provider: CloudStorageProvider) => void
  setupDefaultGoogleDriveFolder: () => void
  switchStorageProvider: (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ) => void
  validateGoogleDriveFolder: () => void
} {
  const [storageProviderSettings, setStorageProviderSettings] = useState<CloudStorageSettings | null>(null)
  const [activeStorageOperation, setActiveStorageOperation] = useState<ActiveStorageSettingsOperation>(
    StorageSettingsOperation.Load
  )
  const [storageErrorMessage, setStorageErrorMessage] = useState<string | null>(null)
  const [storageProviderSwitchPreview, setStorageProviderSwitchPreview] =
    useState<CloudStorageProviderSwitchPreview | null>(null)
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

  const setupDefaultGoogleDriveFolder = (): void => {
    void runStorageOperation(StorageSettingsOperation.SetupGoogleDriveFolder, () =>
      window.chunkShare.storage.setupGoogleDriveFolder()
    )
  }

  const validateGoogleDriveFolder = (): void => {
    void runStorageOperation(StorageSettingsOperation.ValidateGoogleDriveFolder, () =>
      window.chunkShare.storage.validateGoogleDriveFolder()
    )
  }

  const clearGoogleDriveFolder = (): Promise<boolean> => {
    return runStorageOperation(StorageSettingsOperation.ClearGoogleDriveFolder, () =>
      window.chunkShare.storage.clearGoogleDriveFolder()
    )
  }

  const prepareStorageProviderSwitch = (provider: CloudStorageProvider): void => {
    void prepareStorageProviderSwitchAsync(provider)
  }

  const prepareStorageProviderSwitchAsync = async (provider: CloudStorageProvider): Promise<void> => {
    setActiveStorageOperation(StorageSettingsOperation.PreviewProviderSwitch)
    setStorageErrorMessage(null)
    setStorageProviderSwitchPreview(null)

    try {
      const preview = await window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider)
      const sourceHasData = storageProviderHasData(preview.source)
      const targetHasData = storageProviderHasData(preview.target)

      if (sourceHasData && targetHasData) {
        setStorageProviderSwitchPreview(preview)
        return
      }

      const dataMode = sourceHasData
        ? CloudStorageProviderSwitchDataMode.CopyCurrentToTarget
        : CloudStorageProviderSwitchDataMode.UseTargetAsIs

      const nextOperation =
        dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget
          ? StorageSettingsOperation.CopyProviderData
          : StorageSettingsOperation.SwitchProvider

      setActiveStorageOperation(nextOperation)

      const nextSettings = await updateCloudStorageProvider(provider, dataMode, preview)
      setStorageProviderSettings(nextSettings)
    } catch (error: unknown) {
      setStorageErrorMessage(getErrorMessage(error, 'Unable to switch storage provider.'))
    } finally {
      setActiveStorageOperation(null)
    }
  }

  const switchStorageProvider = (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ): void => {
    void switchStorageProviderAsync(provider, dataMode, expectedPreview)
  }

  const switchStorageProviderAsync = async (
    provider: CloudStorageProvider,
    dataMode: CloudStorageProviderSwitchDataMode,
    expectedPreview?: CloudStorageProviderSwitchPreview
  ): Promise<void> => {
    setActiveStorageOperation(
      dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget
        ? StorageSettingsOperation.CopyProviderData
        : StorageSettingsOperation.SwitchProvider
    )
    setStorageErrorMessage(null)

    try {
      const nextSettings = await updateCloudStorageProvider(provider, dataMode, expectedPreview)
      setStorageProviderSettings(nextSettings)
      setStorageProviderSwitchPreview(null)
    } catch (error: unknown) {
      setStorageErrorMessage(getErrorMessage(error, 'Unable to switch storage provider.'))

      if (dataMode === CloudStorageProviderSwitchDataMode.CopyCurrentToTarget) {
        await refreshStorageProviderSwitchPreview(provider)
      }
    } finally {
      setActiveStorageOperation(null)
    }
  }

  const refreshStorageProviderSwitchPreview = async (provider: CloudStorageProvider): Promise<void> => {
    try {
      const preview = await window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider)

      setStorageProviderSwitchPreview(
        storageProviderHasData(preview.source) && storageProviderHasData(preview.target) ? preview : null
      )
    } catch {
      setStorageProviderSwitchPreview(null)
    }
  }

  const cancelStorageProviderSwitch = (): void => {
    setStorageProviderSwitchPreview(null)
  }

  const dismissStorageError = (): void => {
    setStorageErrorMessage(null)
  }

  return {
    storageProviderSettings,
    storageErrorMessage,
    storageProviderSwitchPreview,
    cancelStorageProviderSwitch,
    clearGoogleDriveFolder,
    dismissStorageError,
    activeStorageOperation,
    storageIsBusy,
    prepareStorageProviderSwitch,
    setupDefaultGoogleDriveFolder,
    switchStorageProvider,
    validateGoogleDriveFolder
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

function storageProviderHasData(summary: CloudStorageProviderSwitchPreview['source']): boolean {
  return summary.latestSaveVersion !== null || summary.versionCount > 0
}
