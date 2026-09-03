import {
  CloudStorageProvider,
  StorageSwitchDataMode,
  GoogleDriveSetupStatus,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchRequest,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type GoogleDriveWorldReference,
  type GoogleDriveWorldState
} from '../../../shared/cloud-storage.model'
import { ServerLockStatus } from '../../../shared/domain'
import { ExclusiveStorageOperation } from '../../../shared/storage-operation'
import type { AppState, LocalWorldState } from '../../../shared/world'
import { AuthError } from '../../auth/auth-error'
import { AuthErrorCode } from '../../auth/auth-model'
import { GoogleDriveError } from '../../cloud-storage/google-drive-error'
import { ensureGoogleDriveFolder } from '../../cloud-storage/google-drive-service'
import { getServerRuntimeSnapshot } from '../../server-runtime/server-runtime-service'
import { validateSharedGoogleDriveWorld } from '../adapters/google-drive-storage-adapter'
import { getOrCreateStorageContext, getStorageAdapterForProvider } from '../adapters/storage-adapter-service'
import { ensureLocalStorage } from '../adapters/local-storage-adapter'
import type { StorageAdapter } from '../adapters/storage-adapter.model'
import {
  createWorld,
  readAppState,
  readCloudStorageSettings,
  reconcileSelectedWorld,
  selectWorld,
  saveWorldLocalSaveVersion,
  writeCloudStorageSettings
} from '../persistence/local-state-store'
import { runExclusiveStorageOperation } from './operations/operation-coordinator'
import type { StorageProviderCopyProgressListener } from './provider-copy/provider-copy.model'
import { executeStorageProviderCopy, createVisibleProgressReporter } from './provider-copy-service'
import { StorageError } from './support/storage-error'
import { hasValidGoogleDriveFolder } from './support/storage-validation'
import {
  inspectWorldCatalog,
  isWorldCatalogEntryVisible,
  worldHasStorageProviderConfiguration
} from '../../world-catalog/world-catalog-service'
import { createWorldContext } from './world-context'

const GOOGLE_DRIVE_NOT_READY_ERROR_MESSAGE =
  'Google Drive storage cannot be activated until the Drive folder is valid.'

export async function getCloudStorageSettings(): Promise<CloudStorageSettings> {
  return readCloudStorageSettings()
}

export function activateSharedGoogleDriveWorld(
  reference: GoogleDriveWorldReference
): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(() => saveSharedGoogleDriveWorld(reference))
}

export function getCloudStorageProviderSwitchPreview(
  targetProvider: CloudStorageProvider
): Promise<CloudStorageProviderSwitchPreview> {
  return runStorageSettingsChange(() => createCloudStorageProviderSwitchPreview(targetProvider))
}

async function createCloudStorageProviderSwitchPreview(
  targetProvider: CloudStorageProvider
): Promise<CloudStorageProviderSwitchPreview> {
  const settings = await readCloudStorageSettings()
  const appState = await readAppState()
  const sourceProvider = settings.activeProvider

  if (sourceProvider === targetProvider) {
    throw new StorageError('The selected storage provider is already active.')
  }

  const selectedWorld = appState.worlds.find(({ id }) => id === appState.selectedWorldId) ?? null
  const sourceAdapter = await getConfiguredWorldAdapter(appState, selectedWorld, sourceProvider)
  const targetAdapter = await getConfiguredWorldAdapter(appState, selectedWorld, targetProvider)
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

    return ensureAndSaveGoogleDriveFolder(settings, settings.googleDrive.folder)
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

    return ensureAndSaveGoogleDriveFolder(settings, settings.googleDrive.folder)
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

    await writeAndReturnCloudStorageSettings({
      ...settings,
      googleDrive: {
        status: GoogleDriveSetupStatus.NotConfigured,
        folder: null,
        errorMessage: null
      }
    })

    await reconcileWorldCatalogSelection()

    return readCloudStorageSettings()
  })
}

