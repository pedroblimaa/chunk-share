import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageSettings,
  type GoogleDriveFolderConfig
} from '../../../shared/cloud-storage.model'
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
        status: GoogleDriveSetupStatus.Blocked,
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

function getCloudStorageErrorMessage(error: unknown): string {
  if (error instanceof GoogleDriveError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to configure Google Drive storage.'
}
