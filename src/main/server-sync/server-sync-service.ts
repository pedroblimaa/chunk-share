import {
  ServerLockStatus,
  type LatestSave,
  type LocalState,
  type ServerLock,
  type ServerStorageSnapshot
} from '../../shared/domain'
import { isServerLockStale, ServerSyncStatus, type ServerSyncSnapshot } from '../../shared/server-sync'
import { getStorageAdapterForProvider } from '../storage/adapters/storage-adapter-service'
import { readAppState, readWorldLocalState } from '../storage/persistence/local-state-store'
import { getActiveRuntimeSessionId } from '../server-runtime/lifecycle/hosting-lock-manager'
import {
  DEFAULT_LATEST_SAVE,
  DEFAULT_LOCAL_STATE,
  DEFAULT_SERVER_LOCK
} from '../storage/core/support/storage-defaults'
import type { WorldOperationContext } from '../storage/core/world-operation-context'
import type { WorldId } from '../../shared/world'
import { createWorldContext } from '../storage/core/world-context'
import { StorageError } from '../storage/core/support/storage-error'

interface ServerSyncContext {
  latestSave: LatestSave
  serverLock: ServerLock
  localState: LocalState
  worldFileExists: boolean
  worldId: WorldId | null
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

export async function getServerSyncSnapshot(
  operationContext?: WorldOperationContext
): Promise<ServerStorageSnapshot> {
  if (operationContext) {
    const localState = await readWorldLocalState(operationContext.worldId)
    const storageData = await operationContext.storageAdapter.readServerSyncData()
    const { latestSave, serverLock, worldFileExists } = storageData

    return {
      latestSave,
      serverLock,
      serverSync: await buildServerSyncSnapshot({
        latestSave,
        serverLock,
        localState,
        worldFileExists,
        worldId: operationContext.worldId
      }),
      localState,
      worldFileExists
    }
  }

  const appState = await readAppState()

  if (!appState.selectedWorldId) {
    const localState = { ...DEFAULT_LOCAL_STATE, player: appState.player }

    return {
      latestSave: DEFAULT_LATEST_SAVE,
      serverLock: DEFAULT_SERVER_LOCK,
      serverSync: await buildServerSyncSnapshot({
        latestSave: DEFAULT_LATEST_SAVE,
        serverLock: DEFAULT_SERVER_LOCK,
        localState,
        worldFileExists: false,
        worldId: null
      }),
      localState,
      worldFileExists: false
    }
  }

  const world = appState.worlds.find(({ id }) => id === appState.selectedWorldId)

  if (!world) {
    throw new StorageError(`Selected world ${appState.selectedWorldId} was not found.`)
  }

  const worldContext = createWorldContext(world)
  const capturedContext: WorldOperationContext = {
    ...worldContext,
    storageAdapter: await getStorageAdapterForProvider(appState.activeProvider, worldContext)
  }

  return getServerSyncSnapshot(capturedContext)
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
    lockState: getLockState(context.serverLock, context.worldId, context.localState.activeSessionId),
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

async function lockedByOtherRule({ lockState }: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return lockState.blocksCurrentUser ? createDecision(ServerSyncStatus.LockedByOther, false) : null
}

async function staleLockRule({ lockState }: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return lockState.isStale ? createDecision(ServerSyncStatus.StaleLock, true, { isStaleLock: true }) : null
}

async function noCloudSaveRule({ latestSave }: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  return latestSave ? null : createDecision(ServerSyncStatus.NoCloudSave, true)
}

async function incompatibleRule({
  latestSave,
  localState
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (
    !latestSave ||
    localState.serverSetup.status !== 'ready' ||
    isCompatibleWithLocalConfig(latestSave, localState)
  ) {
    return null
  }

  return createDecision(ServerSyncStatus.Incompatible, false)
}

async function missingCloudFileRule({
  latestSave,
  worldFileExists
}: ServerSyncRuleContext): Promise<ServerSyncDecision | null> {
  if (!latestSave || worldFileExists) {
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
    lockedBy: input.serverLock.status === ServerLockStatus.Locked ? input.serverLock.lockedBy : null,
    isStaleLock: input.isStaleLock,
    isStartAllowed: input.isStartAllowed
  }
}

function getLockState(
  serverLock: ServerLock,
  worldId: WorldId | null,
  persistedSessionId: string | null
): LockState {
  if (serverLock.status === ServerLockStatus.Unlocked) {
    return { blocksCurrentUser: false, isStale: false }
  }

  const isCurrentRuntimeLock = serverLock.sessionId === getActiveRuntimeSessionId(worldId)
  const isPersistedWorldLock = serverLock.sessionId === persistedSessionId
  const isStale = isServerLockStale(serverLock.lastHeartbeat)

  return {
    blocksCurrentUser: !isCurrentRuntimeLock && !isPersistedWorldLock && !isStale,
    isStale
  }
}

function isCompatibleWithLocalConfig(latestSave: NonNullable<LatestSave>, localState: LocalState): boolean {
  return (
    latestSave.minecraftVersion === localState.serverConfig.minecraftVersion &&
    latestSave.serverType === localState.serverConfig.serverType
  )
}
