import { randomUUID } from 'crypto'
import {
  ServerHostingStatus,
  ServerLockStatus,
  type Player,
  type ServerConnectionAddress,
  type ServerLock,
  type ServerStorageSnapshot
} from '../../../shared/domain'
import { STALE_LOCK_THRESHOLD_MS } from '../../../shared/server-sync'
import type { StorageAdapter } from '../../storage/adapters/storage-adapter.model'
import type { WorldId } from '../../../shared/world'
import type { WorldOperationContext } from '../../storage/core/world-operation-context'
import { saveWorldActiveSessionId } from '../../storage/persistence/local-state-store'
import { ServerRuntimeError } from '../support/runtime-error'

interface ActiveRuntimeSession {
  worldId: WorldId
  sessionId: string
}

let activeRuntimeSession: ActiveRuntimeSession | null = null

export function getActiveRuntimeSessionId(worldId: WorldId | null): string | null {
  return activeRuntimeSession?.worldId === worldId ? activeRuntimeSession.sessionId : null
}

export async function createHostingLock(
  operationContext: WorldOperationContext,
  storageSnapshot: ServerStorageSnapshot,
  connectionAddresses: ServerConnectionAddress[]
): Promise<string> {
  const sessionId = randomUUID()
  const now = new Date().toISOString()
  const saveVersion =
    storageSnapshot.latestSave?.saveVersion ?? storageSnapshot.localState.localSaveVersion ?? 0
  const { storageAdapter, worldId } = operationContext
  const hostingPlayer = getHostingPlayer(storageSnapshot)

  await storageAdapter.assertNoStorageMutationInProgress()

  try {
    await storageAdapter.updateServerLock((serverLock) => {
      assertHostingLockCanBeAcquired(serverLock, worldId, storageSnapshot.localState.activeSessionId)

      return {
        status: ServerLockStatus.Locked,
        lockedBy: hostingPlayer,
        sessionId,
        saveVersion,
        hostingStatus: ServerHostingStatus.Starting,
        startedAt: now,
        lastHeartbeat: now,
        connectionAddresses
      }
    })
    await saveWorldActiveSessionId(worldId, sessionId)
  } catch (error) {
    await clearHostingLockForSession(storageAdapter, sessionId).catch(() => undefined)

    throw error
  }

  activeRuntimeSession = { worldId, sessionId }

  return sessionId
}

export async function markHostingLockRunning(
  operationContext: WorldOperationContext,
  sessionId: string
): Promise<void> {
  await updateHostingLockStatus(operationContext, sessionId, ServerHostingStatus.Running, [
    ServerHostingStatus.Starting
  ])
}

export async function markHostingLockStopping(
  operationContext: WorldOperationContext,
  sessionId: string
): Promise<void> {
  await updateHostingLockStatus(operationContext, sessionId, ServerHostingStatus.Stopping, [
    ServerHostingStatus.Starting,
    ServerHostingStatus.Running
  ])
}

export async function updateHostingLockSaveVersion(
  operationContext: WorldOperationContext,
  sessionId: string,
  saveVersion: number
): Promise<void> {
  const { storageAdapter } = operationContext

  await storageAdapter.updateServerLock((serverLock) => {
    if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
      throw new ServerRuntimeError('Cannot update hosting save version because the lock changed.')
    }

    return {
      ...serverLock,
      saveVersion,
      lastHeartbeat: new Date().toISOString()
    }
  })
}

async function updateHostingLockStatus(
  operationContext: WorldOperationContext,
  sessionId: string,
  hostingStatus: ServerHostingStatus,
  allowedCurrentStatuses: ServerHostingStatus[]
): Promise<void> {
  const { storageAdapter } = operationContext

  await storageAdapter.updateServerLock((serverLock) => {
    if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
      throw new ServerRuntimeError('Cannot update hosting status because the hosting lock changed.')
    }

    if (!allowedCurrentStatuses.includes(serverLock.hostingStatus)) {
      throw new ServerRuntimeError(
        `Cannot update hosting status from ${serverLock.hostingStatus} to ${hostingStatus}.`
      )
    }

    return {
      ...serverLock,
      hostingStatus,
      lastHeartbeat: new Date().toISOString()
    }
  })
}

function assertHostingLockCanBeAcquired(
  serverLock: ServerLock,
  worldId: WorldId,
  persistedSessionId: string | null
): void {
  if (serverLock.status === ServerLockStatus.Unlocked) {
    return
  }

  const lockIsCurrentRuntimeSession =
    activeRuntimeSession?.worldId === worldId && serverLock.sessionId === activeRuntimeSession.sessionId
  const lockBelongsToPersistedSession = serverLock.sessionId === persistedSessionId
  const lockIsStale = isStaleLock(serverLock.lastHeartbeat)

  if (lockIsCurrentRuntimeSession || lockBelongsToPersistedSession || lockIsStale) {
    return
  }

  throw new ServerRuntimeError(
    `Cannot start server because ${serverLock.lockedBy.displayName} is already hosting it.`
  )
}

export async function clearHostingLockAfterStartFailure(
  operationContext: WorldOperationContext,
  sessionId: string
): Promise<void> {
  const { storageAdapter, worldId } = operationContext

  await clearHostingLockForSession(storageAdapter, sessionId)
  await saveWorldActiveSessionId(worldId, null)
  releaseActiveRuntimeSession(worldId, sessionId)
}

export async function clearHostingLockAfterCleanStop(
  operationContext: WorldOperationContext,
  sessionId: string
): Promise<void> {
  const { storageAdapter, worldId } = operationContext
  await clearHostingLockForSession(storageAdapter, sessionId)

  await saveWorldActiveSessionId(worldId, null)
  releaseActiveRuntimeSession(worldId, sessionId)
}

export function releaseActiveRuntimeSession(worldId: WorldId, sessionId: string): void {
  if (isActiveRuntimeSession(worldId, sessionId)) {
    activeRuntimeSession = null
  }
}

function isActiveRuntimeSession(worldId: WorldId, sessionId: string): boolean {
  return activeRuntimeSession?.worldId === worldId && activeRuntimeSession.sessionId === sessionId
}

function clearHostingLockForSession(storageAdapter: StorageAdapter, sessionId: string): Promise<boolean> {
  return storageAdapter.updateServerLock((serverLock) => {
    if (serverLock.status === ServerLockStatus.Unlocked) {
      return null
    }

    if (serverLock.sessionId !== sessionId) {
      throw new ServerRuntimeError(
        'Cannot unlock server because the hosting lock belongs to another session.'
      )
    }

    return { status: ServerLockStatus.Unlocked }
  })
}

function getHostingPlayer(storageSnapshot: ServerStorageSnapshot): Player {
  if (storageSnapshot.localState.player) {
    return storageSnapshot.localState.player
  }

  throw new ServerRuntimeError('Cannot start server because no Google user is signed in.')
}

function isStaleLock(lastHeartbeat: string): boolean {
  const heartbeatAgeMs = Date.now() - new Date(lastHeartbeat).getTime()

  return !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > STALE_LOCK_THRESHOLD_MS
}
