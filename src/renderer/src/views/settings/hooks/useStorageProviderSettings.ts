import { useEffect, useState } from 'react'
import {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import { StorageSettingsOperation, type StorageProviderSettingsController } from '../settings.model'

export function useStorageProviderSettings(): StorageProviderSettingsController {
  const [storageProviderSettings, setStorageProviderSettings] =
    useState<CloudStorageSettings | null>(null)
  const [activeStorageOperation, setActiveStorageOperation] = useState<StorageSettingsOperation>(
    StorageSettingsOperation.Load
  )
  const [storageErrorMessage, setStorageErrorMessage] = useState<string | null>(null)
  const [storageProviderSwitchPreview, setStorageProviderSwitchPreview] =
    useState<CloudStorageProviderSwitchPreview | null>(null)
  const storageIsBusy =
    activeStorageOperation !== StorageSettingsOperation.Idle || storageProviderSettings === null

  const runStorageOperation = async <Result>(
    operation: StorageSettingsOperation,
    performStorageAction: () => Promise<Result>,
    applyResult: (result: Result) => void,
    fallbackErrorMessage = 'Unable to update storage.'
  ): Promise<boolean> => {
    setActiveStorageOperation(operation)
    setStorageErrorMessage(null)

    try {
      const result = await performStorageAction()
      applyResult(result)
      return true
    } catch (error: unknown) {
      setStorageErrorMessage(getErrorMessage(error, fallbackErrorMessage))
      return false
    } finally {
      setActiveStorageOperation(StorageSettingsOperation.Idle)
    }
  }

  useEffect(() => {
    window.chunkShare.storage
      .getCloudStorageSettings()
      .then(setStorageProviderSettings)
      .catch((error: unknown) => {
        setStorageErrorMessage(getErrorMessage(error, 'Unable to load storage provider settings.'))
      })
      .finally(() => {
        setActiveStorageOperation(StorageSettingsOperation.Idle)
      })
  }, [])

  const setupDefaultGoogleDriveFolder = (): void => {
    runStorageOperation(
      StorageSettingsOperation.SetupGoogleDriveFolder,
      () => window.chunkShare.storage.setupGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const validateGoogleDriveFolder = (): void => {
    runStorageOperation(
      StorageSettingsOperation.ValidateGoogleDriveFolder,
      () => window.chunkShare.storage.validateGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const clearGoogleDriveFolder = (): Promise<boolean> => {
    return runStorageOperation(
      StorageSettingsOperation.ClearGoogleDriveFolder,
      () => window.chunkShare.storage.clearGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const loadStorageSwitchPreview = (provider: CloudStorageProvider): void => {
    setStorageProviderSwitchPreview(null)

    runStorageOperation(
      StorageSettingsOperation.PreviewProviderSwitch,
      () => window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider),
      setStorageProviderSwitchPreview,
      'Unable to check storage provider data.'
    )
  }

  const switchStorageProvider = (provider: CloudStorageProvider): void => {
    runStorageOperation(
      StorageSettingsOperation.SwitchProvider,
      () => updateCloudStorageProvider(provider),
      (nextSettings) => {
        setStorageProviderSettings(nextSettings)
        setStorageProviderSwitchPreview(null)
      },
      'Unable to switch storage provider.'
    )
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
    loadStorageSwitchPreview,
    setupDefaultGoogleDriveFolder,
    switchStorageProvider,
    validateGoogleDriveFolder
  }
}

async function updateCloudStorageProvider(
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  return window.chunkShare.storage.setCloudStorageProvider({
    provider,
    dataMode: CloudStorageProviderSwitchDataMode.UseTargetAsIs
  })
}
