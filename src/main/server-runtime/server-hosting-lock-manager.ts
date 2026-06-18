import { randomUUID } from 'crypto'
import {
  ServerHostingStatus,
  ServerLockStatus,
  type Player,
  type ServerConnectionAddress,
  type ServerStorageSnapshot
} from '../../shared/domain'
import { STALE_LOCK_THRESHOLD_MS } from '../../shared/server-sync'
import { readServerLock, writeServerLock } from '../storage/local-mock-cloud-storage'
import { saveActiveSessionId } from '../storage/local-state-store'
import { getSignedInMockUser } from '../mock-dashboard'
import { ServerRuntimeError } from './server-runtime-error'

let activeRuntimeSessionId: string | null = null

export function getActiveRuntimeSessionId(): string | null {
  return activeRuntimeSessionId
}

export async function createHostingLock(
  storageSnapshot: ServerStorageSnapshot,
  connectionAddresses: ServerConnectionAddress[]
): Promise<string> {
  await assertHostingLockCanBeAcquired()

  const sessionId = randomUUID()
  const now = new Date().toISOString()
  const saveVersion =
    storageSnapshot.latestSave?.saveVersion ?? storageSnapshot.localState.localSaveVersion ?? 0

  try {
    await writeServerLock({
      status: ServerLockStatus.Locked,
      lockedBy: getHostingPlayer(storageSnapshot),
      sessionId,
      saveVersion,
      hostingStatus: ServerHostingStatus.Starting,
      startedAt: now,
      lastHeartbeat: now,
      connectionAddresses
    })
    await saveActiveSessionId(sessionId)
  } catch (error) {
    await writeServerLock({
      status: ServerLockStatus.Unlocked
    }).catch(() => undefined)

    throw error
  }

  activeRuntimeSessionId = sessionId

  return sessionId
}

export async function markHostingLockRunning(sessionId: string): Promise<void> {
  await updateHostingLockStatus(sessionId, ServerHostingStatus.Running, [
    ServerHostingStatus.Starting
  ])
}

export async function markHostingLockStopping(sessionId: string): Promise<void> {
  await updateHostingLockStatus(sessionId, ServerHostingStatus.Stopping, [
    ServerHostingStatus.Starting,
    ServerHostingStatus.Running
  ])
}

async function updateHostingLockStatus(
  sessionId: string,
  hostingStatus: ServerHostingStatus,
  allowedCurrentStatuses: ServerHostingStatus[]
): Promise<void> {
  const serverLock = await readServerLock()

  if (serverLock.status !== ServerLockStatus.Locked || serverLock.sessionId !== sessionId) {
    throw new ServerRuntimeError('Cannot update hosting status because the hosting lock changed.')
  }

  if (!allowedCurrentStatuses.includes(serverLock.hostingStatus)) {
    throw new ServerRuntimeError(
      `Cannot update hosting status from ${serverLock.hostingStatus} to ${hostingStatus}.`
    )
  }

  await writeServerLock({
    ...serverLock,
    hostingStatus,
    lastHeartbeat: new Date().toISOString()
  })
}

async function assertHostingLockCanBeAcquired(): Promise<void> {
  const serverLock = await readServerLock()

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

  await writeServerLock({ status: ServerLockStatus.Unlocked })
  await saveActiveSessionId(null)

  activeRuntimeSessionId = null
}

export async function clearHostingLockAfterCleanStop(): Promise<void> {
  if (!activeRuntimeSessionId) {
    throw new ServerRuntimeError('Cannot unlock server because this runtime has no active session.')
  }

  const serverLock = await readServerLock()

  if (serverLock.status === ServerLockStatus.Locked) {
    if (serverLock.sessionId !== activeRuntimeSessionId) {
      throw new ServerRuntimeError(
        'Cannot unlock server because the hosting lock belongs to another session.'
      )
    }

    await writeServerLock({ status: ServerLockStatus.Unlocked })
  }

  await saveActiveSessionId(null)
  activeRuntimeSessionId = null
}

function getHostingPlayer(storageSnapshot: ServerStorageSnapshot): Player {
  if (storageSnapshot.localState.player) {
    return storageSnapshot.localState.player
  }

  const signedInUser = getSignedInMockUser()
  if (signedInUser) {
    return {
      id: signedInUser.id,
      displayName: signedInUser.name,
      email: signedInUser.email,
      avatarInitials: signedInUser.avatarInitials
    }
  }

  return {
    id: 'local-host',
    displayName: 'Local Host',
    email: 'local@chunkshare.local',
    avatarInitials: 'LH'
  }
}

function isStaleLock(lastHeartbeat: string): boolean {
  const heartbeatAgeMs = Date.now() - new Date(lastHeartbeat).getTime()

  return !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > STALE_LOCK_THRESHOLD_MS
}
