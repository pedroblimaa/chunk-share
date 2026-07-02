import { useEffect, useState } from 'react'
import {
  CloudStorageProvider,
  CloudStorageProviderSwitchDataMode,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import { StorageSettingsOperation, type StorageProviderSettingsController } from '../settings.model'

export function useStorageProviderSettingsController(): StorageProviderSettingsController {
  const [storageProviderSettings, setStorageProviderSettings] =
    useState<CloudStorageSettings | null>(null)
  const [currentOperation, setCurrentOperation] = useState<StorageSettingsOperation>(
    StorageSettingsOperation.Load
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [storageProviderSwitchPreview, setStorageProviderSwitchPreview] =
    useState<CloudStorageProviderSwitchPreview | null>(null)
  const activeStorageProvider =
    storageProviderSettings?.activeProvider ?? CloudStorageProvider.Local
  const operationState = {
    errorMessage,
    isBusy: currentOperation !== StorageSettingsOperation.Idle,
    operation: currentOperation
  }

  const runStorageOperation = async <Result>(
    operation: StorageSettingsOperation,
    performStorageAction: () => Promise<Result>,
    applyResult: (result: Result) => void,
    fallbackErrorMessage = 'Unable to update storage.'
  ): Promise<boolean> => {
    setCurrentOperation(operation)
    setErrorMessage(null)

    try {
      const result = await performStorageAction()
      applyResult(result)
      return true
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error, fallbackErrorMessage))
      return false
    } finally {
      setCurrentOperation(StorageSettingsOperation.Idle)
    }
  }

  useEffect(() => {
    window.chunkShare.storage
      .getCloudStorageSettings()
      .then(setStorageProviderSettings)
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error, 'Unable to load storage provider settings.'))
      })
      .finally(() => {
        setCurrentOperation(StorageSettingsOperation.Idle)
      })
  }, [])

  const requestGoogleDriveSetup = (): void => {
    runStorageOperation(
      StorageSettingsOperation.SetupGoogleDriveFolder,
      () => window.chunkShare.storage.setupGoogleDriveFolder(),
      setStorageProviderSettings
    )
  }

  const requestGoogleDriveValidation = (): void => {
    runStorageOperation(
      StorageSettingsOperation.ValidateGoogleDriveFolder,
      () => window.chunkShare.storage.validateGoogleDriveFolder(),
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

  const requestStorageProviderSwitchPreview = (provider: CloudStorageProvider): void => {
    setStorageProviderSwitchPreview(null)

    runStorageOperation(
      StorageSettingsOperation.PreviewProviderSwitch,
      () => window.chunkShare.storage.getCloudStorageProviderSwitchPreview(provider),
      setStorageProviderSwitchPreview,
      'Unable to check storage provider data.'
    )
  }

  const requestStorageProviderSwitch = (provider: CloudStorageProvider): void => {
    const updateProvider = (): Promise<CloudStorageSettings> =>
      window.chunkShare.storage.setCloudStorageProvider({
        provider,
        dataMode: CloudStorageProviderSwitchDataMode.UseTargetAsIs
      })

    const applyResult = (nextSettings: CloudStorageSettings): void => {
      setStorageProviderSettings(nextSettings)
      setStorageProviderSwitchPreview(null)
    }

    runStorageOperation(
      StorageSettingsOperation.SwitchProvider,
      updateProvider,
      applyResult,
      'Unable to switch storage provider.'
    )
  }

  const resetStorageProviderSwitchPreview = (): void => {
    setStorageProviderSwitchPreview(null)
  }

  const dismissStorageError = (): void => {
    setErrorMessage(null)
  }

  return {
    storageProviderSettings,
    storageProviderSwitchPreview,
    activeStorageProvider,
    operationState,
    dismissStorageError,
    requestGoogleDriveDisconnect,
    requestGoogleDriveSetup,
    requestGoogleDriveValidation,
    requestStorageProviderSwitch,
    requestStorageProviderSwitchPreview,
    resetStorageProviderSwitchPreview
  }
}
