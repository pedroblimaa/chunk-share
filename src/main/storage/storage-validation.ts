import type {
  JavaConfig,
  LatestSave,
  LocalState,
  Player,
  ServerConfig,
  ServerLock,
  ServerSetupState,
  ServerType
} from '../../shared/domain'

type StorageRecord = Record<string, unknown>

const SERVER_TYPES: ServerType[] = ['vanilla', 'paper', 'fabric', 'forge']

function isRecord(value: unknown): value is StorageRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function isServerType(value: unknown): value is ServerType {
  return isString(value) && SERVER_TYPES.includes(value as ServerType)
}

function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.id) &&
    isString(value.displayName) &&
    isString(value.email) &&
    isString(value.avatarInitials)
  )
}

export function isServerConfig(value: unknown): value is ServerConfig {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.name) &&
    isServerType(value.serverType) &&
    isString(value.minecraftVersion) &&
    isNullableString(value.serverFolderPath) &&
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
    isString(value.fileName) &&
    isString(value.uploadedAt) &&
    isPlayer(value.uploadedBy) &&
    isString(value.minecraftVersion) &&
    isServerType(value.serverType)
  )
}

export function isServerLock(value: unknown): value is ServerLock {
  if (!isRecord(value)) {
    return false
  }

  if (value.status === 'unlocked') {
    return Object.keys(value).length === 1
  }

  return (
    value.status === 'locked' &&
    isPlayer(value.lockedBy) &&
    isString(value.sessionId) &&
    isPositiveInteger(value.saveVersion) &&
    isString(value.startedAt) &&
    isString(value.lastHeartbeat)
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
