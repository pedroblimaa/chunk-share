import { randomUUID } from 'crypto'
import {
  ServerLockStatus,
  type Player,
  type ServerConnectionAddress,
  type StorageSnapshot
} from '../../shared/domain'
import { readServerLock, writeServerLock } from '../storage/local-mock-cloud-storage'
import { saveActiveSessionId } from '../storage/local-state-store'
import { getSignedInMockUser } from '../mock-dashboard'
import { ServerRuntimeError } from './server-runtime-error'

let activeRuntimeSessionId: string | null = null
const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 1000

export function getActiveRuntimeSessionId(): string | null {
  return activeRuntimeSessionId
}

export async function createHostingLock(
  storageSnapshot: StorageSnapshot,
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

function getHostingPlayer(storageSnapshot: StorageSnapshot): Player {
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
