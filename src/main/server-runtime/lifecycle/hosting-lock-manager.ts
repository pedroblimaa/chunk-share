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
import { getActiveStorageAdapter } from '../../storage/adapters/storage-adapter-service'
import type { StorageAdapter } from '../../storage/adapters/storage-adapter.model'
import { saveActiveSessionId } from '../../storage/persistence/local-state-store'
import { ServerRuntimeError } from '../support/runtime-error'

let activeRuntimeSessionId: string | null = null

export function getActiveRuntimeSessionId(): string | null {
  return activeRuntimeSessionId
}

export async function createHostingLock(
  storageSnapshot: ServerStorageSnapshot,
  connectionAddresses: ServerConnectionAddress[]
): Promise<string> {
  const sessionId = randomUUID()
  const now = new Date().toISOString()
  const saveVersion =
    storageSnapshot.latestSave?.saveVersion ?? storageSnapshot.localState.localSaveVersion ?? 0
  const storageAdapter = await getActiveStorageAdapter()
  const hostingPlayer = getHostingPlayer(storageSnapshot)

  await storageAdapter.assertNoStorageMutationInProgress()

  try {
    await storageAdapter.updateServerLock((serverLock) => {
      assertHostingLockCanBeAcquired(serverLock)

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
    await saveActiveSessionId(sessionId)
  } catch (error) {
    await clearHostingLockForSession(storageAdapter, sessionId).catch(() => undefined)

    throw error
  }

  activeRuntimeSessionId = sessionId

  return sessionId
}

export async function markHostingLockRunning(sessionId: string): Promise<void> {
  await updateHostingLockStatus(sessionId, ServerHostingStatus.Running, [ServerHostingStatus.Starting])
}

export async function markHostingLockStopping(sessionId: string): Promise<void> {
  await updateHostingLockStatus(sessionId, ServerHostingStatus.Stopping, [
    ServerHostingStatus.Starting,
    ServerHostingStatus.Running
  ])
}

export async function updateHostingLockSaveVersion(sessionId: string, saveVersion: number): Promise<void> {
  const storageAdapter = await getActiveStorageAdapter()

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
  sessionId: string,
  hostingStatus: ServerHostingStatus,
  allowedCurrentStatuses: ServerHostingStatus[]
): Promise<void> {
  const storageAdapter = await getActiveStorageAdapter()

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

function assertHostingLockCanBeAcquired(serverLock: ServerLock): void {
  if (serverLock.status === ServerLockStatus.Unlocked) {
    return
  }

  const lockIsCurrentRuntimeSession = serverLock.sessionId === activeRuntimeSessionId
  const lockIsStale = isStaleLock(serverLock.lastHeartbeat)

  if (lockIsCurrentRuntimeSession || lockIsStale) {
    return
  }

  throw new ServerRuntimeError(
    `Cannot start server because ${serverLock.lockedBy.displayName} is already hosting it.`
  )
}

export async function clearHostingLockAfterStartFailure(): Promise<void> {
  if (!activeRuntimeSessionId) {
    return
  }

  const storageAdapter = await getActiveStorageAdapter()

  await clearHostingLockForSession(storageAdapter, activeRuntimeSessionId)
  await saveActiveSessionId(null)

  activeRuntimeSessionId = null
}

export async function clearHostingLockAfterCleanStop(): Promise<void> {
  if (!activeRuntimeSessionId) {
    throw new ServerRuntimeError('Cannot unlock server because this runtime has no active session.')
  }

  const storageAdapter = await getActiveStorageAdapter()
  await clearHostingLockForSession(storageAdapter, activeRuntimeSessionId)

  await saveActiveSessionId(null)
  activeRuntimeSessionId = null
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
