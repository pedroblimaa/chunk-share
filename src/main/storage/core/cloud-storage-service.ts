import {
  CloudStorageProvider,
  GoogleDriveSetupStatus,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type GoogleDriveFolderConfig
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
import { saveLocalSaveVersion } from '../persistence/local-state-store'
import { hasValidGoogleDriveFolder } from './storage-validation'
import { StorageError } from './storage-error'
import { GOOGLE_DRIVE_NOT_READY_ERROR_MESSAGE } from './cloud-storage-messages'
import { runExclusiveStorageOperation } from './storage-operation-coordinator'
import { ExclusiveStorageOperation } from './storage-operation.model'

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

export function setupGoogleDriveFolder(): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(async () => {
    const settings = await readCloudStorageSettings()
    assertServerIsNotActive()
    const folderId = settings.googleDrive.folder?.folderId

    return ensureAndSaveGoogleDriveFolder(settings, folderId)
  })
}

export function validateGoogleDriveFolder(): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(async () => {
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
  })
}

export function clearGoogleDriveFolder(): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(async () => {
    let settings = await readCloudStorageSettings()

    if (settings.activeProvider === CloudStorageProvider.GoogleDrive) {
      settings = await switchCloudStorageProvider(settings, CloudStorageProvider.Local)
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
  })
}

export function setCloudStorageProvider(
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(async () => {
    const settings = await readCloudStorageSettings()

    return switchCloudStorageProvider(settings, provider)
  })
}

async function switchCloudStorageProvider(
  settings: CloudStorageSettings,
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  if (settings.activeProvider === provider) {
    return settings
  }

  await assertCloudStorageProviderCanSwitch(settings.activeProvider, provider)
  const validatedSettings = await validateTargetProvider(settings, provider)

  return activateCloudStorageProvider(validatedSettings, provider)
}

async function activateCloudStorageProvider(
  settings: CloudStorageSettings,
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  await saveLocalSaveVersion(null)

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
    return saveGoogleDriveFolderFailure(settings, error)
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

function saveGoogleDriveFolderFailure(
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
    latestSaveRecordedAt: latestSave?.uploadedAt ?? null,
    versionCount: versionFiles.length
  }
}

function assertServerIsNotActive(): void {
  const runtimeSnapshot = getServerRuntimeSnapshot()

  if (isServerActiveStatus(runtimeSnapshot.status)) {
    throw new StorageError('Cannot change storage settings while the Minecraft server is active.')
  }
}

function runStorageSettingsChange<Result>(
  executeOperation: () => Promise<Result>
): Promise<Result> {
  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.StorageSettingsChange,
    new StorageError(
      'Cannot change storage settings while another storage operation is in progress.'
    ),
    executeOperation
  )
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
  settings: CloudStorageSettings,
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
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
    await saveGoogleDriveFolderFailure(settings, error)
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
