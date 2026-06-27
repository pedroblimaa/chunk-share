import { useCallback, useEffect, useState } from 'react'
import {
  CloudStorageProviderSwitchDataMode,
  type CloudStorageProvider,
  type CloudStorageSettings
} from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import type { GoogleDriveSettingsAction, GoogleDriveSettingsActionState } from '../settings.model'

export function useCloudStorageSettings(): {
  cloudStorageSettings: CloudStorageSettings | null
  cloudStorageErrorMessage: string | null
  googleDriveAction: GoogleDriveSettingsActionState
  googleDriveIsBusy: boolean
  clearGoogleDriveFolder: () => void
  dismissCloudStorageError: () => void
  setupDefaultGoogleDriveFolder: () => void
  switchCloudStorageProvider: (provider: CloudStorageProvider) => void
  validateGoogleDriveFolder: () => void
} {
  const [cloudStorageSettings, setCloudStorageSettings] = useState<CloudStorageSettings | null>(
    null
  )
  const [googleDriveAction, setGoogleDriveAction] = useState<GoogleDriveSettingsActionState>('load')
  const [cloudStorageErrorMessage, setCloudStorageErrorMessage] = useState<string | null>(null)
  const googleDriveIsBusy = googleDriveAction !== null || cloudStorageSettings === null

  const runCloudStorageAction = useCallback(
    async (
      action: GoogleDriveSettingsAction,
      loadSettings: () => Promise<CloudStorageSettings>
    ): Promise<void> => {
      setGoogleDriveAction(action)
      setCloudStorageErrorMessage(null)

      try {
        const nextSettings = await loadSettings()
        setCloudStorageSettings(nextSettings)
      } catch (error: unknown) {
        setCloudStorageErrorMessage(getErrorMessage(error, 'Unable to update cloud storage.'))
      } finally {
        setGoogleDriveAction(null)
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
          setCloudStorageSettings(nextSettings)
        }
      })
      .catch((error: unknown) => {
        if (!shouldIgnoreResult) {
          setCloudStorageErrorMessage(
            getErrorMessage(error, 'Unable to load Google Drive storage settings.')
          )
        }
      })
      .finally(() => {
        if (!shouldIgnoreResult) {
          setGoogleDriveAction(null)
        }
      })

    return () => {
      shouldIgnoreResult = true
    }
  }, [])

  const setupDefaultGoogleDriveFolder = (): void => {
    void runCloudStorageAction('setup-default-folder', () =>
      window.chunkShare.storage.setupGoogleDriveFolder()
    )
  }

  const validateGoogleDriveFolder = (): void => {
    void runCloudStorageAction('validate-folder', () =>
      window.chunkShare.storage.validateGoogleDriveFolder()
    )
  }

  const clearGoogleDriveFolder = (): void => {
    void runCloudStorageAction('clear-folder', () =>
      window.chunkShare.storage.clearGoogleDriveFolder()
    )
  }

  const switchCloudStorageProvider = (provider: CloudStorageProvider): void => {
    void runCloudStorageAction('switch-provider', () =>
      window.chunkShare.storage.setCloudStorageProvider({
        provider,
        dataMode: CloudStorageProviderSwitchDataMode.UseTargetAsIs
      })
    )
  }

  const dismissCloudStorageError = (): void => {
    setCloudStorageErrorMessage(null)
  }

  return {
    cloudStorageSettings,
    cloudStorageErrorMessage,
    clearGoogleDriveFolder,
    dismissCloudStorageError,
    googleDriveAction,
    googleDriveIsBusy,
    setupDefaultGoogleDriveFolder,
    switchCloudStorageProvider,
    validateGoogleDriveFolder
  }
}
