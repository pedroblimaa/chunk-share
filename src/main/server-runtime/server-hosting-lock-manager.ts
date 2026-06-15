import { randomUUID } from 'crypto'
import { ServerLockStatus, type Player, type StorageSnapshot } from '../../shared/domain'
import { writeServerLock } from '../storage/local-mock-cloud-storage'
import { saveActiveSessionId } from '../storage/local-state-store'
import { getSignedInMockUser } from '../mock-dashboard'

let activeRuntimeSessionId: string | null = null

export async function createHostingLock(storageSnapshot: StorageSnapshot): Promise<string> {
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
      lastHeartbeat: now
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

export async function clearHostingLockAfterStartFailure(): Promise<void> {
  if (!activeRuntimeSessionId) {
    return
  }

  await writeServerLock({ status: ServerLockStatus.Unlocked })
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
