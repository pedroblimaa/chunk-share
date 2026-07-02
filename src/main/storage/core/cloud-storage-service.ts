import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchRequest,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type GoogleDriveFolderConfig
} from '../../../shared/cloud-storage.model'
import { ServerLockStatus } from '../../../shared/domain'
import { isServerActiveStatus } from '../../../shared/server-runtime'
import { AuthError } from '../../auth/auth-error'
import { AuthErrorCode } from '../../auth/auth-model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import {
  createOrReuseDefaultGoogleDriveFolder,
  validateGoogleDriveFolderAccess
} from '../../cloud-storage/google-drive-service'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { getStorageAdapterForProvider } from '../adapters/storage-adapter-service'
import { ensureLocalStorage } from '../adapters/local-storage-adapter'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../persistence/cloud-storage-settings-store'
import { StorageError } from './storage-error'

export async function getCloudStorageSettings(): Promise<CloudStorageSettings> {
  return readCloudStorageSettings()
}

export async function getCloudStorageProviderSwitchPreview(
  targetProvider: CloudStorageProvider
): Promise<CloudStorageProviderSwitchPreview> {
  const settings = await readCloudStorageSettings()
  const sourceProvider = settings.activeProvider

  if (sourceProvider === targetProvider) {
    throw new StorageError('The selected storage provider is already active.')
  }

  const sourceAdapter = await getStorageAdapterForProvider(sourceProvider)
  const targetAdapter = await getStorageAdapterForProvider(targetProvider)
  const [source, target] = await Promise.all([
    createCloudStorageProviderDataSummary(sourceProvider, sourceAdapter),
    createCloudStorageProviderDataSummary(targetProvider, targetAdapter)
  ])

  return { source, target }
}

export async function setupGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  assertStorageSettingsCanChange()
  const folderId = settings.googleDrive.folder?.folderId

  const loadFolderConfig = folderId
    ? () => validateGoogleDriveFolderAccess(folderId)
    : () => createOrReuseDefaultGoogleDriveFolder()

  return validateAndSaveGoogleDriveFolder(settings, loadFolderConfig)
}

export async function validateGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  assertStorageSettingsCanChange()
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

  return validateAndSaveGoogleDriveFolder(settings, () => validateGoogleDriveFolderAccess(folderId))
}

export async function clearGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()

  if (settings.activeProvider === CloudStorageProvider.GoogleDrive) {
    await assertCloudStorageProviderCanSwitch(
      CloudStorageProvider.GoogleDrive,
      CloudStorageProvider.Local
    )
    await ensureLocalStorage()
  } else {
    assertStorageSettingsCanChange()
  }

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

export async function setCloudStorageProvider(
  request: CloudStorageProviderSwitchRequest
): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  if (settings.activeProvider === request.provider) {
    return settings
  }

  await assertCloudStorageProviderCanSwitch(settings.activeProvider, request.provider)
  const validatedSettings = await validateTargetProvider(request.provider)

  return activateCloudStorageProvider(validatedSettings, request.provider)
}

function activateCloudStorageProvider(
  settings: CloudStorageSettings,
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  return writeAndReturnCloudStorageSettings({
    ...settings,
    activeProvider: provider
  })
}

async function validateAndSaveGoogleDriveFolder(
  settings: CloudStorageSettings,
  loadFolderConfig: () => Promise<GoogleDriveFolderConfig>
): Promise<CloudStorageSettings> {
  let validatedFolder: GoogleDriveFolderConfig

  try {
    validatedFolder = await loadFolderConfig()
  } catch (error) {
    return handleGoogleDriveFolderOperationFailure(settings, error)
  }

  return saveValidGoogleDriveFolder(settings, validatedFolder)
}

function saveValidGoogleDriveFolder(
  settings: CloudStorageSettings,
  folder: GoogleDriveFolderConfig
): Promise<CloudStorageSettings> {
  return writeAndReturnCloudStorageSettings({
    ...settings,
    googleDrive: {
      status: GoogleDriveSetupStatus.Valid,
      folder,
      errorMessage: null
    }
  })
}

function handleGoogleDriveFolderOperationFailure(
  settings: CloudStorageSettings,
  error: unknown
): Promise<CloudStorageSettings> {
  const hasActiveValidGoogleDriveFolder =
    settings.activeProvider === CloudStorageProvider.GoogleDrive &&
    settings.googleDrive.status === GoogleDriveSetupStatus.Valid &&
    settings.googleDrive.folder !== null

  if (hasActiveValidGoogleDriveFolder) {
    throw new StorageError(getCloudStorageErrorMessage(error))
  }

  return writeAndReturnCloudStorageSettings({
    ...settings,
    googleDrive: {
      status: getCloudStorageErrorStatus(error),
      folder: settings.googleDrive.folder,
      errorMessage: getCloudStorageErrorMessage(error)
    }
  })
}

async function writeAndReturnCloudStorageSettings(
  settings: CloudStorageSettings
): Promise<CloudStorageSettings> {
  await writeCloudStorageSettings(settings)

  return settings
}

async function createCloudStorageProviderDataSummary(
  provider: CloudStorageProvider,
  storageAdapter: StorageAdapter
): Promise<CloudStorageProviderDataSummary> {
  const [latestSave, versionFiles] = await Promise.all([
    storageAdapter.readLatestSave(),
    storageAdapter.listServerSaveVersions()
  ])

  return {
    provider,
    latestSaveVersion: latestSave?.saveVersion ?? null,
    latestSaveUploadedAt: latestSave?.uploadedAt ?? null,
    versionCount: versionFiles.length
  }
}

function assertStorageSettingsCanChange(): void {
  const runtimeSnapshot = getServerRuntimeSnapshot()

  if (isServerActiveStatus(runtimeSnapshot.status)) {
    throw new StorageError('Cannot change storage settings while the Minecraft server is active.')
  }
}

async function assertCloudStorageProviderCanSwitch(
  activeProvider: CloudStorageProvider,
  newProvider: CloudStorageProvider
): Promise<void> {
  assertStorageSettingsCanChange()
  await assertStorageProviderIsUnlocked(activeProvider)
  await assertStorageProviderIsUnlocked(newProvider)
}

async function assertStorageProviderIsUnlocked(provider: CloudStorageProvider): Promise<void> {
  const storageAdapter = await getStorageAdapterForProvider(provider)
  const serverLock = await storageAdapter.readServerLock()

  if (serverLock.status === ServerLockStatus.Locked) {
    throw new StorageError(
      `Cannot switch storage while ${serverLock.lockedBy.displayName} is hosting this server.`
    )
  }
}

async function validateTargetProvider(
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()

  if (provider === CloudStorageProvider.Local) {
    await ensureLocalStorage()
    return settings
  }

  if (
    settings.googleDrive.status !== GoogleDriveSetupStatus.Valid ||
    !settings.googleDrive.folder
  ) {
    const invalidMessage =
      'Google Drive storage cannot be activated until the Drive folder is valid.'
    throw new StorageError(settings.googleDrive.errorMessage ?? invalidMessage)
  }

  let validatedFolder: GoogleDriveFolderConfig

  try {
    validatedFolder = await validateGoogleDriveFolderAccess(settings.googleDrive.folder.folderId)
  } catch (error) {
    throw new StorageError(getCloudStorageErrorMessage(error))
  }

  return {
    ...settings,
    googleDrive: {
      status: GoogleDriveSetupStatus.Valid,
      folder: validatedFolder,
      errorMessage: null
    }
  }
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
