import { serverRuntimeStateFilePath } from '../storage/core/storage-paths'
import { readJsonFile, writeJsonFile } from '../storage/persistence/json-file-store'
import type { PersistedServerRuntimePhase, PersistedServerRuntimeSession } from './server-runtime.model'
import { isRecord } from '../shared/main-helpers'

type PersistedServerRuntimeState = PersistedServerRuntimeSession | null
type StoredServerRuntimeState = PersistedServerRuntimeState | LegacyPersistedServerRuntimeSession

interface LegacyPersistedServerRuntimeSession {
  processId: number | null
  reachedReady: boolean
  sessionId: string
  startedAt: string
}

let pendingWrite: Promise<void> = Promise.resolve()

export async function readPersistedServerRuntimeSession(): Promise<PersistedServerRuntimeState> {
  await pendingWrite.catch(() => undefined)

  const storedState = await readJsonFile<StoredServerRuntimeState>(
    serverRuntimeStateFilePath,
    null,
    isStoredServerRuntimeState
  )

  if (!storedState || 'phase' in storedState) {
    return storedState
  }

  const migratedState: PersistedServerRuntimeSession = {
    phase: storedState.reachedReady ? 'ready' : getLegacyPendingPhase(storedState.processId),
    processId: storedState.processId,
    processTag: null,
    sessionId: storedState.sessionId,
    startedAt: storedState.startedAt
  }

  await writePersistedServerRuntimeSession(migratedState)

  return migratedState
}

export function writePersistedServerRuntimeSession(session: PersistedServerRuntimeState): Promise<void> {
  const stateSnapshot = session ? { ...session } : null
  const write = pendingWrite
    .catch(() => undefined)
    .then(() => writeJsonFile(serverRuntimeStateFilePath, stateSnapshot, isPersistedServerRuntimeState))

  pendingWrite = write

  return write
}

function isStoredServerRuntimeState(value: unknown): value is StoredServerRuntimeState {
  if (value === null) {
    return true
  }

  if (!isRecord(value)) {
    return false
  }

  const hasCommonFields =
    (value.processId === null ||
      (typeof value.processId === 'number' && Number.isInteger(value.processId) && value.processId > 0)) &&
    typeof value.sessionId === 'string' &&
    typeof value.startedAt === 'string'

  if (!hasCommonFields) {
    return false
  }

  if ('phase' in value) {
    return (
      isPersistedServerRuntimePhase(value.phase) &&
      (value.processTag === null || typeof value.processTag === 'string')
    )
  }

  return typeof value.reachedReady === 'boolean'
}

function isPersistedServerRuntimeState(value: unknown): value is PersistedServerRuntimeState {
  return (
    value === null || (isStoredServerRuntimeState(value) && 'phase' in value && !('reachedReady' in value))
  )
}

function isPersistedServerRuntimePhase(value: unknown): value is PersistedServerRuntimePhase {
  return (
    value === 'lock-acquired' ||
    value === 'launching' ||
    value === 'process-started' ||
    value === 'ready' ||
    value === 'published'
  )
}

function getLegacyPendingPhase(processId: number | null): PersistedServerRuntimePhase {
  return processId === null ? 'launching' : 'process-started'
}
