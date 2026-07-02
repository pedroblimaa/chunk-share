import {
  ServerLockStatus,
  type LatestSave,
  type LocalState,
  type ServerLock,
  type ServerStorageSnapshot
} from '../../shared/domain'
import {
  STALE_LOCK_THRESHOLD_MS,
  ServerSyncStatus,
  type ServerSyncSnapshot
} from '../../shared/server-sync'
import { getActiveStorageAdapter } from '../storage/adapters/storage-adapter-service'
import type { StorageAdapter } from '../storage/adapters/storage-adapter.model'
import { readLocalState } from '../storage/persistence/local-state-store'
import { getActiveRuntimeSessionId } from '../server-runtime/server-hosting-lock-manager'

interface ServerSyncContext {
  latestSave: LatestSave
  serverLock: ServerLock
  localState: LocalState
  storageAdapter: StorageAdapter
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

export async function getServerSyncSnapshot(): Promise<ServerStorageSnapshot> {
  const storageAdapter = await getActiveStorageAdapter()
  const [latestSave, serverLock, localState] = await Promise.all([
    storageAdapter.readLatestSave(),
    storageAdapter.readServerLock(),
    readLocalState()
  ])

  return {
    latestSave,
    serverLock,
    serverSync: await buildServerSyncSnapshot({
      latestSave,
      serverLock,
      localState,
      storageAdapter
    }),
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
  latestSave,
  storageAdapter
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || (await storageAdapter.serverSaveVersionExists(latestSave.fileName))) {
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

  return createDecision(ServerSyncStatus.LocalNewer, true)
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

  const isCurrentRuntimeLock = serverLock.sessionId === getActiveRuntimeSessionId()
  const heartbeatAgeMs = Date.now() - new Date(serverLock.lastHeartbeat).getTime()
  const isStale = !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > STALE_LOCK_THRESHOLD_MS

  return {
    blocksCurrentUser: !isCurrentRuntimeLock && !isStale,
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