export function setCloudStorageProvider(
  request: CloudStorageProviderSwitchRequest,
  onCopyProgress: StorageProviderCopyProgressListener = () => undefined
): Promise<CloudStorageSettings> {
  return runStorageSettingsChange(async () => {
    const settings = await readCloudStorageSettings()

    if (settings.activeProvider === request.provider) {
      return settings
    }

    await assertCloudStorageProviderCanSwitch(settings.activeProvider, request.provider)
    let validatedSettings = await validateAndPrepareTargetProvider(settings, request.provider)

    if (request.dataMode === StorageSwitchDataMode.UseTargetAsIs) {
      await activateCloudStorageProvider(validatedSettings, request.provider)
    } else {
      validatedSettings = await prepareProviderCopyTarget(request.provider)
      await executeStorageProviderCopy(
        settings,
        validatedSettings,
        request.provider,
        request.expectedPreview,
        createVisibleProgressReporter(settings.activeProvider, request.provider, onCopyProgress),
        activateCloudStorageProvider
      )
    }

    await reconcileWorldCatalogSelection()

    return readCloudStorageSettings()
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
  const validatedSettings = await validateAndPrepareTargetProvider(settings, provider)

  return activateCloudStorageProvider(validatedSettings, provider)
}

async function saveSharedGoogleDriveWorld(
  reference: GoogleDriveWorldReference
): Promise<CloudStorageSettings> {
  const settings = await readCloudStorageSettings()
  assertServerIsNotActive()

  const world = await validateSharedGoogleDriveWorld(reference)
  const latestSave = world.latestSave

  if (!latestSave) {
    throw new StorageError('This Google Drive folder does not contain a shared ChunkShare world.')
  }

  if (!world.worldFileExists) {
    throw new StorageError('The shared world file is unavailable in Google Drive.')
  }

  const appState = await readAppState()

  if (appState.worlds.some(({ id }) => id === world.worldId)) {
    await selectWorld(world.worldId)
  } else {
    await createWorld(world.worldId)
  }

  await saveWorldLocalSaveVersion(world.worldId, null)
  const now = new Date().toISOString()

  return writeAndReturnCloudStorageSettings({
    ...settings,
    activeProvider: CloudStorageProvider.GoogleDrive,
    googleDrive: {
      status: GoogleDriveSetupStatus.Valid,
      folder: {
        folderId: reference.folderId,
        ownerAccountId: world.ownerAccountId,
        worldFileIds: {
          controlFileId: reference.controlFileId,
          worldFileId: reference.worldFileId
        },
        configuredAt: now,
        validatedAt: now
      },
      errorMessage: null
    }
  })
}

async function activateCloudStorageProvider(
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
  folder?: GoogleDriveWorldState | null
): Promise<CloudStorageSettings> {
  try {
    const validatedFolder = await validateConfiguredGoogleDriveFolder(folder)
    return saveValidGoogleDriveFolder(settings, validatedFolder)
  } catch (error) {
    if (error instanceof AuthError && error.code === AuthErrorCode.CancelledByUser) {
      throw error
    }

    return saveGoogleDriveFolderFailure(settings, error)
  }
}

async function validateConfiguredGoogleDriveFolder(
  folder?: GoogleDriveWorldState | null
): Promise<GoogleDriveWorldState> {
  if (!folder?.worldFileIds) {
    return ensureGoogleDriveFolder(folder?.folderId)
  }

  const world = await validateSharedGoogleDriveWorld({
    folderId: folder.folderId,
    ...folder.worldFileIds
  })

  return {
    ...folder,
    ownerAccountId: world.ownerAccountId,
    validatedAt: new Date().toISOString()
  }
}

async function saveValidGoogleDriveFolder(
  settings: CloudStorageSettings,
  folder: GoogleDriveWorldState
): Promise<CloudStorageSettings> {
  const savedSettings = await writeAndReturnCloudStorageSettings({
    ...settings,
    googleDrive: {
      status: GoogleDriveSetupStatus.Valid,
      folder,
      errorMessage: null
    }
  })

  return savedSettings
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
  storageAdapter: StorageAdapter | null
): Promise<CloudStorageProviderDataSummary> {
  if (!storageAdapter) {
    return {
      provider,
      latestSaveVersion: null,
      latestSaveRecordedAt: null,
      hasWorldFile: false
    }
  }

  const [latestSave, hasWorldFile] = await Promise.all([
    storageAdapter.readLatestSave(),
    storageAdapter.worldFileExists()
  ])

  return {
    provider,
    latestSaveVersion: latestSave?.saveVersion ?? null,
    latestSaveRecordedAt: latestSave?.uploadedAt ?? null,
    hasWorldFile
  }
}

function assertServerIsNotActive(): void {
  const runtimeSnapshot = getServerRuntimeSnapshot()

  if (runtimeSnapshot.runningWorldId) {
    throw new StorageError('Cannot change storage settings while the Minecraft server is active.')
  }
}

function runStorageSettingsChange<Result>(executeOperation: () => Promise<Result>): Promise<Result> {
  return runExclusiveStorageOperation(
    ExclusiveStorageOperation.StorageSettingsChange,
    (activeOperation) =>
      new StorageError(
        `Cannot change storage settings while ${getStorageOperationLabel(activeOperation)} is in progress.`
      ),
    executeOperation
  )
}

function getStorageOperationLabel(operation: ExclusiveStorageOperation): string {
  switch (operation) {
    case ExclusiveStorageOperation.ServerDelete:
      return 'server removal'
    case ExclusiveStorageOperation.ServerDownload:
      return 'a server download'
    case ExclusiveStorageOperation.ServerSetup:
      return 'server setup'
    case ExclusiveStorageOperation.ServerStart:
      return 'Minecraft startup'
    case ExclusiveStorageOperation.StorageSettingsChange:
      return 'another storage settings update'
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
  const appState = await readAppState()

  for (const world of appState.worlds) {
    if (!worldHasStorageProviderConfiguration(appState, world, provider)) {
      continue
    }

    const storageAdapter = await getStorageAdapterForProvider(provider, createWorldContext(world))
    const serverLock = await storageAdapter.readServerLock()

    if (serverLock.status === ServerLockStatus.Locked) {
      throw new StorageError(
        `Cannot switch storage while ${serverLock.lockedBy.displayName} is hosting this server.`
      )
    }
  }
}

async function validateAndPrepareTargetProvider(
  settings: CloudStorageSettings,
  provider: CloudStorageProvider
): Promise<CloudStorageSettings> {
  if (provider === CloudStorageProvider.Local) {
    const appState = await readAppState()
    const selectedWorld = appState.worlds.find(({ id }) => id === appState.selectedWorldId)

    if (selectedWorld) {
      await ensureLocalStorage(createWorldContext(selectedWorld))
    }

    return settings
  }

  if (settings.googleDrive.status !== GoogleDriveSetupStatus.Valid) {
    throw new StorageError(settings.googleDrive.errorMessage ?? GOOGLE_DRIVE_NOT_READY_ERROR_MESSAGE)
  }

  return settings
}

async function getConfiguredWorldAdapter(
  appState: AppState,
  world: LocalWorldState | null,
  provider: CloudStorageProvider
): Promise<StorageAdapter | null> {
  if (!world || !worldHasStorageProviderConfiguration(appState, world, provider)) {
    return null
  }

  return getStorageAdapterForProvider(provider, createWorldContext(world))
}

async function prepareProviderCopyTarget(provider: CloudStorageProvider): Promise<CloudStorageSettings> {
  const appState = await readAppState()
  const selectedWorld = appState.worlds.find(({ id }) => id === appState.selectedWorldId)

  if (!selectedWorld) {
    throw new StorageError('Select a world before copying provider data.')
  }

  await getOrCreateStorageContext(provider, createWorldContext(selectedWorld))

  return readCloudStorageSettings()
}

async function reconcileWorldCatalogSelection(): Promise<void> {
  const appState = await readAppState()
  const catalog = await inspectWorldCatalog(appState)
  const visibleWorldIds = catalog.filter(isWorldCatalogEntryVisible).map(({ world }) => world.id)

  await reconcileSelectedWorld(visibleWorldIds)
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
    error.code === AuthErrorCode.CancelledByUser ||
    error.code === AuthErrorCode.ExpiredSession ||
    error.code === AuthErrorCode.InvalidCallback ||
    error.code === AuthErrorCode.InvalidStoredSession ||
    error.code === AuthErrorCode.MissingRefreshToken ||
    error.code === AuthErrorCode.TimedOut
  )
}
