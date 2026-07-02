import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchRequest,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type GoogleDriveFolderConfig,
  CloudStorageProviderSwitchDataMode
} from '../../../shared/cloud-storage.model'
import { ServerLockStatus } from '../../../shared/domain'
import { isServerActiveStatus } from '../../../shared/server-runtime'
import { AuthError } from '../../auth/auth-error'
import { AuthErrorCode } from '../../auth/auth-model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import { ensureGoogleDriveFolder } from '../../cloud-storage/google-drive-service'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { getStorageAdapterForProvider } from '../adapters/storage-adapter-service'
import { ensureLocalStorage } from '../adapters/local-storage-adapter'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import {
  readCloudStorageSettings,
  writeCloudStorageSettings
} from '../persistence/cloud-storage-settings-store'
import { hasValidGoogleDriveFolder } from './storage-validation'
import { StorageError } from './storage-error'
import { GOOGLE_DRIVE_NOT_READY_ERROR_MESSAGE } from './cloud-storage-messages'

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
  assertServerIsNotActive()
  const folderId = settings.googleDrive.folder?.folderId

  return ensureAndSaveGoogleDriveFolder(settings, folderId)
}

export async function validateGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  assertServerIsNotActive()
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

  return ensureAndSaveGoogleDriveFolder(settings, folderId)
}

export async function clearGoogleDriveFolder(): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()

  if (settings.activeProvider === CloudStorageProvider.GoogleDrive) {
    const provider = CloudStorageProvider.Local
    const dataMode = CloudStorageProviderSwitchDataMode.UseTargetAsIs
    await setCloudStorageProvider({ provider, dataMode })
  } else {
    assertServerIsNotActive()
  }

  return writeAndReturnCloudStorageSettings({
    ...settings,
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

async function ensureAndSaveGoogleDriveFolder(
  settings: CloudStorageSettings,
  folderId?: string
): Promise<CloudStorageSettings> {
  try {
    const validatedFolder = await ensureGoogleDriveFolder(folderId)
    return saveValidGoogleDriveFolder(settings, validatedFolder)
  } catch (error) {
    return handleGoogleDriveFolderOperationFailure(settings, error)
  }
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
    hasValidGoogleDriveFolder(settings.googleDrive)

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

function assertServerIsNotActive(): void {
  const runtimeSnapshot = getServerRuntimeSnapshot()

  if (isServerActiveStatus(runtimeSnapshot.status)) {
    throw new StorageError('Cannot change storage settings while the Minecraft server is active.')
  }
}

async function assertCloudStorageProviderCanSwitch(
  activeProvider: CloudStorageProvider,
  newProvider: CloudStorageProvider
): Promise<void> {
  assertServerIsNotActive()
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

  if (!hasValidGoogleDriveFolder(settings.googleDrive)) {
    throw new StorageError(
      settings.googleDrive.errorMessage ?? GOOGLE_DRIVE_NOT_READY_ERROR_MESSAGE
    )
  }

  let validatedFolder: GoogleDriveFolderConfig

  try {
    validatedFolder = await ensureGoogleDriveFolder(settings.googleDrive.folder?.folderId)
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
