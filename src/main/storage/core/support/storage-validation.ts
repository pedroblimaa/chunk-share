import { ServerHostingStatus, ServerLockStatus } from '../../../../shared/domain'
import {
  CloudStorageProvider,
  StorageSwitchDataMode,
  GoogleDriveSetupStatus,
  type CloudStorageProviderDataSummary,
  type CloudStorageProviderSwitchRequest,
  type CloudStorageProviderSwitchPreview,
  type CloudStorageSettings,
  type GoogleDriveSetupState,
  type GoogleDriveStorageState,
  type GoogleDriveWorldState
} from '../../../../shared/cloud-storage.model'
import type {
  JavaConfig,
  LatestSave,
  LocalState,
  Player,
  ServerConnectionAddress,
  ServerConfig,
  ServerLock,
  ServerSetupState,
  ServerType
} from '../../../../shared/domain'
import { isWorldId, type AppState, type LocalWorldState } from '../../../../shared/world'
import type {
  RecoverableStorageControl,
  StorageControl,
  StorageMutationLock
} from '../../adapters/storage-adapter.model'

type StorageRecord = Record<string, unknown>

const SERVER_TYPES: ServerType[] = ['vanilla', 'paper', 'fabric', 'forge']

function isRecord(value: unknown): value is StorageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNullableErrorMessage(value: unknown): value is string | null {
  return value === null || (isString(value) && value.length > 0)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function isServerType(value: unknown): value is ServerType {
  return isString(value) && SERVER_TYPES.includes(value as ServerType)
}

export function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.id) &&
    isString(value.displayName) &&
    isString(value.email) &&
    (value.avatarUrl === undefined || isNullableString(value.avatarUrl)) &&
    isString(value.avatarInitials)
  )
}

function isServerConnectionAddress(value: unknown): value is ServerConnectionAddress {
  if (!isRecord(value)) {
    return false
  }

  return isString(value.label) && isString(value.address) && typeof value.isPrimary === 'boolean'
}

function isServerHostingStatus(value: unknown): value is ServerHostingStatus {
  return (
    value === ServerHostingStatus.Starting ||
    value === ServerHostingStatus.Running ||
    value === ServerHostingStatus.Stopping
  )
}

export function isCloudStorageProvider(value: unknown): value is CloudStorageProvider {
  return value === CloudStorageProvider.Local || value === CloudStorageProvider.GoogleDrive
}

function isCloudStorageProviderDataSummary(value: unknown): value is CloudStorageProviderDataSummary {
  if (!isRecord(value)) {
    return false
  }

  return (
    isCloudStorageProvider(value.provider) &&
    isNullablePositiveInteger(value.latestSaveVersion) &&
    isNullableString(value.latestSaveRecordedAt) &&
    typeof value.hasWorldFile === 'boolean'
  )
}

function isCloudStorageProviderSwitchPreview(value: unknown): value is CloudStorageProviderSwitchPreview {
  return (
    isRecord(value) &&
    isCloudStorageProviderDataSummary(value.source) &&
    isCloudStorageProviderDataSummary(value.target)
  )
}

function isGoogleDriveSetupStatus(value: unknown): value is GoogleDriveSetupStatus {
  return (
    value === GoogleDriveSetupStatus.NotConfigured ||
    value === GoogleDriveSetupStatus.NeedsAuth ||
    value === GoogleDriveSetupStatus.Valid ||
    value === GoogleDriveSetupStatus.Blocked
  )
}

function isGoogleDriveWorldFileIds(value: unknown): boolean {
  return isRecord(value) && isString(value.controlFileId) && isString(value.worldFileId)
}

export function isGoogleDriveWorldState(value: unknown): value is GoogleDriveWorldState {
  return (
    isRecord(value) &&
    isString(value.folderId) &&
    (value.worldFileIds === null || isGoogleDriveWorldFileIds(value.worldFileIds)) &&
    isNullableString(value.ownerAccountId) &&
    isString(value.configuredAt) &&
    isNullableString(value.validatedAt)
  )
}

export function isGoogleDriveStorageState(value: unknown): value is GoogleDriveStorageState {
  if (!isRecord(value) || !('folder' in value) || !isGoogleDriveSetupState(value)) {
    return false
  }

  if (value.status === GoogleDriveSetupStatus.NotConfigured) {
    return value.folder === null
  }

  return value.folder === null || isGoogleDriveWorldState(value.folder)
}

export function isGoogleDriveSetupState(value: unknown): value is GoogleDriveSetupState {
  if (!isRecord(value) || !isGoogleDriveSetupStatus(value.status)) {
    return false
  }

  if (value.status === GoogleDriveSetupStatus.NotConfigured) {
    return value.errorMessage === null
  }

  return isNullableErrorMessage(value.errorMessage)
}

export function hasValidGoogleDriveFolder(
  value: GoogleDriveStorageState
): value is GoogleDriveStorageState & {
  status: GoogleDriveSetupStatus.Valid
  folder: GoogleDriveWorldState
} {
  return value.status === GoogleDriveSetupStatus.Valid && value.folder !== null
}

