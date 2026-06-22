import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageSettings,
  type GoogleDriveFolderConfig
} from '../../../shared/cloud-storage.model'
import { AuthError } from '../../auth/auth-error'
import { AuthErrorCode } from '../../auth/auth-model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import {
  createOrReuseDefaultGoogleDriveFolder,
  validateGoogleDriveFolderAccess
} from '../../cloud-storage/google-drive-service'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../persistence/cloud-storage-settings-store'

export async function getCloudStorageSettings(): Promise<CloudStorageSettings> {
  return readCloudStorageSettings()
}

export async function setupGoogleDriveFolder(): Promise<CloudStorageSettings> {
  return saveValidatedGoogleDriveFolder(() => createOrReuseDefaultGoogleDriveFolder())
}

export async function validateGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  const folderId = settings.googleDrive.folder?.folderId

  if (!folderId) {
    return writeAndReturnCloudStorageSettings({
      ...settings,
      googleDrive: {
        status: GoogleDriveSetupStatus.NotConfigured,
        folder: null,
        errorMessage: null
      }
    })
  }

  return saveValidatedGoogleDriveFolder(() => validateGoogleDriveFolderAccess(folderId))
}

export async function clearGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()

  return writeAndReturnCloudStorageSettings({
    ...settings,
    activeProvider: CloudStorageProvider.Local,
    googleDrive: {
      status: GoogleDriveSetupStatus.NotConfigured,
      folder: null,
      errorMessage: null
    }
  })
}

async function saveValidatedGoogleDriveFolder(
  loadFolderConfig: () => Promise<GoogleDriveFolderConfig>
): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()

  try {
    const folder = await loadFolderConfig()

    return writeAndReturnCloudStorageSettings({
      ...settings,
      activeProvider: CloudStorageProvider.Local,
      googleDrive: {
        status: GoogleDriveSetupStatus.Valid,
        folder,
        errorMessage: null
      }
    })
  } catch (error) {
    return writeAndReturnCloudStorageSettings({
      ...settings,
      activeProvider: CloudStorageProvider.Local,
      googleDrive: {
        status: getCloudStorageErrorStatus(error),
        folder: settings.googleDrive.folder,
        errorMessage: getCloudStorageErrorMessage(error)
      }
    })
  }
}

async function writeAndReturnCloudStorageSettings(
  settings: CloudStorageSettings
): Promise<CloudStorageSettings> {
  await writeCloudStorageSettings(settings)

  return settings
}

function getCloudStorageErrorStatus(error: unknown): GoogleDriveSetupStatus {
  if (isGoogleDriveAuthError(error)) {
    return GoogleDriveSetupStatus.NeedsAuth
  }

  return GoogleDriveSetupStatus.Blocked
}

function getCloudStorageErrorMessage(error: unknown): string {
  if (error instanceof GoogleDriveError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to configure Google Drive storage.'
}

function isGoogleDriveAuthError(error: unknown): boolean {
  if (!(error instanceof AuthError)) {
    return false
  }

  return (
    error.code === AuthErrorCode.Cancelled ||
    error.code === AuthErrorCode.ExpiredSession ||
    error.code === AuthErrorCode.InvalidCallback ||
    error.code === AuthErrorCode.InvalidStoredSession ||
    error.code === AuthErrorCode.MissingRefreshToken ||
    error.code === AuthErrorCode.TimedOut
  )
}
