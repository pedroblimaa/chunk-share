import { randomUUID } from 'crypto'
import type { LatestSave } from '../../../shared/domain'
import type { ServerSaveConflict } from '../../../shared/server-save'
import type { WorldOperationContext } from '../core/world-operation-context'
import { StorageError } from '../core/support/storage-error'
import { readAppState } from '../persistence/local-state-store'
import { getFabricFilesFingerprint, readFabricBaseline } from './fabric-local-files'

interface PendingRestore {
  context: WorldOperationContext
  provider: string
  latestSave: string
  fingerprint: string
}

const pendingRestores = new Map<string, PendingRestore>()

export class FabricSaveConflictError extends StorageError {
  constructor(readonly conflict: ServerSaveConflict) {
    super('Local mods or configuration have changed. Confirm replacement before downloading the shared save.')
  }
}

export async function assertFabricFilesCanBeReplaced(
  context: WorldOperationContext,
  latestSave: NonNullable<LatestSave>,
  confirmedFingerprint?: string
): Promise<string> {
  const fingerprint = await getFabricFilesFingerprint(context.paths.serverFolder)

  if (confirmedFingerprint !== undefined) {
    if (fingerprint !== confirmedFingerprint) {
      throw new StorageError('Local files changed. Download again to review the changes.')
    }

    return fingerprint
  }

  const baseline = await readFabricBaseline(context.paths.fabricBaselineFile)

  if (fingerprint === baseline) {
    return fingerprint
  }

  const token = await registerPendingRestore(context, latestSave, fingerprint)

  throw new FabricSaveConflictError({ token, worldId: context.worldId, saveVersion: latestSave.saveVersion })
}

export async function consumeFabricRestoreConfirmation(token: string): Promise<PendingRestore> {
  const pending = pendingRestores.get(token)
  pendingRestores.delete(token)

  if (!pending) {
    throw new StorageError('This download confirmation expired. Download again.')
  }

  const appState = await readAppState()
  const world = appState.worlds.find(({ id }) => id === pending.context.worldId)
  const hasSameStorageTarget =
    world !== undefined &&
    appState.selectedWorldId === pending.context.worldId &&
    appState.activeProvider === pending.provider &&
    JSON.stringify(world.googleDrive) === JSON.stringify(pending.context.world.googleDrive)

  if (!hasSameStorageTarget) {
    throw new StorageError('The selected world or storage provider changed. Download again.')
  }

  return pending
}

async function registerPendingRestore(
  context: WorldOperationContext,
  latestSave: NonNullable<LatestSave>,
  fingerprint: string
): Promise<string> {
  const { activeProvider } = await readAppState()

  for (const [token, pending] of pendingRestores) {
    if (pending.context.worldId === context.worldId) {
      pendingRestores.delete(token)
    }
  }

  const token = randomUUID()
  pendingRestores.set(token, {
    context,
    provider: activeProvider,
    latestSave: JSON.stringify(latestSave),
    fingerprint
  })

  return token
}
