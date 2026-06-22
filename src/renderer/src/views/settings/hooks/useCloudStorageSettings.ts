import { useCallback, useEffect, useState } from 'react'
import type { CloudStorageSettings } from '../../../../../shared/cloud-storage.model'
import { getErrorMessage } from '../../../utils/error-message'
import type { GoogleDriveSettingsAction, GoogleDriveSettingsActionState } from '../settings.model'

export function useCloudStorageSettings(): {
  cloudStorageSettings: CloudStorageSettings | null
  googleDriveAction: GoogleDriveSettingsActionState
  googleDriveErrorMessage: string | null
  googleDriveIsBusy: boolean
  clearGoogleDriveFolder: () => void
  setupDefaultGoogleDriveFolder: () => void
  validateGoogleDriveFolder: () => void
} {
  const [cloudStorageSettings, setCloudStorageSettings] = useState<CloudStorageSettings | null>(
    null
  )
  const [googleDriveAction, setGoogleDriveAction] = useState<GoogleDriveSettingsActionState>('load')
  const [googleDriveErrorMessage, setGoogleDriveErrorMessage] = useState<string | null>(null)
  const googleDriveIsBusy = googleDriveAction !== null || cloudStorageSettings === null

  const runGoogleDriveAction = useCallback(
    async (
      action: GoogleDriveSettingsAction,
      loadSettings: () => Promise<CloudStorageSettings>
    ): Promise<void> => {
      setGoogleDriveAction(action)
      setGoogleDriveErrorMessage(null)

      try {
        const nextSettings = await loadSettings()
        setCloudStorageSettings(nextSettings)
      } catch (error: unknown) {
        setGoogleDriveErrorMessage(getErrorMessage(error, 'Unable to update Google Drive storage.'))
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
          setGoogleDriveErrorMessage(
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
    void runGoogleDriveAction('setup-default-folder', () =>
      window.chunkShare.storage.setupGoogleDriveFolder()
    )
  }

  const validateGoogleDriveFolder = (): void => {
    void runGoogleDriveAction('validate-folder', () =>
      window.chunkShare.storage.validateGoogleDriveFolder()
    )
  }

  const clearGoogleDriveFolder = (): void => {
    void runGoogleDriveAction('clear-folder', () =>
      window.chunkShare.storage.clearGoogleDriveFolder()
    )
  }

  return {
    cloudStorageSettings,
    clearGoogleDriveFolder,
    googleDriveAction,
    googleDriveErrorMessage,
    googleDriveIsBusy,
    setupDefaultGoogleDriveFolder,
    validateGoogleDriveFolder
  }
}
