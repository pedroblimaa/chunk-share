import { stat } from 'fs/promises'
import { join } from 'path'
import {
  ServerLockStatus,
  type LatestSave,
  type LocalState,
  type ServerLock,
  type StorageSnapshot
} from '../../shared/domain'
import { ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'
import { readLatestSave, readServerLock } from '../storage/local-mock-cloud-storage'
import { readLocalState } from '../storage/local-state-store'
import { mockCloudVersionsFolderPath } from '../storage/storage-paths'
import { getSignedInMockUser } from '../mock-dashboard'

const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 1000

interface ServerSyncContext {
  latestSave: LatestSave
  serverLock: ServerLock
  localState: LocalState
}

interface ServerSyncRuleContext extends ServerSyncContext {
  lockState: LockState
  localSaveVersion: number
}

interface ServerSyncDecision {
  status: ServerSyncStatus
  isStaleLock: boolean
  isStartAllowed: boolean
}

type ServerSyncRule = (context: ServerSyncRuleContext) => Promise<ServerSyncDecision | null>

interface LockState {
  blocksCurrentUser: boolean
  isStale: boolean
}

const SERVER_SYNC_RULES: ServerSyncRule[] = [
  lockedByOtherRule,
  staleLockRule,
  noCloudSaveRule,
  incompatibleRule,
  missingCloudFileRule,
  updateAvailableRule,
  localNewerRule
]

export async function getServerSyncSnapshot(): Promise<StorageSnapshot> {
  const [latestSave, serverLock, localState] = await Promise.all([
    readLatestSave(),
    readServerLock(),
    readLocalState()
  ])

  return {
    latestSave,
    serverLock,
    serverSync: await buildServerSyncSnapshot({ latestSave, serverLock, localState }),
    localState
  }
}

async function buildServerSyncSnapshot(context: ServerSyncContext): Promise<ServerSyncSnapshot> {
  return createSyncSnapshot({
    ...context,
    ...(await getSyncDecision(context))
  })
}

async function getSyncDecision(context: ServerSyncContext): Promise<ServerSyncDecision> {
  const ruleContext: ServerSyncRuleContext = {
    ...context,
    lockState: getLockState(context.serverLock),
    localSaveVersion: context.localState.localSaveVersion ?? 0
  }

  for (const rule of SERVER_SYNC_RULES) {
    const decision = await rule(ruleContext)

    if (decision) {
      return decision
    }
  }

  return createDecision(ServerSyncStatus.Ready, true)
}

async function lockedByOtherRule({
  lockState
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return lockState.blocksCurrentUser ? createDecision(ServerSyncStatus.LockedByOther, false) : null
}

async function staleLockRule({
  lockState
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return lockState.isStale
    ? createDecision(ServerSyncStatus.StaleLock, true, { isStaleLock: true })
    : null
}

async function noCloudSaveRule({
  latestSave
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return latestSave ? null : createDecision(ServerSyncStatus.NoCloudSave, true)
}

async function incompatibleRule({
  latestSave,
  localState
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || isCompatibleWithLocalConfig(latestSave, localState)) {
    return null
  }

  return createDecision(ServerSyncStatus.Incompatible, false)
}

async function missingCloudFileRule({
  latestSave
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || (await cloudSaveFileExists(latestSave))) {
    return null
  }

  return createDecision(ServerSyncStatus.MissingCloudFile, false)
}

async function updateAvailableRule({
  latestSave,
  localSaveVersion,
  localState
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || latestSave.saveVersion <= localSaveVersion) {
    return null
  }

  return createDecision(ServerSyncStatus.UpdateAvailable, !localState.dirty)
}

async function localNewerRule({
  latestSave,
  localSaveVersion
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || localSaveVersion <= latestSave.saveVersion) {
    return null
  }

  return createDecision(ServerSyncStatus.LocalNewer, false)
}

function createDecision(
  status: ServerSyncStatus,
  isStartAllowed: boolean,
  options: Partial<Pick<ServerSyncDecision, 'isStaleLock'>> = {}
): ServerSyncDecision {
  return {
    status,
    isStaleLock: false,
    isStartAllowed,
    ...options
  }
}

function createSyncSnapshot(input: ServerSyncContext & ServerSyncDecision): ServerSyncSnapshot {
  return {
    status: input.status,
    latestSave: input.latestSave,
    serverLock: input.serverLock,
    localSaveVersion: input.localState.localSaveVersion,
    cloudSaveVersion: input.latestSave?.saveVersion ?? null,
    lockedBy:
      input.serverLock.status === ServerLockStatus.Locked ? input.serverLock.lockedBy : null,
    isStaleLock: input.isStaleLock,
    isStartAllowed: input.isStartAllowed
  }
}

function getLockState(serverLock: ServerLock): LockState {
  if (serverLock.status === ServerLockStatus.Unlocked) {
    return { blocksCurrentUser: false, isStale: false }
  }

  const isCurrentUserLock = serverLock.lockedBy.id === getSignedInMockUser()?.id
  const heartbeatAgeMs = Date.now() - new Date(serverLock.lastHeartbeat).getTime()
  const isStale = !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > STALE_LOCK_THRESHOLD_MS

  return {
    blocksCurrentUser: !isCurrentUserLock && !isStale,
    isStale
  }
}

function isCompatibleWithLocalConfig(
  latestSave: NonNullable<LatestSave>,
  localState: LocalState
): boolean {
  return (
    latestSave.minecraftVersion === localState.serverConfig.minecraftVersion &&
    latestSave.serverType === localState.serverConfig.serverType
  )
}

async function cloudSaveFileExists(latestSave: NonNullable<LatestSave>): Promise<boolean> {
  try {
    const fileStats = await stat(join(mockCloudVersionsFolderPath, latestSave.fileName))

    return fileStats.isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