export function isServerConfig(value: unknown): value is ServerConfig {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.name) &&
    isServerType(value.serverType) &&
    isString(value.minecraftVersion) &&
    isPositiveInteger(value.port)
  )
}

export function isJavaConfig(value: unknown): value is JavaConfig {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.mode === 'system' || value.mode === 'custom') &&
    isNullableString(value.executablePath) &&
    isNullableString(value.detectedVersion) &&
    typeof value.isValidated === 'boolean'
  )
}

export function isLatestSave(value: unknown): value is LatestSave {
  if (value === null) {
    return true
  }

  return (
    isRecord(value) &&
    isPositiveInteger(value.saveVersion) &&
    isString(value.uploadedAt) &&
    isPlayer(value.uploadedBy) &&
    isOptionalString(value.serverName) &&
    isString(value.minecraftVersion) &&
    isServerType(value.serverType)
  )
}

export function isServerLock(value: unknown): value is ServerLock {
  if (!isRecord(value)) {
    return false
  }

  if (value.status === ServerLockStatus.Unlocked) {
    return Object.keys(value).length === 1
  }

  return (
    value.status === ServerLockStatus.Locked &&
    isPlayer(value.lockedBy) &&
    isString(value.sessionId) &&
    isNonNegativeInteger(value.saveVersion) &&
    isServerHostingStatus(value.hostingStatus) &&
    isString(value.startedAt) &&
    isString(value.lastHeartbeat) &&
    Array.isArray(value.connectionAddresses) &&
    value.connectionAddresses.every(isServerConnectionAddress)
  )
}

function isStorageMutationLock(value: unknown): value is StorageMutationLock {
  return isRecord(value) && isString(value.operationId) && isString(value.startedAt)
}

export function isStorageControl(value: unknown): value is StorageControl {
  return isRecoverableStorageControl(value) && isServerLock(value.serverLock)
}

export function isRecoverableStorageControl(value: unknown): value is RecoverableStorageControl {
  return (
    isRecord(value) &&
    value.formatVersion === 1 &&
    isWorldId(value.worldId) &&
    isLatestSave(value.latestSave) &&
    (value.storageMutation === null || isStorageMutationLock(value.storageMutation))
  )
}

export function isServerSetupState(value: unknown): value is ServerSetupState {
  if (!isRecord(value)) {
    return false
  }

  if (value.status === 'not-configured' || value.status === 'downloading') {
    return value.errorMessage === null && value.completedAt === null
  }

  if (value.status === 'ready') {
    return value.errorMessage === null && isString(value.completedAt)
  }

  return value.status === 'error' && isString(value.errorMessage) && value.completedAt === null
}

function hasLocalStateBaseFields(value: StorageRecord): boolean {
  return (
    (value.player === null || isPlayer(value.player)) &&
    isServerConfig(value.serverConfig) &&
    isJavaConfig(value.javaConfig) &&
    isNullablePositiveInteger(value.localSaveVersion) &&
    isNullableString(value.activeSessionId) &&
    typeof value.dirty === 'boolean'
  )
}

export function isLocalState(value: unknown): value is LocalState {
  return isRecord(value) && hasLocalStateBaseFields(value) && isServerSetupState(value.serverSetup)
}

export function isLocalWorldState(value: unknown): value is LocalWorldState {
  return (
    isRecord(value) &&
    isWorldId(value.id) &&
    isString(value.createdAt) &&
    isServerConfig(value.serverConfig) &&
    isJavaConfig(value.javaConfig) &&
    isServerSetupState(value.serverSetup) &&
    isNullablePositiveInteger(value.localSaveVersion) &&
    isNullableString(value.activeSessionId) &&
    typeof value.dirty === 'boolean' &&
    (value.googleDrive === null || isGoogleDriveWorldState(value.googleDrive))
  )
}

export function isAppState(value: unknown): value is AppState {
  if (
    !isRecord(value) ||
    (value.player !== null && !isPlayer(value.player)) ||
    (value.selectedWorldId !== null && !isWorldId(value.selectedWorldId)) ||
    !isCloudStorageProvider(value.activeProvider) ||
    !isGoogleDriveSetupState(value.googleDrive) ||
    !Array.isArray(value.worlds) ||
    !value.worlds.every(isLocalWorldState)
  ) {
    return false
  }

  const worldIds = value.worlds.map((world) => world.id)

  return (
    new Set(worldIds).size === worldIds.length &&
    (value.selectedWorldId === null || worldIds.includes(value.selectedWorldId))
  )
}

export function isCloudStorageSettings(value: unknown): value is CloudStorageSettings {
  if (!isRecord(value)) {
    return false
  }

  return isCloudStorageProvider(value.activeProvider) && isGoogleDriveStorageState(value.googleDrive)
}

export function isValidProviderSwitchRequest(value: unknown): value is CloudStorageProviderSwitchRequest {
  if (!isRecord(value) || !isCloudStorageProvider(value.provider)) {
    return false
  }

  if (value.dataMode === StorageSwitchDataMode.UseTargetAsIs) {
    return true
  }

  if (value.dataMode === StorageSwitchDataMode.CopyCurrentToTarget) {
    return isCloudStorageProviderSwitchPreview(value.expectedPreview)
  }

  return false
}
